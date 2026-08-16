/* Spark ✨ — the Learn with Adi study buddy.
   Self-contained widget for unit pages:
   - animated character button (idle / listening / thinking / speaking)
   - chat panel; typed or spoken questions (Web Speech STT), spoken answers (TTS with pause/resume/stop)
   - highlight any text on the page → "Ask Spark" chip → the highlight becomes context
   - brain: Google Gemini with the STUDENT'S OWN API key (BYOK). The key lives in
     localStorage only and is sent only to Google's API together with the question
     and the relevant sections of THIS unit. No servers of ours involved.
   - strictly grounded: Spark answers only from this unit's content + the highlight. */
(function () {
  "use strict";
  if (!document.body.hasAttribute("data-lwa-course")) return; // unit pages only

  const KEY_LS = "lwa-gemini-key";
  const CFG_LS = "lwa-spark-settings";
  const UNIT_TITLE = document.body.getAttribute("data-lwa-title") || document.title;

  /* ---- student-tunable settings ----
     Answers vary via the system prompt (level & length). The model IS choosable —
     Google deprecates models over time, so the dropdown is populated LIVE from the
     ListModels API with the student's key; the default is always the cheapest
     (flash-lite family) available to that key. */
  const FALLBACK_MODELS = ["gemini-2.5-flash-lite", "gemini-2.5-flash", "gemini-2.5-pro"];
  const MODELS_LS = "lwa-gemini-models";

  function modelRank(name) { // lower = cheaper = preferred default
    const v = (name.match(/(\d+(?:\.\d+)?)/) || [0, 0])[1];
    const ver = parseFloat(v) || 0;
    if (/flash-lite/.test(name)) return 0 - ver / 100;
    if (/flash/.test(name)) return 1 - ver / 100;
    if (/pro/.test(name)) return 2 - ver / 100;
    return 3 - ver / 100;
  }
  function cheapestOf(list) { return list.slice().sort((a, b) => modelRank(a) - modelRank(b))[0]; }
  function cachedModels() {
    try { const l = JSON.parse(localStorage.getItem(MODELS_LS)); if (Array.isArray(l) && l.length) return l; } catch {}
    return FALLBACK_MODELS.slice();
  }
  async function fetchModels() {
    const key = getKey(); if (!key) return cachedModels();
    try {
      const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=50&key=" + encodeURIComponent(key));
      if (!res.ok) throw 0;
      const data = await res.json();
      const list = (data.models || [])
        .filter(m => (m.supportedGenerationMethods || []).includes("generateContent"))
        .map(m => m.name.replace(/^models\//, ""))
        .filter(n => /^gemini/.test(n) && !/(embedding|aqa|tts|image|live|audio|exp|preview)/.test(n));
      if (list.length) { try { localStorage.setItem(MODELS_LS, JSON.stringify(list)); } catch {} return list; }
    } catch {}
    return cachedModels();
  }
  const LEVELS = {
    explorer:  { name: "Little explorer", hint: "explain like I'm five",
      prompt: "Explain as if to a curious five-year-old: everyday objects and stories only (toys, paint, queues at a shop), zero jargon, zero equations. One idea at a time, warm and playful." },
    school:    { name: "High-schooler", hint: "simple words, everyday analogies",
      prompt: "Explain for a high-school student: simple words, everyday analogies, at most arithmetic-level maths. Define any technical word the moment you use it." },
    graduate:  { name: "Fresh graduate", hint: "the notes' default voice",
      prompt: "Explain for a fresh engineering graduate: plain words, a concrete analogy or tiny numeric example over abstraction, light maths is fine." },
    practitioner: { name: "Practitioner", hint: "precise and technical",
      prompt: "Explain for a working ML engineer: precise technical language, refer to tensor shapes and the code directly, minimal hand-holding, analogies only when they genuinely sharpen the point." },
    expert:    { name: "Expert", hint: "terse and dense",
      prompt: "Explain for an expert: terse, dense, assume strong ML background, use standard terminology freely, skip analogies unless asked. Get to the core mechanism immediately." }
  };
  const LENGTHS = {
    brief:    { name: "Brief", hint: "~2–3 sentences", prompt: "Keep answers very short — around 50 words, never more than 80.", maxTokens: 600 },
    balanced: { name: "Balanced", hint: "~a paragraph", prompt: "Keep answers short — usually under 120 words.", maxTokens: 1500 },
    detailed: { name: "Detailed", hint: "step by step", prompt: "Answer thoroughly — walk through it step by step, up to ~300 words when the question deserves it.", maxTokens: 3000 }
  };
  const DEFAULT_CFG = { level: "graduate", length: "balanced" };
  function getCfg() {
    try { const c = JSON.parse(localStorage.getItem(CFG_LS)) || {}; return Object.assign({}, DEFAULT_CFG, c); }
    catch { return Object.assign({}, DEFAULT_CFG); }
  }
  function setCfg(c) { try { localStorage.setItem(CFG_LS, JSON.stringify(c)); } catch {} }

  /* ================= styles ================= */
  const css = `
  .spk-btn{position:fixed;right:20px;bottom:20px;z-index:400;width:58px;height:58px;border-radius:50%;
    background:#fff;border:1.5px solid #d5cfeb;box-shadow:0 4px 18px rgba(91,75,158,.25);cursor:pointer;
    display:flex;align-items:center;justify-content:center;padding:0;transition:transform .15s}
  .spk-btn:hover{transform:scale(1.07)}
  .spk-btn svg{width:38px;height:38px;display:block}
  .spk-panel{position:fixed;right:16px;bottom:88px;z-index:401;width:min(390px,calc(100vw - 24px));
    height:min(600px,calc(100vh - 110px));background:#ffffff;border:1px solid #e3e6ee;border-radius:16px;
    box-shadow:0 12px 40px rgba(31,39,51,.22);display:flex;flex-direction:column;overflow:hidden;
    font-family:'Segoe UI Variable Text','Segoe UI',system-ui,sans-serif;color:#1f2733}
  .spk-head{display:flex;align-items:center;gap:10px;padding:12px 14px;border-bottom:1px solid #e3e6ee;
    background:linear-gradient(#ffffff,#f0f1f7)}
  .spk-head svg{width:30px;height:30px}
  .spk-head b{font-size:15px}
  .spk-head .st{font-size:11px;color:#6b7585}
  .spk-head .sp{flex:1}
  .spk-head button{background:none;border:none;cursor:pointer;color:#6b7585;font-size:13px;padding:4px 7px;border-radius:6px}
  .spk-head button:hover{background:#ecebf6;color:#3d3170}
  .spk-msgs{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:10px;background:#f6f7fb}
  .spk-m{max-width:86%;padding:9px 13px;border-radius:12px;font-size:13.5px;line-height:1.55;white-space:pre-wrap;overflow-wrap:break-word}
  .spk-m.you{align-self:flex-end;background:#5b4b9e;color:#fff;border-bottom-right-radius:4px}
  .spk-m.bot{align-self:flex-start;background:#ffffff;border:1px solid #e3e6ee;border-bottom-left-radius:4px}
  .spk-m.bot .spk-tts{margin-top:7px;padding-top:7px;border-top:1px dashed #e3e6ee;display:flex;gap:6px}
  .spk-m.bot .spk-tts button{font-size:11px;border:1px solid #e3e6ee;background:#f6f7fb;border-radius:99px;
    padding:2px 10px;cursor:pointer;color:#4a5a72}
  .spk-m.bot .spk-tts button:hover{border-color:#5b4b9e;color:#3d3170}
  .spk-m.err{align-self:center;background:#f7ebe4;border:1px solid #e2c4ad;color:#7c4324;font-size:12.5px}
  .spk-chip{margin:0 14px;margin-top:8px;background:#ecebf6;border:1px solid #d5cfeb;border-radius:10px;
    padding:7px 11px;font-size:12px;color:#3d3170;display:flex;gap:8px;align-items:flex-start}
  .spk-chip .t{flex:1;max-height:56px;overflow:hidden}
  .spk-chip button{background:none;border:none;cursor:pointer;color:#6b7585;font-size:13px;padding:0}
  .spk-in{display:flex;gap:8px;padding:12px 14px;border-top:1px solid #e3e6ee;background:#fff;align-items:flex-end}
  .spk-in textarea{flex:1;resize:none;border:1px solid #e3e6ee;border-radius:10px;padding:9px 11px;
    font:inherit;font-size:13.5px;max-height:110px;background:#f6f7fb;color:#1f2733}
  .spk-in textarea:focus{outline:2px solid #5b4b9e;background:#fff}
  .spk-in button{border:none;border-radius:10px;cursor:pointer;padding:9px 12px;font-size:15px}
  .spk-send{background:#5b4b9e;color:#fff}
  .spk-send:hover{background:#3d3170}
  .spk-send:disabled{opacity:.5;cursor:default}
  .spk-mic{background:#f0f1f7;border:1px solid #e3e6ee !important;color:#4a5a72}
  .spk-mic.rec{background:#f7ebe4;border-color:#a35a33 !important;color:#a35a33;animation:spkpulse 1.2s infinite}
  @keyframes spkpulse{50%{box-shadow:0 0 0 6px rgba(163,90,51,.15)}}
  .spk-setup{padding:20px 18px;display:flex;flex-direction:column;gap:12px;font-size:13.5px;color:#4a5a72;overflow-y:auto}
  .spk-setup h4{margin:0;font-size:16px;color:#1f2733;font-family:Georgia,serif}
  .spk-setup ol{margin:0;padding-left:20px;display:flex;flex-direction:column;gap:6px}
  .spk-setup input{border:1px solid #e3e6ee;border-radius:10px;padding:9px 11px;font-family:Consolas,monospace;font-size:12.5px;background:#f6f7fb}
  .spk-setup input:focus{outline:2px solid #5b4b9e;background:#fff}
  .spk-setup .go{background:#5b4b9e;color:#fff;border:none;border-radius:10px;padding:10px;font-size:14px;font-weight:600;cursor:pointer}
  .spk-setup .go:hover{background:#3d3170}
  .spk-setup .note{font-size:11.5px;color:#6b7585;background:#f0f1f7;border-radius:8px;padding:8px 11px}
  .spk-setup a{color:#5b4b9e}
  .spk-lbl{font-size:11px;letter-spacing:.1em;text-transform:uppercase;font-weight:700;color:#6b7585;margin-top:2px}
  .spk-pills{display:flex;flex-wrap:wrap;gap:6px}
  .spk-pills button{flex:1 1 30%;min-width:96px;border:1px solid #e3e6ee;background:#f6f7fb;border-radius:10px;
    padding:7px 9px;cursor:pointer;text-align:left;font-family:inherit}
  .spk-pills button b{display:block;font-size:12px;color:#1f2733}
  .spk-pills button span{font-size:10.5px;color:#6b7585}
  .spk-pills button[aria-pressed="true"]{border-color:#5b4b9e;background:#ecebf6}
  .spk-pills button[aria-pressed="true"] b{color:#3d3170}
  .spk-model{border:1px solid #e3e6ee;border-radius:10px;padding:8px 10px;font:inherit;font-size:12.5px;background:#f6f7fb;color:#1f2733}
  .spk-model:focus{outline:2px solid #5b4b9e;background:#fff}
  .spk-ask{position:absolute;z-index:399;background:#5b4b9e;color:#fff;border:none;border-radius:99px;
    padding:6px 13px;font-size:12.5px;font-weight:600;cursor:pointer;box-shadow:0 4px 14px rgba(91,75,158,.35);
    font-family:'Segoe UI',sans-serif}
  .spk-ask:hover{background:#3d3170}
  /* character animation states */
  .spk-char .core{transform-origin:50% 50%;animation:spkidle 3.2s ease-in-out infinite}
  @keyframes spkidle{0%,100%{transform:scale(1) rotate(0deg)}50%{transform:scale(1.06) rotate(6deg)}}
  .spk-char.listening .core{animation:spklisten .9s ease-in-out infinite}
  @keyframes spklisten{0%,100%{transform:scale(1)}50%{transform:scale(1.14)}}
  .spk-char.thinking .core{animation:spkthink 1.1s linear infinite}
  @keyframes spkthink{100%{transform:rotate(360deg)}}
  .spk-char.speaking .core{animation:spkspeak .45s ease-in-out infinite}
  @keyframes spkspeak{0%,100%{transform:scale(1) rotate(-4deg)}50%{transform:scale(1.09) rotate(4deg)}}
  .spk-char .eye{animation:spkblink 4.5s infinite}
  @keyframes spkblink{0%,94%,100%{transform:scaleY(1)}96%{transform:scaleY(.1)}}
  @media (prefers-reduced-motion:reduce){.spk-char .core,.spk-char .eye,.spk-mic.rec{animation:none !important}}
  `;
  const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);

  const CHAR = (cls) => `
  <svg class="spk-char ${cls}" viewBox="0 0 48 48" aria-hidden="true">
    <g class="core">
      <path d="M24 4 L28.6 19.4 L44 24 L28.6 28.6 L24 44 L19.4 28.6 L4 24 L19.4 19.4 Z"
            fill="#5b4b9e" stroke="#3d3170" stroke-width="1.4" stroke-linejoin="round"/>
      <g class="eye" style="transform-origin:19px 22px"><circle cx="19" cy="22" r="2.1" fill="#fff"/></g>
      <g class="eye" style="transform-origin:29px 22px"><circle cx="29" cy="22" r="2.1" fill="#fff"/></g>
      <path d="M19.5 28 Q24 31.5 28.5 28" stroke="#fff" stroke-width="1.7" fill="none" stroke-linecap="round"/>
    </g>
  </svg>`;

  /* ================= unit content collection ================= */
  function collectSections() {
    const secs = [];
    document.querySelectorAll("main section").forEach(sec => {
      if (sec.id === "quiz") return; // don't hand Spark the quiz answers
      const h = sec.querySelector("h2");
      const title = h ? h.textContent.trim() : "(untitled section)";
      let text = (sec.innerText || "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
      if (text.length > 7000) text = text.slice(0, 7000) + " …";
      if (text) secs.push({ id: sec.id || "", title, text });
    });
    return secs;
  }
  let SECTIONS = null;

  // pick the sections most relevant to the question (keeps the student's token bill low)
  function relevantContext(question, highlight) {
    if (!SECTIONS) SECTIONS = collectSections();
    const words = (question + " " + (highlight || "")).toLowerCase().match(/[a-z_√α-ω]{3,}/g) || [];
    const scored = SECTIONS.map(s => {
      const t = (s.title + " " + s.text).toLowerCase();
      let score = 0; const seen = new Set();
      for (const w of words) { if (!seen.has(w) && t.includes(w)) { score++; seen.add(w); } }
      if (highlight && s.text.includes(highlight.slice(0, 80))) score += 12; // the highlighted section always wins
      return { s, score };
    }).sort((a, b) => b.score - a.score);
    const picked = [];
    let budget = 19000;
    // always lead with the first (intro) section for orientation
    if (SECTIONS[0]) { picked.push(SECTIONS[0]); budget -= SECTIONS[0].text.length; }
    for (const { s, score } of scored) {
      if (picked.includes(s)) continue;
      if (score === 0 && picked.length > 3) break;
      if (budget - s.text.length < 0) continue;
      picked.push(s); budget -= s.text.length;
      if (picked.length >= 7) break;
    }
    return picked.map(s => "### " + s.title + "\n" + s.text).join("\n\n");
  }

  /* ================= gemini ================= */
  const getKey = () => { try { return localStorage.getItem(KEY_LS) || ""; } catch { return ""; } };
  const setKey = (k) => { try { localStorage.setItem(KEY_LS, k); } catch {} };

  const history = []; // {role:"user"|"model", text}

  async function askGemini(question, highlight) {
    const cfg = getCfg();
    const level = LEVELS[cfg.level] || LEVELS.graduate;
    const length = LENGTHS[cfg.length] || LENGTHS.balanced;
    const sys =
`You are Spark, the friendly study buddy built into "Learn with Adi" — free personal study notes where graduate engineers learn how LLMs work by building one.
The student is currently reading: "${UNIT_TITLE}".

STRICT GROUNDING RULES:
- Answer ONLY from the UNIT CONTENT below (and the STUDENT'S HIGHLIGHT when present). This unit is your entire world.
- If a question cannot be answered from this unit, warmly say so in one sentence and, if obvious, name the unit or section of these notes that would cover it. Do not answer from outside knowledge.
- Never invent numbers. The worked numbers in the unit are authoritative.

STYLE:
- ${level.prompt}
- ${length.prompt}
- Explain like a patient friend, not a textbook.
- When one of the page's interactive labs demonstrates the point, tell the student to try it ("open Lab 5 and set W_value to zero").
- Plain text only: no markdown headers or bullets, no LaTeX. Keep symbols simple (q·k, √d_k).

UNIT CONTENT:
${relevantContext(question, highlight)}`;

    const userText = (highlight
      ? "STUDENT'S HIGHLIGHT (the passage they are asking about):\n\"" + highlight + "\"\n\nQUESTION: "
      : "") + question;

    history.push({ role: "user", text: userText });
    const model = cfg.model || cheapestOf(cachedModels());
    const genCfg = { temperature: 0.4, maxOutputTokens: length.maxTokens };
    if (/2\.5-flash/.test(model)) genCfg.thinkingConfig = { thinkingBudget: 0 }; // skip "thinking" tokens where supported
    const body = {
      system_instruction: { parts: [{ text: sys }] },
      contents: history.slice(-10).map(m => ({ role: m.role, parts: [{ text: m.text }] })),
      generationConfig: genCfg
    };
    const res = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent?key=" + encodeURIComponent(getKey()),
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) {
      history.pop();
      let msg = "The model request failed (HTTP " + res.status + ").";
      try {
        const e = await res.json();
        if (res.status === 400 && /API key/i.test(e.error?.message || "")) msg = "BADKEY";
        else if (res.status === 429) msg = "Google's free quota for your key is exhausted for now — wait a minute and try again.";
        else if (e.error?.message) msg = e.error.message.slice(0, 200);
      } catch {}
      throw new Error(msg);
    }
    const data = await res.json();
    const text = (data.candidates?.[0]?.content?.parts || []).map(p => p.text || "").join("").trim()
      || "I couldn't produce an answer for that — try rephrasing?";
    history.push({ role: "model", text });
    return text;
  }

  /* ================= speech ================= */
  const SpeechIO = {
    utter: null,
    speak(text, onEnd) {
      this.stop();
      const u = new SpeechSynthesisUtterance(text.replace(/[✨*_#`]/g, ""));
      u.rate = 1.0; u.pitch = 1.05;
      const vs = speechSynthesis.getVoices();
      u.voice = vs.find(v => /en(-|_)(GB|IN)/i.test(v.lang)) || vs.find(v => /^en/i.test(v.lang)) || null;
      u.onend = () => { this.utter = null; onEnd && onEnd(); };
      this.utter = u; speechSynthesis.speak(u);
    },
    pause() { speechSynthesis.pause(); },
    resume() { speechSynthesis.resume(); },
    stop() { speechSynthesis.cancel(); this.utter = null; },
    get active() { return speechSynthesis.speaking; },
    listen(onText, onState) {
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SR) return null;
      const r = new SR();
      r.lang = "en-IN"; r.interimResults = false; r.maxAlternatives = 1;
      r.onresult = e => onText(e.results[0][0].transcript);
      r.onend = () => onState(false);
      r.onerror = () => onState(false);
      r.start(); onState(true);
      return r;
    }
  };

  /* ================= UI ================= */
  const btn = document.createElement("button");
  btn.className = "spk-btn"; btn.type = "button";
  btn.setAttribute("aria-label", "Ask Spark, the study buddy");
  btn.title = "Ask Spark — highlight any text, or just ask";
  btn.innerHTML = CHAR("");
  document.body.appendChild(btn);

  let panel = null, chipText = "", recog = null;

  function setState(s) {
    document.querySelectorAll(".spk-char").forEach(c => { c.classList.remove("listening", "thinking", "speaking"); if (s) c.classList.add(s); });
    const stEl = panel && panel.querySelector(".spk-head .st");
    if (stEl) stEl.textContent = s === "listening" ? "listening…" : s === "thinking" ? "thinking…" : s === "speaking" ? "speaking — you can pause below" : "grounded in this unit only";
  }

  function buildPanel() {
    panel = document.createElement("div");
    panel.className = "spk-panel";
    panel.setAttribute("role", "dialog"); panel.setAttribute("aria-label", "Spark study buddy");
    panel.innerHTML = `
      <div class="spk-head">${CHAR("")}
        <div><b>Spark</b><div class="st">grounded in this unit only</div></div><div class="sp"></div>
        <button type="button" class="spk-set" title="Spark settings — key, model, level, length">⚙ settings</button>
        <button type="button" class="spk-x" aria-label="Close">✕</button>
      </div>
      <div class="spk-body" style="display:contents"></div>`;
    document.body.appendChild(panel);
    panel.querySelector(".spk-x").onclick = togglePanel;
    panel.querySelector(".spk-set").onclick = () => renderSetup(true);
    if (getKey()) renderChat(); else renderSetup(false);
  }

  function bodyEl() { return panel.querySelector(".spk-body"); }

  function renderSetup(changing) {
    const cfg = getCfg();
    const intro = changing ? "" : `
        <h4>Hi, I'm Spark ✨</h4>
        <p style="margin:0">I'm the study buddy for these notes. Highlight anything on the page and ask me about it — typing or speaking — and I'll explain it differently. I only know <b>this unit</b>; I won't wander off.</p>
        <p style="margin:0">I think with Google's Gemini using <b>your own free API key</b>, so the (tiny) cost is yours and nothing passes through anyone else's server:</p>
        <ol>
          <li>Open <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener">Google AI Studio → API keys</a> (free Google account)</li>
          <li>Click <b>Create API key</b> and copy it</li>
          <li>Paste it here:</li>
        </ol>`;
    bodyEl().innerHTML = `
      <div class="spk-setup">
        ${intro || "<h4>Spark settings</h4>"}
        <label class="spk-lbl">Your Gemini API key</label>
        <input type="password" class="spk-keyin" placeholder="AIza…" autocomplete="off">
        ${changing ? '<div class="note" style="padding:5px 11px">Need a key? <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener">Google AI Studio → Create API key</a> (free). Clear the field and save to remove your key from this browser.</div>' : ""}
        <label class="spk-lbl">Explain things for…</label>
        <div class="spk-pills" data-set="level">${Object.entries(LEVELS).map(([k, v]) =>
          `<button type="button" data-v="${k}" aria-pressed="${k === cfg.level}"><b>${v.name}</b><span>${v.hint}</span></button>`).join("")}</div>
        <label class="spk-lbl">Answer length</label>
        <div class="spk-pills" data-set="length">${Object.entries(LENGTHS).map(([k, v]) =>
          `<button type="button" data-v="${k}" aria-pressed="${k === cfg.length}"><b>${v.name}</b><span>${v.hint}</span></button>`).join("")}</div>
        <label class="spk-lbl">Model</label>
        <select class="spk-model"><option value="">loading models…</option></select>
        <div class="note" style="padding:5px 11px">The list comes live from Google for <i>your</i> key, so it stays current as models come and go. Default = the cheapest available (flash-lite family) — students don't need a pro model; the level &amp; length settings above shape the answers.</div>
        <button type="button" class="go">${changing ? "Save settings" : "Save key & start"}</button>
        <div class="note">Everything here is stored only in this browser (localStorage). The key is sent only to Google, together with your questions and the relevant parts of this unit. Gemini's free tier comfortably covers studying.</div>
      </div>`;
    const inp = bodyEl().querySelector(".spk-keyin");
    if (getKey()) inp.value = getKey();
    // populate the model dropdown live (falls back to a static list without a key)
    const sel = bodyEl().querySelector(".spk-model");
    function fillModels(list) {
      const def = cheapestOf(list);
      const cur = cfg.model && list.includes(cfg.model) ? cfg.model : (cfg.model || def);
      const all = list.includes(cur) ? list : [cur].concat(list);
      sel.innerHTML = all.map(m =>
        `<option value="${m}" ${m === cur ? "selected" : ""}>${m}${m === def ? " — cheapest (default)" : ""}</option>`).join("");
    }
    fillModels(cachedModels());
    fetchModels().then(fillModels);
    inp.addEventListener("change", () => { const k = inp.value.trim(); if (k.length >= 20) { setKey(k); fetchModels().then(fillModels); } });
    bodyEl().querySelectorAll(".spk-pills").forEach(g =>
      g.addEventListener("click", e => {
        const b = e.target.closest("button"); if (!b) return;
        g.querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", "false"));
        b.setAttribute("aria-pressed", "true");
      }));
    bodyEl().querySelector(".go").onclick = () => {
      const k = inp.value.trim();
      if (!changing && k.length < 20) { inp.style.outline = "2px solid #a35a33"; return; }
      if (k.length >= 20) setKey(k);
      else if (changing && k === "") { try { localStorage.removeItem(KEY_LS); } catch {} }
      const pick = set => { const b = bodyEl().querySelector(`.spk-pills[data-set=${set}] button[aria-pressed=true]`); return b ? b.dataset.v : DEFAULT_CFG[set]; };
      setCfg({ level: pick("level"), length: pick("length"), model: sel.value || undefined });
      if (getKey()) renderChat(); else renderSetup(false);
    };
  }

  function renderChat() {
    bodyEl().innerHTML = `
      <div class="spk-msgs" aria-live="polite"></div>
      <div class="spk-chiphost"></div>
      <div class="spk-in">
        <textarea rows="1" placeholder="Ask about this unit…" aria-label="Your question"></textarea>
        <button type="button" class="spk-mic" title="Ask by voice">🎤</button>
        <button type="button" class="spk-send" title="Send">➤</button>
      </div>`;
    const ta = bodyEl().querySelector("textarea");
    ta.addEventListener("input", () => { ta.style.height = "auto"; ta.style.height = Math.min(110, ta.scrollHeight) + "px"; });
    ta.addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } });
    bodyEl().querySelector(".spk-send").onclick = send;
    const micBtn = bodyEl().querySelector(".spk-mic");
    if (!(window.SpeechRecognition || window.webkitSpeechRecognition)) micBtn.style.display = "none";
    micBtn.onclick = () => {
      if (recog) { recog.stop(); recog = null; return; }
      recog = SpeechIO.listen(
        text => { ta.value = text; ta.dispatchEvent(new Event("input")); send(); },
        on => { micBtn.classList.toggle("rec", on); setState(on ? "listening" : ""); if (!on) recog = null; });
    };
    renderChip();
    addMsg("bot", "Hi! I'm Spark. Ask me anything about this unit — or highlight a passage on the page and I'll explain that exact bit. You can type or use the mic, and I can read answers aloud. 🔊");
  }

  function renderChip() {
    const host = panel && panel.querySelector(".spk-chiphost");
    if (!host) return;
    host.innerHTML = chipText ? `
      <div class="spk-chip"><span>✂️</span><span class="t">${escapeHtml(chipText.slice(0, 220))}${chipText.length > 220 ? "…" : ""}</span>
      <button type="button" title="Remove highlight context" aria-label="Remove highlight">✕</button></div>` : "";
    const x = host.querySelector("button");
    if (x) x.onclick = () => { chipText = ""; renderChip(); };
  }

  function addMsg(kind, text) {
    const msgs = panel.querySelector(".spk-msgs");
    if (!msgs) return null;
    const d = document.createElement("div");
    d.className = "spk-m " + (kind === "you" ? "you" : kind === "err" ? "err" : "bot");
    d.textContent = text;
    if (kind === "bot") {
      const tts = document.createElement("div");
      tts.className = "spk-tts";
      tts.innerHTML = `<button type="button" data-a="play">🔊 Read aloud</button>`;
      d.appendChild(tts);
      tts.addEventListener("click", e => {
        const a = e.target.dataset.a; if (!a) return;
        if (a === "play") {
          setState("speaking");
          tts.innerHTML = `<button type="button" data-a="pause">⏸ Pause</button><button type="button" data-a="stop">⏹ Stop</button>`;
          SpeechIO.speak(text, () => { setState(""); tts.innerHTML = `<button type="button" data-a="play">🔊 Read aloud</button>`; });
        } else if (a === "pause") { SpeechIO.pause(); tts.querySelector("[data-a=pause]").outerHTML = `<button type="button" data-a="resume">▶ Resume</button>`; }
        else if (a === "resume") { SpeechIO.resume(); tts.querySelector("[data-a=resume]").outerHTML = `<button type="button" data-a="pause">⏸ Pause</button>`; }
        else if (a === "stop") { SpeechIO.stop(); setState(""); tts.innerHTML = `<button type="button" data-a="play">🔊 Read aloud</button>`; }
      });
    }
    msgs.appendChild(d); msgs.scrollTop = msgs.scrollHeight;
    return d;
  }

  async function send() {
    const ta = panel.querySelector("textarea");
    const q = ta.value.trim();
    if (!q) return;
    ta.value = ""; ta.style.height = "auto";
    addMsg("you", q + (chipText ? "\n— about: “" + chipText.slice(0, 90) + (chipText.length > 90 ? "…" : "") + "”" : ""));
    const hl = chipText; chipText = ""; renderChip();
    const sendBtn = panel.querySelector(".spk-send"); sendBtn.disabled = true;
    setState("thinking");
    const wait = addMsg("bot", "…");
    try {
      const ans = await askGemini(q, hl);
      wait.remove(); addMsg("bot", ans);
    } catch (err) {
      wait.remove();
      if (err.message === "BADKEY") { addMsg("err", "That API key was rejected by Google — let's re-enter it."); renderSetup(true); }
      else addMsg("err", "Hmm: " + err.message);
    }
    setState(""); sendBtn.disabled = false;
  }

  function markOpen() {
    // the page reserves space for the panel instead of letting it cover the text
    const open = !!panel && panel.style.display !== "none";
    document.body.classList.toggle("spark-open", open);
  }
  function togglePanel() {
    if (!panel) { buildPanel(); markOpen(); return; }
    panel.style.display = panel.style.display === "none" ? "" : "none";
    markOpen();
  }
  btn.addEventListener("click", () => { hideAsk(); togglePanel(); });

  /* ================= highlight → Ask Spark ================= */
  let askBtn = null;
  function hideAsk() { if (askBtn) { askBtn.remove(); askBtn = null; } }
  document.addEventListener("mouseup", (e) => {
    if (e.target.closest(".spk-panel,.spk-btn,.spk-ask")) return;
    setTimeout(() => {
      const sel = window.getSelection();
      const text = sel ? String(sel).trim() : "";
      hideAsk();
      if (text.length < 12 || text.length > 2000) return;
      const range = sel.getRangeAt(0).getBoundingClientRect();
      askBtn = document.createElement("button");
      askBtn.type = "button"; askBtn.className = "spk-ask"; askBtn.textContent = "✨ Ask Spark about this";
      askBtn.style.left = Math.max(8, Math.min(window.innerWidth - 190, range.left + window.scrollX)) + "px";
      askBtn.style.top = (range.bottom + window.scrollY + 8) + "px";
      askBtn.onclick = () => {
        chipText = text.slice(0, 1500);
        hideAsk();
        if (!panel) buildPanel(); else panel.style.display = "";
        markOpen();
        renderChip();
        const ta = panel.querySelector("textarea"); if (ta) { ta.placeholder = "What would you like to know about the highlighted part?"; ta.focus(); }
      };
      document.body.appendChild(askBtn);
    }, 10);
  });
  document.addEventListener("scroll", hideAsk, { passive: true });

  function escapeHtml(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

  // warm the voices list (some browsers load it lazily)
  if ("speechSynthesis" in window) speechSynthesis.getVoices();
})();
