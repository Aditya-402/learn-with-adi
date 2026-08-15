/* Learn with Adi — in-page Python practice runner (Pyodide).
   Zero-install: real CPython compiled to WebAssembly, loaded lazily from the
   jsDelivr CDN the first time a student presses Run (≈6 MB, cached after that).

   Execution happens in a Web Worker so a runaway loop can never freeze the
   page: each run has a time budget, and on timeout the worker is terminated
   (and rebooted lazily on the next Run) with a friendly infinite-loop hint.

   Markup contract — pyrun.js enhances every  <div class="pyrun">…</div>  block:

     <div class="pyrun"
          data-id="p3"                 (optional — stable id for the solved-tick;
                                        defaults to its index on the page)
          data-expect="Hello, Ada"     (optional — expected stdout enables the
                                        ✓ Check button; "\n" splits lines)
          data-stdin="Ada"             (optional — shows a "program input" box,
                                        one line per input() call; "\n" splits)
          data-stdin-lock              (optional — input box read-only, so checks
                                        can't be dodged by editing the input)>
       <textarea spellcheck="false">print("Hello")</textarea>
     </div>

   Solved state is stored per unit in localStorage under
   "lwa-pyrun::<course>::<chapter>" and re-rendered on load. */
(function () {
  "use strict";

  var PYODIDE_URL = "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js";
  var INDEX_URL = PYODIDE_URL.replace(/pyodide\.js$/, "");
  var RUN_TIMEOUT_MS = 12000;   // per-run budget once Python is booted
  var BOOT_TIMEOUT_MS = 120000; // download + boot budget (slow connections)

  var body = document.body;
  var COURSE = body.getAttribute("data-lwa-course") || "any";
  var UNIT = body.getAttribute("data-lwa-chapter") || "any";
  var LS_KEY = "lwa-pyrun::" + COURSE + "::" + UNIT;

  var blocks = [].slice.call(document.querySelectorAll(".pyrun"));
  if (!blocks.length) return;

  /* ---------------- styles ---------------- */
  var css = "\
.pyrun{background:var(--panel,#fff);border:1px solid var(--line,#e3e6ee);border-radius:12px;overflow:hidden}\
.pyrun.ok{border-color:var(--teal,#2b7a78)}\
.pyrun .pr-bar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:8px 12px;\
  border-bottom:1px solid var(--line,#e3e6ee);background:var(--subtle,#f0f1f7)}\
.pyrun .pr-bar .sp{flex:1}\
.pyrun .pr-btn{font:inherit;font-size:var(--fs-sm,13px);font-weight:600;cursor:pointer;\
  border:1px solid var(--line,#e3e6ee);border-radius:8px;padding:6px 14px;\
  background:var(--panel,#fff);color:var(--ink,#1f2733);transition:border-color .15s}\
.pyrun .pr-btn:hover{border-color:var(--accent,#5b4b9e)}\
.pyrun .pr-btn.run{background:var(--accent,#5b4b9e);border-color:var(--accent,#5b4b9e);color:#fff}\
.pyrun .pr-btn.run:hover{background:var(--accent-deep,#3d3170)}\
.pyrun .pr-btn:disabled{opacity:.45;cursor:default}\
.pyrun .pr-st{font-size:var(--fs-xs,12px);color:var(--muted,#6b7585)}\
.pyrun .pr-st.ok{color:var(--teal,#2b7a78);font-weight:700}\
.pyrun .pr-st.no{color:var(--clay,#a35a33);font-weight:700}\
.pyrun textarea{display:block;width:100%;border:none;border-radius:0;background:var(--panel,#fff);\
  font-family:var(--mono,ui-monospace,monospace);font-size:var(--fs-cap,14px);line-height:1.7;\
  color:var(--ink,#1f2733);padding:14px 16px;resize:vertical;min-height:52px;box-sizing:border-box}\
.pyrun textarea:focus{outline:none;background:#fdfdff}\
.pyrun .pr-in{display:flex;align-items:center;gap:10px;padding:8px 16px;\
  border-top:1px dashed var(--line,#e3e6ee);background:var(--subtle,#f0f1f7)}\
.pyrun .pr-in label{font-size:var(--fs-xs,12px);letter-spacing:.09em;text-transform:uppercase;\
  font-weight:700;color:var(--muted,#6b7585);white-space:nowrap}\
.pyrun .pr-in input{flex:1;font-family:var(--mono,ui-monospace,monospace);font-size:var(--fs-sm,13px);\
  border:1px solid var(--line,#e3e6ee);border-radius:7px;padding:6px 10px;background:var(--panel,#fff);color:var(--ink,#1f2733)}\
.pyrun .pr-in input:read-only{background:var(--subtle,#f0f1f7);color:var(--muted,#6b7585)}\
.pyrun .pr-out{display:none;border-top:1px solid var(--line,#e3e6ee);background:#23262e;color:#e8eaf0;\
  font-family:var(--mono,ui-monospace,monospace);font-size:var(--fs-sm,13px);line-height:1.65;\
  padding:12px 16px;white-space:pre-wrap;word-break:break-word;max-height:300px;overflow:auto}\
.pyrun .pr-out.show{display:block}\
.pyrun .pr-out .err{color:#ffb3a0}\
.pyrun .pr-out .hint{color:#9aa3b5;font-style:italic}\
";
  var st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);

  /* ---------------- solved state ---------------- */
  function loadSolved() { try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch (e) { return {}; } }
  function saveSolved(o) { try { localStorage.setItem(LS_KEY, JSON.stringify(o)); } catch (e) {} }
  var solved = loadSolved();

  /* ---------------- worker-based executor ---------------- */
  var PREAMBLE = [
    "import builtins",
    "_lwa_stdin = []",
    "def _lwa_set_stdin(lines):",
    "    global _lwa_stdin",
    "    _lwa_stdin = [str(x) for x in lines]",
    "def _lwa_input(prompt=''):",
    "    print(prompt, end='')",
    "    v = _lwa_stdin.pop(0) if _lwa_stdin else ''",
    "    print(v)",
    "    return v",
    "builtins.input = _lwa_input"
  ].join("\n");

  var WORKER_SRC =
    'importScripts(' + JSON.stringify(PYODIDE_URL) + ');\n' +
    'var pyReady = loadPyodide({indexURL:' + JSON.stringify(INDEX_URL) + '}).then(function(py){\n' +
    '  py.runPython(' + JSON.stringify(PREAMBLE) + ');\n' +
    '  postMessage({type:"ready"});\n' +
    '  return py;\n' +
    '}).catch(function(e){ postMessage({type:"bootfail", err:String(e && e.message || e)}); });\n' +
    'onmessage = function(ev){\n' +
    '  var msg = ev.data;\n' +
    '  pyReady.then(function(py){\n' +
    '    if (!py) return;\n' +
    '    py.globals.get("_lwa_set_stdin")(py.toPy(msg.stdin || []));\n' +
    '    var buf = [];\n' +
    '    py.setStdout({batched:function(s){ buf.push(s); }});\n' +
    '    py.setStderr({batched:function(s){ buf.push(s); }});\n' +
    '    var err = null;\n' +
    // fresh namespace per run so one problem never leaks boxes into the next
    '    try { py.runPython(msg.code, {globals: py.toPy({})}); }\n' +
    '    catch (e) { err = String(e && e.message || e); }\n' +
    '    py.setStdout(); py.setStderr();\n' +
    '    postMessage({type:"result", id: msg.id, ok: !err, text: buf.join("\\n"), err: err});\n' +
    '  });\n' +
    '};\n';

  var worker = null, workerReady = null, seq = 0, pending = {};

  function killWorker() {
    if (worker) { try { worker.terminate(); } catch (e) {} }
    worker = null; workerReady = null;
    for (var k in pending) { pending[k].reject(new Error("__killed__")); }
    pending = {};
  }

  function ensureWorker(onStatus) {
    if (workerReady) return workerReady;
    onStatus("Loading Python … first time only (about 6 MB)");
    workerReady = new Promise(function (resolve, reject) {
      var blob = new Blob([WORKER_SRC], { type: "application/javascript" });
      var w = new Worker(URL.createObjectURL(blob));
      var bootTimer = setTimeout(function () {
        killWorker();
        reject(new Error("Python took too long to download. Check your connection and press Run again."));
      }, BOOT_TIMEOUT_MS);
      w.onmessage = function (ev) {
        var m = ev.data || {};
        if (m.type === "ready") { clearTimeout(bootTimer); worker = w; resolve(w); }
        else if (m.type === "bootfail") {
          clearTimeout(bootTimer); killWorker();
          reject(new Error("Could not start Python: " + m.err));
        } else if (m.type === "result" && pending[m.id]) {
          var p = pending[m.id]; delete pending[m.id];
          clearTimeout(p.timer); p.resolve(m);
        }
      };
      w.onerror = function (e) {
        clearTimeout(bootTimer); killWorker();
        reject(new Error("Could not download Python. Check your connection and try again."));
      };
    });
    return workerReady;
  }

  function runInWorker(code, stdin, onStatus) {
    return ensureWorker(onStatus).then(function (w) {
      onStatus("Running …");
      return new Promise(function (resolve, reject) {
        var id = ++seq;
        pending[id] = {
          resolve: resolve,
          reject: reject,
          timer: setTimeout(function () {
            delete pending[id];
            killWorker(); // a stuck run can only be stopped by terminating the worker
            reject(new Error("__timeout__"));
          }, RUN_TIMEOUT_MS)
        };
        w.postMessage({ id: id, code: code, stdin: stdin });
      });
    });
  }

  /* Keep only the traceback lines a beginner can act on: their own frames and
     the final diagnosis. Interpreter-internal frames are dropped together with
     the source and caret lines that belong to them, so no orphaned ^^^^ marks
     are left behind. */
  var FRAME = /^\s*File "/;
  var FINAL = /^[A-Za-z_][\w.]*(Error|Exception|Warning|Exit|Interrupt)\b/;
  var INTERNAL = /File "\/lib\/|_pyodide|pyodide\.|importlib|^\s*exec\(|<frozen /;

  function cleanTraceback(msg) {
    var lines = String(msg).replace(/\r/g, "").split("\n");
    var out = [];
    for (var i = 0; i < lines.length; i++) {
      var L = lines[i];
      if (INTERNAL.test(L)) {
        // skip this frame and everything under it until the next frame/diagnosis
        while (i + 1 < lines.length && !FRAME.test(lines[i + 1]) && !FINAL.test(lines[i + 1])) i++;
        continue;
      }
      out.push(L.replace(/File "<exec>", /g, "").replace(/File "<string>", /g, ""));
    }
    return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  function normalize(s) {
    return String(s).replace(/\r/g, "").split("\n")
      .map(function (l) { return l.replace(/\s+$/, ""); })
      .join("\n").replace(/\n+$/, "").replace(/^\n+/, "");
  }

  /* ---------------- enhance each block ---------------- */
  blocks.forEach(function (box, idx) {
    var ta = box.querySelector("textarea");
    if (!ta) return;
    var id = box.getAttribute("data-id") || ("p" + idx);
    var expect = box.getAttribute("data-expect");
    if (expect != null) expect = expect.replace(/\\n/g, "\n");
    var stdin0 = box.getAttribute("data-stdin");
    var original = ta.value.replace(/^\n+/, "");
    ta.value = original;
    autosize(ta);

    var bar = document.createElement("div");
    bar.className = "pr-bar";
    bar.innerHTML =
      "<button type='button' class='pr-btn run'>&#9654; Run</button>" +
      (expect != null ? "<button type='button' class='pr-btn chk'>&#10003; Check</button>" : "") +
      "<button type='button' class='pr-btn rst' title='Restore the starting code'>&#8635; Reset</button>" +
      "<span class='sp'></span><span class='pr-st'></span>";
    box.insertBefore(bar, ta);

    var stat = bar.querySelector(".pr-st");
    var out = document.createElement("div");
    out.className = "pr-out";
    box.appendChild(out);

    var stdinInput = null;
    if (stdin0 != null) {
      var wrap = document.createElement("div");
      wrap.className = "pr-in";
      wrap.innerHTML = "<label>Program input</label>";
      stdinInput = document.createElement("input");
      stdinInput.type = "text";
      stdinInput.value = stdin0.replace(/\\n/g, " ⏎ ");
      stdinInput.title = "What the program's input() calls receive, in order. ⏎ separates answers.";
      if (box.hasAttribute("data-stdin-lock")) stdinInput.readOnly = true;
      wrap.appendChild(stdinInput);
      box.insertBefore(wrap, out);
    }

    function stdinLines() {
      if (!stdinInput) return [];
      return stdinInput.value.split("⏎").map(function (s) { return s.trim(); });
    }

    if (solved[id]) markOk(false);

    function markOk(fresh) {
      box.classList.add("ok");
      stat.className = "pr-st ok";
      stat.textContent = fresh ? "✓ Correct — well done" : "✓ Solved earlier";
    }

    function exec() {
      var code = ta.value;
      out.classList.add("show");
      out.textContent = "";
      var setStatus = function (m) { stat.className = "pr-st"; stat.textContent = m; };
      return runInWorker(code, stdinLines(), setStatus)
        .then(function (r) {
          if (!r.ok) {
            out.innerHTML = "";
            if (r.text) out.appendChild(document.createTextNode(r.text + "\n"));
            var es = document.createElement("span");
            es.className = "err";
            es.textContent = cleanTraceback(r.err);
            out.appendChild(es);
            var hint = document.createElement("div");
            hint.className = "hint";
            hint.textContent = "An error is Python talking to you, not judging you — read its last line first.";
            out.appendChild(hint);
            stat.className = "pr-st no"; stat.textContent = "Error — read the message below";
            return { ok: false, text: r.text };
          }
          out.textContent = r.text.length ? r.text : "(the program ran, but printed nothing)";
          if (!box.classList.contains("ok")) { stat.className = "pr-st"; stat.textContent = "Ran ✓"; }
          return { ok: true, text: r.text };
        })
        .catch(function (e) {
          var msg = String(e && e.message || e);
          out.classList.add("show");
          if (msg === "__timeout__") {
            out.innerHTML = "";
            var es2 = document.createElement("span");
            es2.className = "err";
            es2.textContent = "Stopped: the program ran for more than " + (RUN_TIMEOUT_MS / 1000) + " seconds.";
            out.appendChild(es2);
            var h2 = document.createElement("div");
            h2.className = "hint";
            h2.textContent = "That usually means a loop that never ends — check the condition that is supposed to stop it. Just press Run again when you've fixed it (Python reloads automatically).";
            out.appendChild(h2);
            stat.className = "pr-st no"; stat.textContent = "Stopped — probably an endless loop";
          } else if (msg === "__killed__") {
            out.textContent = "";
            stat.className = "pr-st"; stat.textContent = "";
          } else {
            out.textContent = msg;
            stat.className = "pr-st no"; stat.textContent = "Could not run";
          }
          return { ok: false, text: "" };
        });
    }

    bar.querySelector(".run").onclick = exec;
    bar.querySelector(".rst").onclick = function () {
      ta.value = original; autosize(ta);
      out.classList.remove("show");
      if (!box.classList.contains("ok")) { stat.className = "pr-st"; stat.textContent = ""; }
    };
    var chk = bar.querySelector(".chk");
    if (chk) chk.onclick = function () {
      exec().then(function (r) {
        if (!r.ok) return;
        if (normalize(r.text) === normalize(expect)) {
          markOk(true);
          solved[id] = true; saveSolved(solved);
          document.dispatchEvent(new CustomEvent("lwa:pyrun-solved", { detail: { id: id } }));
        } else {
          stat.className = "pr-st no";
          stat.textContent = "Not yet — compare your output with what was asked";
        }
      });
    };

    /* editor niceties: Ctrl+Enter runs, Tab indents 4 spaces */
    ta.addEventListener("keydown", function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); exec(); }
      else if (e.key === "Tab") {
        e.preventDefault();
        var s = ta.selectionStart, epos = ta.selectionEnd;
        ta.value = ta.value.slice(0, s) + "    " + ta.value.slice(epos);
        ta.selectionStart = ta.selectionEnd = s + 4;
      }
    });
    ta.addEventListener("input", function () { autosize(ta); });
  });

  function autosize(ta) {
    var lines = ta.value.split("\n").length;
    ta.style.height = "auto";
    ta.rows = Math.max(2, Math.min(24, lines));
  }
})();
