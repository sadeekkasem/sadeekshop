(function(){
  "use strict";
  var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!reduce && "IntersectionObserver" in window) {
    var io = new IntersectionObserver(function(en){
      en.forEach(function(x){ if (x.isIntersecting) { x.target.classList.add("in"); io.unobserve(x.target); } });
    }, {threshold:.08, rootMargin:"0px 0px -6% 0px"});
    document.querySelectorAll(".card,.why-item,.step,.qa,.sec-head,.web-demo,.free,.req-cta,.contact").forEach(function(el,i){
      el.classList.add("rv"); el.style.transitionDelay = (i % 3) * 90 + "ms"; io.observe(el);
    });
    setTimeout(function(){ document.querySelectorAll(".rv:not(.in)").forEach(function(el){ var r = el.getBoundingClientRect(); if (r.top < innerHeight) el.classList.add("in"); }); }, 1200);
  }
  var hero = document.querySelector(".hero"), art = document.querySelector(".hero-art");
  if (hero && art && !reduce && matchMedia("(hover:hover)").matches) {
    hero.addEventListener("mousemove", function(e){
      var r = hero.getBoundingClientRect();
      art.style.setProperty("--mx", ((e.clientX - r.left) / r.width - .5).toFixed(3));
      art.style.setProperty("--my", ((e.clientY - r.top) / r.height - .5).toFixed(3));
    });
    hero.addEventListener("mouseleave", function(){ art.style.setProperty("--mx", 0); art.style.setProperty("--my", 0); });
  }
})();
(function(){
  "use strict";
  var grid = document.querySelector(".grid"), chipsBox = document.querySelector(".chips");
  if (!grid || !chipsBox) return;
  var T = window.I18N || {}, root = document.documentElement, PAGE = 9, shown = PAGE, q = "";
  function tr(k){ var v = T[k]; return v ? (v[root.lang] || v.en || "") : ""; }
  function el(t, c){ var e = document.createElement(t); if (c) e.className = c; return e; }
  var box = el("div", "shop-search"), inp = el("input"); inp.type = "search"; inp.setAttribute("autocomplete", "off");
  box.appendChild(inp); chipsBox.parentNode.insertBefore(box, chipsBox);
  var none = el("p", "shop-none"); none.hidden = true; grid.parentNode.insertBefore(none, grid.nextSibling);
  var more = el("button", "btn btn-primary btn-lg shop-more"); more.type = "button";
  var wrap = el("div", "shop-more-wrap"); wrap.appendChild(more); grid.parentNode.insertBefore(wrap, none.nextSibling);
  function cards(){ return Array.prototype.slice.call(grid.querySelectorAll(".card")); }
  function active(kind){ var c = chipsBox.querySelector('.chip.is-on[data-kind="' + kind + '"]') || (kind === "cat" ? chipsBox.querySelector(".chip.is-on:not([data-kind])") : null); return c ? c.dataset.filter : "all"; }
  function apply(){
    var cat = active("cat"), type = active("type"), limit = (cat === "all" && type === "all" && !q) ? shown : 9999, n = 0, total = 0;
    cards().forEach(function(cd){
      var okCat = (cat === "all" || cd.dataset.cat === cat) && (type === "all" || cd.dataset.type === type);
      var okQ = !q || cd.textContent.toLowerCase().indexOf(q) >= 0;
      var ok = okCat && okQ; cd.hidden = !ok;
      if (ok) { total++; n++; cd.classList.toggle("cut", n > limit); if (n <= limit) cd.classList.add("in"); }
    });
    var hiddenMore = Math.max(0, total - limit);
    wrap.hidden = hiddenMore <= 0; more.textContent = tr("shop.more") + " (" + hiddenMore + ")";
    none.hidden = total > 0; none.textContent = tr("shop.none"); inp.placeholder = tr("shop.search");
  }
  inp.addEventListener("input", function(){ q = inp.value.trim().toLowerCase(); apply(); });
  more.addEventListener("click", function(){ shown += PAGE; apply(); });
  chipsBox.addEventListener("click", function(){ setTimeout(apply, 0); });
  document.addEventListener("langchange", apply);
  apply();
})();
