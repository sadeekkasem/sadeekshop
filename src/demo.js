(function(){
  "use strict";
  var box = document.getElementById("demoFinder"); if (!box) return;
  var D = window.DEMO || [], T = window.I18N || {}, root = document.documentElement;
  var inp = document.getElementById("demoInput"), list = document.getElementById("demoList"),
      hint = document.getElementById("demoHint"), view = document.getElementById("demoView"),
      img = document.getElementById("demoImg"), cap = document.getElementById("demoCap"),
      ttl = document.getElementById("demoName"), dots = document.getElementById("demoDots"),
      buy = document.getElementById("demoBuy"), prev = document.getElementById("demoPrev"),
      next = document.getElementById("demoNext"), pp = document.getElementById("demoPP"),
      clr = document.getElementById("demoClear"), count = document.getElementById("demoCount");
  var cur = null, idx = 0, timer = null, paused = false, act = -1, DELAY = 4500;
  var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  function L(){ return root.lang || "ar"; }
  function tr(k){ return T[k] ? T[k][L()] : ""; }
  function norm(s){ return (s || "").toLowerCase().replace(/[\u064B-\u065F]/g, "").replace(/[–—\-·:()]/g, " ").replace(/\s+/g, " ").trim(); }
  function matches(q){
    q = norm(q); if (!q) return D.slice();
    var w = q.split(" ");
    return D.filter(function(p){ var h = norm(p.name.ar + " " + p.name.en + " " + p.name.fi); return w.every(function(x){ return h.indexOf(x) >= 0; }); });
  }
  function exact(q){ q = norm(q); for (var i = 0; i < D.length; i++){ var n = D[i].name; if (norm(n[L()]) === q || norm(n.en) === q || norm(n.ar) === q || norm(n.fi) === q) return D[i]; } return null; }
  function renderList(){
    var m = matches(inp.value); list.innerHTML = ""; act = -1;
    m.forEach(function(p, i){
      var li = document.createElement("li"); li.id = "demoOpt" + i; li.setAttribute("role", "option"); li.dataset.id = p.id;
      li.textContent = p.name[L()];
      li.addEventListener("mousedown", function(ev){ ev.preventDefault(); choose(p); });
      list.appendChild(li);
    });
    list.hidden = m.length === 0; inp.setAttribute("aria-expanded", m.length ? "true" : "false");
    if (!m.length && norm(inp.value)) { hint.textContent = tr("demo.none"); hint.hidden = false; }
    else if (!cur) { hint.textContent = tr("demo.hint"); hint.hidden = false; }
  }
  function closeList(){ list.hidden = true; inp.setAttribute("aria-expanded", "false"); inp.removeAttribute("aria-activedescendant"); }
  function setActive(i){
    var items = list.children; if (!items.length) return;
    act = (i + items.length) % items.length;
    for (var k = 0; k < items.length; k++) items[k].setAttribute("aria-selected", k === act ? "true" : "false");
    inp.setAttribute("aria-activedescendant", items[act].id); items[act].scrollIntoView({block: "nearest"});
  }
  function choose(p){ inp.value = p.name[L()]; closeList(); show(p); }
  function btn(href, cls, html){ var a = document.createElement("a"); a.href = href; a.className = cls; a.target = "_blank"; a.rel = "noopener"; a.innerHTML = html; return a; }
  function show(p){
    cur = p; idx = 0; hint.hidden = true; view.hidden = false;
    ttl.textContent = p.name[L()];
    dots.innerHTML = "";
    p.slides.forEach(function(_, i){
      var b = document.createElement("button"); b.type = "button"; b.className = "demo-dot";
      b.setAttribute("aria-label", tr("demo.slide") + " " + (i + 1));
      b.addEventListener("click", function(){ go(i, true); }); dots.appendChild(b);
    });
    buy.innerHTML = "";
    buy.appendChild(btn(p.payhip || p.etsy, "btn btn-buy", box.dataset.cart + "<span>" + tr("card.buy") + "</span><small class=\"via\">" + (p.payhip ? "Payhip" : "Etsy") + "</small>"));
    if (p.etsy && p.payhip) buy.appendChild(btn(p.etsy, "store store-etsy", "Etsy"));
    if (p.gumroad) buy.appendChild(btn(p.gumroad, "store store-gum", "Gumroad"));
    if (p.sikka) buy.appendChild(btn(p.sikka, "store store-sikka", "<span data-i18n=\"card.sikka\">" + tr("card.sikka") + "</span>"));
    // preload the rest quietly
    p.slides.forEach(function(s){ var im = new Image(); im.src = s.src; });
    go(0, false); start();
  }
  function go(i, user){
    if (!cur) return; var n = cur.slides.length; idx = (i + n) % n;
    var s = cur.slides[idx];
    img.classList.remove("in"); img.src = s.src; img.alt = s.cap[L()];
    void img.offsetWidth; img.classList.add("in");
    cap.textContent = s.cap[L()];
    count.textContent = (idx + 1) + " / " + n;
    Array.prototype.forEach.call(dots.children, function(d, k){ d.setAttribute("aria-current", k === idx ? "true" : "false"); });
    if (user) start();
  }
  function stop(){ if (timer) { clearInterval(timer); timer = null; } }
  function start(){ stop(); if (!paused && !reduce && cur) timer = setInterval(function(){ go(idx + 1, false); }, DELAY); }
  function setPaused(v){ paused = v; pp.setAttribute("aria-pressed", v ? "true" : "false"); pp.setAttribute("aria-label", tr(v ? "demo.play" : "demo.pause")); pp.classList.toggle("is-paused", v); v ? stop() : start(); }
  function reset(){ cur = null; stop(); view.hidden = true; hint.textContent = tr("demo.hint"); hint.hidden = false; }

  inp.addEventListener("input", function(){ var p = exact(inp.value); if (p) { closeList(); show(p); } else renderList(); });
  inp.addEventListener("focus", renderList);
  inp.addEventListener("blur", function(){ setTimeout(closeList, 120); });
  inp.addEventListener("keydown", function(ev){
    if (ev.key === "ArrowDown") { ev.preventDefault(); if (list.hidden) renderList(); setActive(act + 1); }
    else if (ev.key === "ArrowUp") { ev.preventDefault(); setActive(act - 1); }
    else if (ev.key === "Enter") { ev.preventDefault(); var items = list.children, m = matches(inp.value);
      var id = act >= 0 && items[act] ? items[act].dataset.id : (m[0] && m[0].id);
      for (var k = 0; k < D.length; k++) if (D[k].id === id) choose(D[k]); }
    else if (ev.key === "Escape") closeList();
  });
  clr.addEventListener("click", function(){ inp.value = ""; reset(); inp.focus(); });
  var rtl = function(){ return root.dir === "rtl"; };
  prev.addEventListener("click", function(){ go(idx - 1, true); });
  next.addEventListener("click", function(){ go(idx + 1, true); });
  pp.addEventListener("click", function(){ setPaused(!paused); });
  view.addEventListener("keydown", function(ev){
    if (ev.target === inp) return;
    if (ev.key === "ArrowLeft") go(idx + (rtl() ? 1 : -1), true);
    if (ev.key === "ArrowRight") go(idx + (rtl() ? -1 : 1), true);
  });
  // swipe
  var sx = null;
  img.parentNode.addEventListener("touchstart", function(e){ sx = e.touches[0].clientX; }, {passive: true});
  img.parentNode.addEventListener("touchend", function(e){ if (sx === null) return; var dx = e.changedTouches[0].clientX - sx; sx = null;
    if (Math.abs(dx) > 40) go(idx + ((dx < 0) !== rtl() ? 1 : -1), true); }, {passive: true});
  // pause while hovered / hidden / off-screen
  view.addEventListener("mouseenter", stop); view.addEventListener("mouseleave", start);
  document.addEventListener("visibilitychange", function(){ document.hidden ? stop() : start(); });
  if ("IntersectionObserver" in window) new IntersectionObserver(function(en){ en[0].isIntersecting ? start() : stop(); }).observe(view);
  document.addEventListener("langchange", function(){
    pp.setAttribute("aria-label", tr(paused ? "demo.play" : "demo.pause"));
    if (cur) { inp.value = cur.name[L()]; var i = idx; show(cur); go(i, false); } else reset();
  });
  reset();
})();
