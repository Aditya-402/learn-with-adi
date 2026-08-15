/* Learn with Adi — learning-journey engine.
   One store, two backends:
     - localStorage always (works signed-out, works offline)
     - Supabase when configured AND the student signs in (Google) — local merges up.
   Pages opt in via data attributes:
     <body data-lwa-course="llm-from-scratch" data-lwa-chapter="ch03" data-lwa-title="…">
   Widgets:
     <span  data-lwa-auth></span>      auth chip (sign in / avatar / sign out)
     <button data-lwa-complete></button>  mark-chapter-complete toggle
     <div   data-lwa-journey></div>    "continue where you left off" strip
     [data-lwa-progress="<course>"]    fills child <i> width % + [data-lwa-count] text
*/
(function () {
  "use strict";
  const CFG = window.LWA_CONFIG || {};
  const LS_KEY = "lwa-progress-v1";
  const SB_READY = !!(CFG.supabaseUrl && CFG.supabaseAnonKey);

  /* ---------------- local store ---------------- */
  function loadLocal() {
    try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; }
    catch { return {}; }
  }
  function saveLocal(d) { try { localStorage.setItem(LS_KEY, JSON.stringify(d)); } catch {} }

  // shape: { [course]: { [chapter]: {t:title, c:completed, q:quizScore, qt:quizTotal, s:scrollPct, u:updatedISO} } }
  let data = loadLocal();
  let supabase = null, user = null;

  function rec(course, chapter) {
    data[course] = data[course] || {};
    data[course][chapter] = data[course][chapter] || {};
    return data[course][chapter];
  }

  function update(course, chapter, patch) {
    const r = rec(course, chapter);
    Object.assign(r, patch, { u: new Date().toISOString() });
    saveLocal(data);
    pushRemote(course, chapter, r);
    render();
    document.dispatchEvent(new CustomEvent("lwa:progress"));
  }

  /* ---------------- supabase (optional) ---------------- */
  async function initSupabase() {
    if (!SB_READY) return;
    try {
      const mod = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm");
      supabase = mod.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey);
      const { data: s } = await supabase.auth.getSession();
      setUser(s && s.session ? s.session.user : null);
      supabase.auth.onAuthStateChange((event, session) => {
        // explicit sign-out wipes the local copy: your journey is safe in your
        // account and must not linger on a shared machine
        if (event === "SIGNED_OUT") {
          data = {};
          try { localStorage.removeItem(LS_KEY); } catch {}
        }
        setUser(session ? session.user : null);
        if (event === "SIGNED_OUT") render();
      });
    } catch (e) { console.warn("[LWA] Supabase unavailable:", e); }
  }

  async function setUser(u) {
    user = u;
    renderAuth();
    if (user) await mergeRemote();
  }

  async function mergeRemote() {
    try {
      const { data: rows, error } = await supabase.from("progress").select("*");
      if (error) throw error;
      // newest-wins merge, completion is sticky
      (rows || []).forEach(row => {
        const r = rec(row.course, row.chapter);
        const remoteNewer = !r.u || (row.updated_at && row.updated_at > r.u);
        if (remoteNewer) Object.assign(r, { c: row.completed, q: row.quiz_score, qt: row.quiz_total, s: row.scroll_pct, u: row.updated_at });
        r.c = r.c || row.completed;
      });
      saveLocal(data);
      // push anything local the server lacks / is older on
      for (const course of Object.keys(data))
        for (const chapter of Object.keys(data[course])) {
          const r = data[course][chapter];
          const row = (rows || []).find(x => x.course === course && x.chapter === chapter);
          if (!row || (r.u && (!row.updated_at || r.u > row.updated_at))) await pushRemote(course, chapter, r);
        }
      render();
      document.dispatchEvent(new CustomEvent("lwa:progress"));
    } catch (e) { console.warn("[LWA] sync failed:", e); }
  }

  async function pushRemote(course, chapter, r) {
    if (!supabase || !user) return;
    try {
      await supabase.from("progress").upsert({
        user_id: user.id, course, chapter, title: r.t || null,
        completed: !!r.c, quiz_score: r.q ?? null, quiz_total: r.qt ?? null,
        scroll_pct: r.s ?? null, updated_at: r.u || new Date().toISOString()
      }, { onConflict: "user_id,course,chapter" });
    } catch (e) { console.warn("[LWA] push failed:", e); }
  }

  function signIn() {
    if (!supabase) return;
    supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: location.href } });
  }
  function signOut() { if (supabase) supabase.auth.signOut(); }

  /* ---------------- page context ---------------- */
  const body = document.body;
  const COURSE = body.getAttribute("data-lwa-course");
  const CHAPTER = body.getAttribute("data-lwa-chapter");
  const TITLE = body.getAttribute("data-lwa-title") || document.title;

  /* ---------------- widgets ---------------- */
  function renderAuth() {
    document.querySelectorAll("[data-lwa-auth]").forEach(el => {
      el.classList.add("lwa-auth");
      if (!SB_READY) { el.innerHTML = ""; return; } // not configured yet — hide quietly
      if (!user) {
        el.innerHTML = "<button type='button'>Sign in — save your progress</button>";
        el.querySelector("button").onclick = signIn;
      } else {
        const name = (user.user_metadata && (user.user_metadata.full_name || user.user_metadata.name)) || user.email || "you";
        const pic = user.user_metadata && (user.user_metadata.avatar_url || user.user_metadata.picture);
        el.innerHTML = "<span class='lwa-user'>" + (pic ? "<img alt='' src='" + pic + "'>" : "") +
          "<span>" + escapeHtml(String(name).split(" ")[0]) + "</span><span class='lwa-sync'>· progress syncing</span></span>" +
          "<button type='button' class='lwa-signout'>sign out</button>";
        el.querySelector(".lwa-signout").onclick = signOut;
      }
    });
  }

  function render() {
    // mark-complete buttons
    document.querySelectorAll("[data-lwa-complete]").forEach(btn => {
      if (!COURSE || !CHAPTER) return;
      const done = !!rec(COURSE, CHAPTER).c;
      btn.classList.toggle("is-done", done);
      btn.innerHTML = done
        ? "<span class='k'>Progress</span><span class='t'>✓ Chapter complete — well done</span>"
        : "<span class='k'>Progress</span><span class='t'>Mark this chapter complete</span>";
    });
    // course progress bars / counts
    document.querySelectorAll("[data-lwa-progress]").forEach(el => {
      const course = el.getAttribute("data-lwa-progress");
      const total = parseInt(el.getAttribute("data-lwa-total") || "0", 10);
      const doneN = Object.values(data[course] || {}).filter(r => r.c).length;
      const bar = el.querySelector(".pbar i");
      if (bar && total) bar.style.width = Math.round(100 * doneN / total) + "%";
      const cnt = el.querySelector("[data-lwa-count]");
      if (cnt) cnt.textContent = doneN + " of " + total + " chapters complete";
    });
    // chapter row statuses on hub pages
    document.querySelectorAll("[data-lwa-chapstat]").forEach(el => {
      const [course, ch] = el.getAttribute("data-lwa-chapstat").split("/");
      const r = (data[course] || {})[ch];
      if (r && r.c) { el.textContent = "✓ done"; el.className = "st done"; }
      else if (r && (r.s || r.q != null)) { el.textContent = "in progress"; el.className = "st started"; }
      else { el.textContent = "not started"; el.className = "st"; }
    });
    renderJourney();
  }

  function renderJourney() {
    document.querySelectorAll("[data-lwa-journey]").forEach(el => {
      el.classList.add("lwa-journey");
      let latest = null;
      for (const course of Object.keys(data))
        for (const ch of Object.keys(data[course])) {
          const r = data[course][ch];
          if (r.u && (!latest || r.u > latest.u)) latest = { course, ch, ...r };
        }
      if (!latest) {
        el.innerHTML = "<div class='h'>Your journey</div><div class='row'>Nothing started yet — pick a course below and dive in.</div>";
        return;
      }
      const href = el.getAttribute("data-lwa-root") ? el.getAttribute("data-lwa-root") + "courses/" + latest.course + "/" + latest.ch + ".html" : latest.ch + ".html";
      el.innerHTML = "<div class='h'>Your journey</div><div class='row'><span>Last visited: <b>" +
        escapeHtml(latest.t || latest.ch) + "</b>" + (latest.c ? " (completed)" : "") +
        (latest.q != null ? " · quiz " + latest.q + "/" + latest.qt : "") +
        "</span><a href='" + href + "'>Continue →</a></div>";
    });
  }

  function escapeHtml(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }

  /* ---------------- chapter-page auto tracking ---------------- */
  if (COURSE && CHAPTER) {
    // record the visit
    update(COURSE, CHAPTER, { t: TITLE });

    // reading progress bar + scroll% (throttled, saved on change of >2%)
    const bar = document.createElement("div");
    bar.className = "lwa-readbar";
    document.body.appendChild(bar);
    let lastSaved = rec(COURSE, CHAPTER).s || 0, ticking = false;
    window.addEventListener("scroll", () => {
      if (ticking) return; ticking = true;
      requestAnimationFrame(() => {
        const h = document.documentElement;
        const pct = Math.min(100, Math.round(100 * h.scrollTop / Math.max(1, h.scrollHeight - h.clientHeight)));
        bar.style.width = pct + "%";
        if (Math.abs(pct - lastSaved) > 2 && pct > (rec(COURSE, CHAPTER).s || 0)) {
          lastSaved = pct; update(COURSE, CHAPTER, { s: pct });
        }
        ticking = false;
      });
    }, { passive: true });

    // mark-complete click
    document.addEventListener("click", e => {
      const btn = e.target.closest("[data-lwa-complete]");
      if (!btn) return;
      update(COURSE, CHAPTER, { c: !rec(COURSE, CHAPTER).c });
    });

    // quiz hook: the chapter quizzes write "You scored X out of Y …" into #quiz-score
    const scoreEl = document.getElementById("quiz-score");
    if (scoreEl) {
      new MutationObserver(() => {
        const m = /scored\s+(\d+)\s+out of\s+(\d+)/i.exec(scoreEl.textContent || "");
        if (m) update(COURSE, CHAPTER, { q: +m[1], qt: +m[2] });
      }).observe(scoreEl, { childList: true, characterData: true, subtree: true });
    }
  }

  /* ---------------- boot ---------------- */
  render();
  renderAuth();
  initSupabase();

  window.LWA = { update, data: () => data, signIn, signOut };
})();
