(function(){
  "use strict";
  var T = window.I18N || {}, S = window.SITE || {}, prices = S.prices || {}, root = document.documentElement, ids = [];
  function $(i){ return document.getElementById(i); }
  function tr(k){ var v = T[k]; return v ? (v[root.lang] || v.en || "") : ""; }
  function money(n){ var s = (Math.round(n * 100) / 100).toString().replace(/\.0+$/, ""); return root.lang === "en" ? "€" + s : s + " €"; }
  function load(){ try { var a = JSON.parse(localStorage.getItem("cart") || "[]"); ids = Array.isArray(a) ? a.filter(function(x){ return prices.hasOwnProperty(x); }) : []; } catch(e){ ids = []; } }
  function save(){ try { localStorage.setItem("cart", JSON.stringify(ids)); } catch(e){} }
  function render(){
    var list = $("coList"); list.textContent = "";
    var total = 0;
    ids.forEach(function(id){
      total += prices[id];
      var li = document.createElement("li"); li.className = "co-item";
      var n = document.createElement("span"); n.textContent = tr("p." + id + ".name");
      var p = document.createElement("b"); p.textContent = money(prices[id]);
      var rm = document.createElement("button"); rm.type = "button"; rm.className = "cart-rm"; rm.textContent = tr("cart.remove");
      rm.addEventListener("click", function(){ ids = ids.filter(function(x){ return x !== id; }); save(); render(); });
      li.appendChild(n); li.appendChild(p); li.appendChild(rm); list.appendChild(li);
    });
    $("coTotal").textContent = money(total);
    $("coEmpty").hidden = ids.length > 0; $("coForm").hidden = ids.length === 0; list.hidden = ids.length === 0;
  }
  var clrBtn = $("coClear"); if (clrBtn) clrBtn.addEventListener("click", function(){ ids = []; save(); render(); });
  function show(id, on){ var e = $(id); if (e) e.hidden = !on; }
  $("coPay").addEventListener("click", function(){
    var em = $("coEmail").value.trim(), ok = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(em);
    $("coErr").hidden = ok; $("coEmail").setAttribute("aria-invalid", ok ? "false" : "true");
    show("coSoon", false); show("coFail", false);
    if (!ok) return;
    if (!S.api) { show("coSoon", true); return; }
    var btn = $("coPay"); btn.disabled = true;
    fetch(S.api + "/create-checkout", { method:"POST", headers:{ "content-type":"application/json" }, body: JSON.stringify({ items: ids, email: em, lang: root.lang }) })
      .then(function(r){ return r.json().catch(function(){ return {}; }).then(function(j){ return { ok: r.ok, j: j }; }); })
      .then(function(x){
        btn.disabled = false;
        if (x.ok && x.j.url) { location.href = x.j.url; return; }
        if (x.j.error === "unavailable") { show("coFail", true); return; }
        show("coSoon", true);
      })
      .catch(function(){ btn.disabled = false; show("coSoon", true); });
  });
  function fname(f){ return f["name_" + root.lang] || f.name_en || f.name_ar; }
  function renderFiles(files){
    var box = $("coFiles"); box.textContent = "";
    files.forEach(function(f){
      var a = document.createElement("a"); a.className = "btn btn-primary btn-lg co-dl"; a.href = f.url; a.rel = "noopener";
      a.textContent = tr("co.dl.btn") + " \u2014 " + fname(f); box.appendChild(a);
    });
  }
  function fetchFiles(sid, tries){
    show("coWait", true);
    fetch(S.api + "/get-downloads", { method:"POST", headers:{ "content-type":"application/json" }, body: JSON.stringify({ sid: sid }) })
      .then(function(r){ return r.json(); })
      .then(function(j){
        if (j.status === "paid" && j.files) { show("coWait", false); show("coDlErr", false); renderFiles(j.files); return; }
        if (tries < 12) setTimeout(function(){ fetchFiles(sid, tries + 1); }, 2500); else { show("coWait", false); show("coDlErr", true); }
      })
      .catch(function(){ show("coWait", false); show("coDlErr", true); });
  }
  document.addEventListener("langchange", render);
  var paid = /[?&]paid=1\b/.test(location.search);
  if (paid) { ids = []; save(); try { localStorage.removeItem("cart"); } catch(e){} }
  load(); render();
  if (paid) {
    $("coEmpty").hidden = true; $("coForm").hidden = true; $("coList").hidden = true; $("coThanks").hidden = false;
    var m = /[?&]sid=(cs_[A-Za-z0-9_]+)/.exec(location.search);
    if (m && S.api) fetchFiles(m[1], 0);
  }
})();
