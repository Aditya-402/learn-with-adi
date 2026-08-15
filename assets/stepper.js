/* Learn with Adi — two-mode unit presentation.
   "Step through" (default): one scaffold at a time — a ~5-minute read + diagram + lab —
   with a progress path, Continue/Back, and per-step completion ticks.
   "Read as one page": the classic full scroll, for reference and rereading.
   Works off the existing DOM (main > section = steps); preference and per-unit
   step progress live in localStorage. */
(function () {
  "use strict";
  const body = document.body;
  const COURSE = body.getAttribute("data-lwa-course"), UNIT = body.getAttribute("data-lwa-chapter");
  if (!COURSE || !UNIT) return;
  const main = document.querySelector("main");
  if (!main) return;
  const steps = [...main.querySelectorAll(":scope > section")];
  if (steps.length < 3) return;

  const MODE_LS = "lwa-view-mode";                   // global preference
  const ST_LS = "lwa-steps::" + COURSE + "::" + UNIT; // per-unit progress

  /* ---------------- styles ---------------- */
  const css = `
  body.step-mode main > section{display:none}
  body.step-mode main > section.step-on{display:flex}
  body.step-mode .lwa-chapnav{display:none}
  body.step-mode.step-last .lwa-chapnav{display:flex}
  .stepbar{display:flex;align-items:center;gap:14px;flex-wrap:wrap;background:var(--panel,#fff);
    border:1px solid var(--line,#e3e6ee);border-radius:12px;padding:10px 16px;margin-bottom:6px}
  .stepbar .dots{display:flex;gap:5px;align-items:center;flex-wrap:wrap}
  .stepbar .dot{width:10px;height:10px;border-radius:50%;background:var(--subtle,#f0f1f7);
    border:1.5px solid var(--line,#e3e6ee);cursor:pointer;padding:0}
  .stepbar .dot.done{background:var(--teal,#2b7a78);border-color:var(--teal,#2b7a78)}
  .stepbar .dot.cur{background:var(--accent,#5b4b9e);border-color:var(--accent-deep,#3d3170);transform:scale(1.25)}
  .stepbar .lbl{font-size:var(--fs-sm,13px);color:var(--slate,#4a5a72)}
  .stepbar .lbl b{color:var(--ink,#1f2733)}
  .stepbar .sp{flex:1}
  .stepbar .mode{border:1px solid var(--line,#e3e6ee);background:var(--subtle,#f0f1f7);border-radius:999px;
    padding:5px 13px;font-size:var(--fs-xs,12px);font-weight:600;color:var(--slate,#4a5a72);cursor:pointer}
  .stepbar .mode:hover{border-color:var(--accent,#5b4b9e);color:var(--accent-deep,#3d3170)}
  body:not(.step-mode) .stepbar .dots,body:not(.step-mode) .stepbar .lbl{display:none}
  .stepnav{display:flex;justify-content:space-between;gap:12px;margin-top:8px}
  .stepnav button{border:1px solid var(--line,#e3e6ee);border-radius:12px;padding:13px 22px;cursor:pointer;
    font:inherit;font-size:var(--fs-cap,14px);font-weight:600;background:var(--panel,#fff);color:var(--ink,#1f2733)}
  .stepnav button:hover{border-color:var(--accent,#5b4b9e)}
  .stepnav .go{background:var(--accent,#5b4b9e);border-color:var(--accent,#5b4b9e);color:#fff;flex:1;max-width:340px;text-align:center}
  .stepnav .go:hover{background:var(--accent-deep,#3d3170)}
  .stepnav .back[disabled]{opacity:.35;cursor:default}
  .rail a .tick{color:var(--teal,#2b7a78);font-weight:700}
  @media (max-width:640px){.stepbar{padding:9px 12px}.stepbar .lbl{display:none}}
  `;
  const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);

  /* ---------------- state ---------------- */
  function loadSt() { try { return JSON.parse(localStorage.getItem(ST_LS)) || {}; } catch { return {}; } }
  function saveSt(o) { try { localStorage.setItem(ST_LS, JSON.stringify(o)); } catch {} }
  let stt = loadSt();               // {cur:idx, done:[idx,...]}
  let cur = Number.isInteger(stt.cur) ? Math.min(stt.cur, steps.length - 1) : 0;
  let done = new Set(stt.done || []);
  const getMode = () => { try { return localStorage.getItem(MODE_LS) || "step"; } catch { return "step"; } };
  const setModeLS = m => { try { localStorage.setItem(MODE_LS, m); } catch {} };

  /* ---------------- step metadata ---------------- */
  const railLinks = [...document.querySelectorAll(".rail a")];
  function labelOf(sec, i) {
    if (sec.id) { const a = railLinks.find(a => a.getAttribute("href") === "#" + sec.id); if (a) return a.textContent.trim(); }
    const h = sec.querySelector("h2,h3"); return h ? h.textContent.trim() : "Step " + (i + 1);
  }
  function minutesOf(sec) {
    const words = (sec.textContent || "").split(/\s+/).length;
    let m = words / 190;
    if (sec.querySelector(".lab")) m += 2.5;       // play time
    return Math.max(1, Math.round(m));
  }
  const META = steps.map((s, i) => ({ label: labelOf(s, i), mins: minutesOf(s) }));

  /* ---------------- UI: bar + nav ---------------- */
  const bar = document.createElement("div");
  bar.className = "stepbar";
  main.prepend(bar);

  const nav = document.createElement("div");
  nav.className = "stepnav";
  nav.innerHTML = `<button type="button" class="back">← Back</button><button type="button" class="go">Continue →</button>`;

  function render() {
    const mode = getMode();
    body.classList.toggle("step-mode", mode === "step");
    body.classList.toggle("step-last", cur === steps.length - 1);
    // bar
    bar.innerHTML =
      `<div class="dots">${steps.map((_, i) =>
        `<button type="button" class="dot${done.has(i) ? " done" : ""}${i === cur ? " cur" : ""}" title="${META[i].label}" aria-label="Go to: ${META[i].label}"></button>`).join("")}</div>` +
      `<span class="lbl">Step <b>${cur + 1}</b> of ${steps.length} · <b>${META[cur].label}</b> · ~${META[cur].mins} min</span>` +
      `<span class="sp"></span>` +
      `<button type="button" class="mode">${mode === "step" ? "☰ Read as one page" : "▣ Step through this unit"}</button>`;
    bar.querySelectorAll(".dot").forEach((d, i) => d.onclick = () => go(i));
    bar.querySelector(".mode").onclick = () => { setModeLS(getMode() === "step" ? "read" : "step"); render(); window.scrollTo({ top: 0 }); };

    if (mode === "step") {
      steps.forEach((s, i) => s.classList.toggle("step-on", i === cur));
      const on = steps[cur];
      if (nav.parentElement !== on) on.appendChild(nav);
      nav.querySelector(".back").disabled = cur === 0;
      nav.querySelector(".go").textContent = cur === steps.length - 1 ? "Finish unit ✓" : "Continue →";
    } else {
      steps.forEach(s => s.classList.remove("step-on"));
      if (nav.parentElement) nav.remove();
    }
    // rail ticks + current highlight
    railLinks.forEach(a => {
      const id = (a.getAttribute("href") || "").slice(1);
      const idx = steps.findIndex(s => s.id === id);
      let t = a.querySelector(".tick");
      if (idx >= 0 && done.has(idx)) { if (!t) { t = document.createElement("span"); t.className = "tick"; t.textContent = " ✓"; a.appendChild(t); } }
      else if (t) t.remove();
      if (mode === "step") a.classList.toggle("on", idx === cur);
    });
    saveSt({ cur, done: [...done] });
  }

  function go(i, markDone) {
    if (markDone) done.add(cur);
    cur = Math.max(0, Math.min(steps.length - 1, i));
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  nav.querySelector(".back").onclick = () => go(cur - 1);
  nav.querySelector(".go").onclick = () => {
    if (cur === steps.length - 1) {
      done.add(cur); render();
      const btn = document.querySelector("[data-lwa-complete]");
      if (btn && !btn.classList.contains("is-done")) btn.click();   // feed the journey
      setModeLS("read"); render();                                  // land on the full page
      const cn = document.querySelector(".lwa-chapnav");
      if (cn) cn.scrollIntoView({ behavior: "smooth" });
    } else go(cur + 1, true);
  };

  // rail clicks navigate steps while in step mode
  document.querySelectorAll(".rail a").forEach(a => a.addEventListener("click", e => {
    if (getMode() !== "step") return;
    const idx = steps.findIndex(s => s.id === (a.getAttribute("href") || "").slice(1));
    if (idx >= 0) { e.preventDefault(); go(idx); }
  }));

  // deep links open at that step
  if (location.hash) {
    const idx = steps.findIndex(s => "#" + s.id === location.hash);
    if (idx >= 0) cur = idx;
  }

  // keep our rail highlight winning over the page's scrollspy while stepping
  let tick = false;
  addEventListener("scroll", () => {
    if (getMode() !== "step" || tick) return; tick = true;
    requestAnimationFrame(() => {
      railLinks.forEach(a => {
        const idx = steps.findIndex(s => s.id === (a.getAttribute("href") || "").slice(1));
        a.classList.toggle("on", idx === cur);
      });
      tick = false;
    });
  }, { passive: true });

  render();
})();
