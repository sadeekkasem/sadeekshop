(function(){
  "use strict";
  var T = window.I18N || {}, root = document.documentElement, LANGS = ["ar","en","fi"];
  var OG = {ar:"ar_AR", en:"en_US", fi:"fi_FI"};
  function setLang(l){
    if (LANGS.indexOf(l) < 0) l = "ar";
    root.lang = l; root.dir = l === "ar" ? "rtl" : "ltr";
    document.querySelectorAll("[data-i18n]").forEach(function(el){ var v = T[el.dataset.i18n]; if (v) el.textContent = v[l]; });
    document.querySelectorAll("[data-i18n-content]").forEach(function(el){ var v = T[el.dataset.i18nContent]; if (v) el.setAttribute("content", v[l]); });
    document.querySelectorAll("[data-i18n-aria]").forEach(function(el){ var v = T[el.dataset.i18nAria]; if (v) el.setAttribute("aria-label", v[l]); });
    document.querySelectorAll("[data-i18n-ph]").forEach(function(el){ var v = T[el.dataset.i18nPh]; if (v) el.placeholder = v[l]; });
    document.querySelectorAll("[data-alt-key]").forEach(function(el){ var v = T[el.dataset.altKey]; if (v) el.alt = v[l]; });
    document.querySelectorAll("[data-price]").forEach(function(el){ try { el.textContent = JSON.parse(el.dataset.price)[l]; } catch(e){} });
    var og = document.querySelector('meta[property="og:locale"]'); if (og) og.content = OG[l];
    document.querySelectorAll(".lang button").forEach(function(b){ b.setAttribute("aria-pressed", b.dataset.lang === l ? "true" : "false"); });
    try { localStorage.setItem("lang", l); } catch(e){}
    document.dispatchEvent(new CustomEvent("langchange", {detail: l}));
  }
  var q = new URLSearchParams(location.search).get("lang"), saved = null;
  try { saved = localStorage.getItem("lang"); } catch(e){}
  var start = q || saved || "ar";
  if (start !== "ar") setLang(start);
  document.querySelectorAll(".lang button").forEach(function(b){ b.addEventListener("click", function(){ setLang(b.dataset.lang); }); });

  // hide the small nav wordmark while the shop banner is visible
  var ban = document.querySelector(".storebanner"), top = document.querySelector(".top");
  if (ban && top && "IntersectionObserver" in window) {
    new IntersectionObserver(function(en){ top.classList.toggle("at-banner", en[0].isIntersecting); }, {rootMargin:"-64px 0px 0px 0px"}).observe(ban);
  }

  // category filter
  var chips = document.querySelectorAll(".chip"), cards = document.querySelectorAll(".card");
  chips.forEach(function(ch){ ch.addEventListener("click", function(){
    var f = ch.dataset.filter;
    chips.forEach(function(o){ var on = o === ch; o.classList.toggle("is-on", on); o.setAttribute("aria-pressed", on ? "true" : "false"); });
    cards.forEach(function(cd){ cd.hidden = !(f === "all" || cd.dataset.cat === f); });
  }); });
})();
