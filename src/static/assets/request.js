(function(){
  "use strict";
  var f = document.getElementById("reqForm");
  if (!f) return;
  var T = window.I18N || {}, root = document.documentElement, EMAIL = f.dataset.email;
  function L(k, l){ var v = T[k]; return v ? v[l || root.lang] || v.en : ""; }
  function val(n){ return (f.elements[n].value || "").trim(); }
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  function check(){
    var ok = true, first = null;
    [["name", function(v){ return v.length > 0; }],
     ["email", function(v){ return EMAIL_RE.test(v); }],
     ["desc", function(v){ return v.length > 0; }]].forEach(function(r){
      var el = f.elements[r[0]], good = r[1](val(r[0])), msg = document.getElementById(el.id + "-err");
      el.setAttribute("aria-invalid", good ? "false" : "true");
      if (msg) msg.hidden = good;
      if (!good) { ok = false; if (!first) first = el; }
    });
    if (first) first.focus();
    return ok;
  }
  // Builds the mailto: link. Subject always uses the English type name; body labels follow the page language.
  function buildMailto(){
    var l = root.lang, type = val("type"), typeEn = L("req.t." + type, "en"), typeL = L("req.t." + type, l);
    var opt = L("req.f.opt", l).replace(/[()]/g, "");
    var lines = [
      L("req.f.name", l) + ": " + val("name"),
      L("req.f.email", l) + ": " + val("email"),
      L("req.f.type", l) + ": " + typeL + (l !== "en" ? " (" + typeEn + ")" : ""),
      L("req.f.deadline", l) + ": " + (val("deadline") || "-"),
      L("req.f.budget", l) + ": " + (val("budget") || "-"),
      "",
      L("req.f.desc", l) + ":",
      val("desc")
    ];
    var subject = "Custom template request - " + typeEn;
    var body = lines.join("\r\n").replace(/\r?\n/g, "\r\n");
    return "mailto:" + EMAIL + "?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body);
  }
  window.buildRequestMailto = buildMailto;
  f.addEventListener("input", function(ev){
    var el = ev.target, msg = document.getElementById(el.id + "-err");
    if (el.getAttribute("aria-invalid") === "true" && msg) { el.setAttribute("aria-invalid","false"); msg.hidden = true; }
  });
  f.addEventListener("submit", function(ev){
    ev.preventDefault();
    document.getElementById("reqOk").hidden = true;
    if (!check()) return;
    var href = buildMailto();
    f.dataset.lastHref = href;
    window.location.href = href;
    document.getElementById("reqOk").hidden = false;
  });
})();
