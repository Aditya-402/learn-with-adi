/* Learn with Adi - unit switcher + position indicator.
   A unit page could only reach its two neighbours; getting to unit 17 meant
   going up to the hub and hunting through a 26-row list. This puts every unit
   one click away from anywhere, and says where you are in the series.

   Drop-in: include after progress.js. It reads data-lwa-chapter off <body>. */
(function () {
  "use strict";
  var UNITS = [
    {n:1, t:"Your first conversation with a computer", lvl:"Beginner · Foundations"},
    {n:2, t:"Remembering things — variables & numbers", lvl:"Beginner · Foundations"},
    {n:3, t:"Making decisions — comparisons & if/else", lvl:"Beginner · Foundations"},
    {n:4, t:"Doing it again — loops", lvl:"Beginner · Foundations"},
    {n:5, t:"Many things at once — lists", lvl:"Beginner · Foundations"},
    {n:6, t:"Labeled data — dictionaries, tuples & sets", lvl:"Beginner · Foundations"},
    {n:7, t:"Packaging logic — functions", lvl:"Beginner · Foundations"},
    {n:8, t:"Words & text — strings properly", lvl:"Beginner · Foundations"},
    {n:9, t:"When things break — errors & debugging", lvl:"Beginner · Foundations"},
    {n:10, t:"Saving your work — files", lvl:"Beginner · Foundations"},
    {n:11, t:"Borrowing power — modules & the standard library", lvl:"Beginner · Foundations"},
    {n:12, t:"The Pythonic loop — comprehensions", lvl:"Beginner · Foundations"},
    {n:13, t:"Classes I — why objects", lvl:"Intermediate · Object-oriented Python"},
    {n:14, t:"Classes II — objects that feel native", lvl:"Intermediate · Object-oriented Python"},
    {n:15, t:"Classes III — inheritance & composition", lvl:"Intermediate · Object-oriented Python"},
    {n:16, t:"Classes IV — properties & encapsulation", lvl:"Intermediate · Object-oriented Python"},
    {n:17, t:"Iterators & the iteration protocol", lvl:"Advanced · The subtle machinery"},
    {n:18, t:"Generators & laziness", lvl:"Advanced · The subtle machinery"},
    {n:19, t:"Functions as values", lvl:"Advanced · The subtle machinery"},
    {n:20, t:"Decorators & context managers", lvl:"Advanced · The subtle machinery"},
    {n:21, t:"NumPy — arrays that compute", lvl:"Bridge · Python for ML & DL"},
    {n:22, t:"pandas — tables of data", lvl:"Bridge · Python for ML & DL"},
    {n:23, t:"matplotlib & seaborn — seeing your data", lvl:"Bridge · Python for ML & DL"},
    {n:24, t:"scikit-learn — the shape of an ML library", lvl:"Bridge · Python for ML & DL"},
    {n:25, t:"PyTorch — first contact", lvl:"Bridge · Python for ML & DL"},
    {n:26, t:"Keras — first contact & the grammar compared", lvl:"Bridge · Python for ML & DL"}
  ];

  var body = document.body;
  if (body.getAttribute("data-lwa-course") !== "python-programming") return;
  var cur = parseInt((body.getAttribute("data-lwa-chapter") || "").replace(/^u/, ""), 10);
  if (!cur) return;

  var css = [
".uswitch{position:relative;display:inline-flex}",
".uswitch>button{display:inline-flex;align-items:center;gap:8px;font:inherit;cursor:pointer;",
"  background:var(--panel,#fff);border:1px solid var(--line,#e3e6ee);border-radius:9px;",
"  padding:6px 12px;font-size:var(--fs-sm,13px);font-weight:600;color:var(--ink,#1f2733)}",
".uswitch>button:hover{border-color:var(--accent,#5b4b9e);color:var(--accent-deep,#3d3170)}",
".uswitch>button .pos{color:var(--muted,#6b7585);font-weight:500}",
".uswitch>button .car{font-size:10px;color:var(--muted,#6b7585)}",
".uswitch .menu{position:absolute;top:calc(100% + 8px);right:0;z-index:600;width:min(460px,88vw);",
"  max-height:min(560px,72vh);overflow:auto;background:var(--panel,#fff);",
"  border:1px solid var(--line,#e3e6ee);border-radius:14px;box-shadow:0 14px 44px rgba(31,39,51,.20);",
"  padding:6px;display:none}",
".uswitch.open .menu{display:block}",
".uswitch .grp{font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;font-weight:700;",
"  color:var(--muted,#6b7585);padding:11px 12px 5px}",
".uswitch a{display:grid;grid-template-columns:26px 1fr;gap:10px;align-items:baseline;",
"  padding:7px 12px;border-radius:9px;text-decoration:none;color:var(--ink,#1f2733);font-size:13.5px}",
".uswitch a:hover{background:var(--subtle,#f0f1f7)}",
".uswitch a .n{font-family:var(--mono,monospace);font-size:12px;color:var(--muted,#6b7585);text-align:right}",
".uswitch a.on{background:var(--accent-wash,#ecebf6);color:var(--accent-deep,#3d3170);font-weight:600}",
".uswitch a.on .n{color:var(--accent,#5b4b9e)}",
".uswitch a .done{color:var(--teal,#2b7a78);font-weight:700}",
".uprog{display:flex;align-items:center;gap:9px;font-size:var(--fs-xs,12px);color:var(--muted,#6b7585);",
"  margin:-6px 0 14px}",
".uprog .bar{width:130px;height:5px;border-radius:99px;background:var(--subtle,#f0f1f7);",
"  border:1px solid var(--line,#e3e6ee);overflow:hidden}",
".uprog .bar i{display:block;height:100%;background:var(--accent,#5b4b9e)}",
"@media(max-width:720px){.uprog .bar{display:none}.uswitch .menu{right:auto;left:0}}"
].join("\n");
  var st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);

  /* which units has the reader finished? same store the journey strip uses */
  var done = {};
  try {
    var d = (JSON.parse(localStorage.getItem("lwa-progress-v1") || "{}") || {})["python-programming"] || {};
    Object.keys(d).forEach(function (k) { if (d[k] && d[k].c) done[k] = true; });
  } catch (e) {}

  var meta = UNITS.filter(function (u) { return u.n === cur; })[0] || { t: "", lvl: "" };

  var wrap = document.createElement("div");
  wrap.className = "uswitch";
  wrap.innerHTML =
    '<button type="button" aria-haspopup="true" aria-expanded="false">' +
      "Unit " + cur + ' <span class="pos">of ' + UNITS.length + '</span> <span class="car">\u25BC</span>' +
    '</button><div class="menu" role="menu"></div>';

  var menu = wrap.querySelector(".menu"), btn = wrap.querySelector("button");
  var lastLvl = null, html = "";
  UNITS.forEach(function (u) {
    if (u.lvl !== lastLvl) { html += '<div class="grp">' + u.lvl + "</div>"; lastLvl = u.lvl; }
    var k = "u" + (u.n < 10 ? "0" + u.n : u.n);
    html += '<a href="unit' + u.n + '.html"' + (u.n === cur ? ' class="on" aria-current="true"' : "") + ">" +
              '<span class="n">' + u.n + "</span>" +
              "<span>" + u.t + (done[k] ? ' <span class="done">\u2713</span>' : "") + "</span></a>";
  });
  menu.innerHTML = html;

  btn.addEventListener("click", function (e) {
    e.stopPropagation();
    var open = wrap.classList.toggle("open");
    btn.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) { var on = menu.querySelector("a.on"); if (on) menu.scrollTop = Math.max(0, on.offsetTop - 120); }
  });
  document.addEventListener("click", function (e) {
    if (!wrap.contains(e.target)) { wrap.classList.remove("open"); btn.setAttribute("aria-expanded", "false"); }
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { wrap.classList.remove("open"); btn.setAttribute("aria-expanded", "false"); }
  });

  /* the switcher goes where the series tag already lives */
  var host = document.querySelector(".lwa-brand-right");
  if (host) host.insertBefore(wrap, host.firstChild);

  /* and a quiet "where am I" line under the eyebrow */
  var eyebrow = document.querySelector(".eyebrow");
  if (eyebrow) {
    var p = document.createElement("div");
    p.className = "uprog";
    var pct = Math.round(100 * cur / UNITS.length);
    p.innerHTML = "<span>Unit " + cur + " of " + UNITS.length + " \u00b7 " + meta.lvl + "</span>" +
                  '<span class="bar"><i style="width:' + pct + '%"></i></span>';
    eyebrow.parentNode.insertBefore(p, eyebrow.nextSibling);
  }
})();
