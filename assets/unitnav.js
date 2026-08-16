/* Learn with Adi - unit-page navigation.

   A unit page used to reach only its two neighbours, and the only thing still
   on screen once you scrolled was the contents rail. So the rail carries the
   way out: a persistent "All units" link above the contents.

   Also: the collapse toggle is gone. Collapsing could not widen a fixed-width
   column, so it cost a click and a sticky preference for nothing - the same
   choice MDN and W3Schools make with their fixed sidebars.

   Include after progress.js on any unit page. */
(function () {
  "use strict";
  var SERIES = {"python-programming":[{"n":1,"t":"Your first conversation with a computer","lvl":"Beginner · Foundations"},{"n":2,"t":"Remembering things — variables & numbers","lvl":"Beginner · Foundations"},{"n":3,"t":"Making decisions — comparisons & if/else","lvl":"Beginner · Foundations"},{"n":4,"t":"Doing it again — loops","lvl":"Beginner · Foundations"},{"n":5,"t":"Many things at once — lists","lvl":"Beginner · Foundations"},{"n":6,"t":"Labeled data — dictionaries, tuples & sets","lvl":"Beginner · Foundations"},{"n":7,"t":"Packaging logic — functions","lvl":"Beginner · Foundations"},{"n":8,"t":"Words & text — strings properly","lvl":"Beginner · Foundations"},{"n":9,"t":"When things break — errors & debugging","lvl":"Beginner · Foundations"},{"n":10,"t":"Saving your work — files","lvl":"Beginner · Foundations"},{"n":11,"t":"Borrowing power — modules & the standard library","lvl":"Beginner · Foundations"},{"n":12,"t":"The Pythonic loop — comprehensions","lvl":"Beginner · Foundations"},{"n":13,"t":"Classes I — why objects","lvl":"Intermediate · Object-oriented Python"},{"n":14,"t":"Classes II — objects that feel native","lvl":"Intermediate · Object-oriented Python"},{"n":15,"t":"Classes III — inheritance & composition","lvl":"Intermediate · Object-oriented Python"},{"n":16,"t":"Classes IV — properties & encapsulation","lvl":"Intermediate · Object-oriented Python"},{"n":17,"t":"Iterators & the iteration protocol","lvl":"Advanced · The subtle machinery"},{"n":18,"t":"Generators & laziness","lvl":"Advanced · The subtle machinery"},{"n":19,"t":"Functions as values","lvl":"Advanced · The subtle machinery"},{"n":20,"t":"Decorators & context managers","lvl":"Advanced · The subtle machinery"},{"n":21,"t":"NumPy — arrays that compute","lvl":"Bridge · Python for ML & DL"},{"n":22,"t":"pandas — tables of data","lvl":"Bridge · Python for ML & DL"},{"n":23,"t":"matplotlib & seaborn — seeing your data","lvl":"Bridge · Python for ML & DL"},{"n":24,"t":"scikit-learn — the shape of an ML library","lvl":"Bridge · Python for ML & DL"},{"n":25,"t":"PyTorch — first contact","lvl":"Bridge · Python for ML & DL"},{"n":26,"t":"Keras — first contact & the grammar compared","lvl":"Bridge · Python for ML & DL"}]};

  var body = document.body;
  var course = body.getAttribute("data-lwa-course");
  var rail = document.querySelector(".rail");
  if (!course || !rail) return;


  var CSS = [
    ".rail a.rnav-back{display:flex;align-items:center;gap:8px;margin-bottom:12px;padding:8px 11px;",
    "  border:1px solid var(--line,#e3e6ee);border-radius:9px;background:var(--panel,#fff);",
    "  color:var(--slate,#4a5a72);text-decoration:none;font-size:var(--fs-sm,13px);font-weight:600}",
    ".rail a.rnav-back:hover{border-color:var(--accent,#5b4b9e);color:var(--accent-deep,#3d3170);",
    "  background:var(--accent-wash,#ecebf6)}",
    ".rail a.rnav-back .ico{font-size:13px;line-height:1}",
    "@media (max-width:940px){.rail a.rnav-back{margin-bottom:0;white-space:nowrap}}",
    ".uprog{display:flex;align-items:center;gap:9px;font-size:var(--fs-xs,12px);",
    "  color:var(--muted,#6b7585);margin:-6px 0 14px}",
    ".uprog .bar{width:130px;height:5px;border-radius:99px;background:var(--subtle,#f0f1f7);",
    "  border:1px solid var(--line,#e3e6ee);overflow:hidden}",
    ".uprog .bar i{display:block;height:100%;background:var(--accent,#5b4b9e)}",
    "@media (max-width:720px){.uprog .bar{display:none}}",
    /* Spark reserves space instead of covering the text - both series */
    "body.spark-open .shell,body.spark-open .masthead-in,body.spark-open .foot-in",
    "  {margin-right:414px;transition:margin-right .18s ease}",
    "@media (max-width:1100px){body.spark-open .shell,body.spark-open .masthead-in,",
    "  body.spark-open .foot-in{margin-right:0}}"
  ].join(String.fromCharCode(10));
  var st = document.createElement("style"); st.textContent = CSS; document.head.appendChild(st);

  /* the rail stays put - take out the collapse control and any stuck state */
  var toggle = rail.querySelector(".rail-toggle");
  if (toggle) toggle.remove();
  body.classList.remove("rail-min");
  try { localStorage.removeItem("lwa-rail"); } catch (e) {}

  /* the way out, above the contents */
  if (!rail.querySelector(".rnav-back")) {
    var back = document.createElement("a");
    back.className = "rnav-back";
    back.href = "index.html";
    back.title = "Back to the unit list";
    back.innerHTML = '<span class="ico">\u2190</span><span class="lbl">All units</span>';
    rail.insertBefore(back, rail.firstChild);
  }

  /* a quiet "where am I" line under the eyebrow, where we know the series map */
  var units = SERIES[course];
  var cur = parseInt((body.getAttribute("data-lwa-chapter") || "").replace(/^u/, ""), 10);
  var eyebrow = document.querySelector(".eyebrow");
  if (!units || !cur || !eyebrow || document.querySelector(".uprog")) return;
  var meta = units.filter(function (u) { return u.n === cur; })[0];
  if (!meta) return;

  var p = document.createElement("div");
  p.className = "uprog";
  p.innerHTML = "<span>Unit " + cur + " of " + units.length + " \u00b7 " + meta.lvl + "</span>" +
    '<span class="bar"><i style="width:' + Math.round(100 * cur / units.length) + '%"></i></span>';
  eyebrow.parentNode.insertBefore(p, eyebrow.nextSibling);
})();
