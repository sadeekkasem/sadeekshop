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
  $("coPay").addEventListener("click", function(){
    var em = $("coEmail").value.trim(), ok = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(em);
    $("coErr").hidden = ok; $("coEmail").setAttribute("aria-invalid", ok ? "false" : "true");
    if (!ok) return;
    if (S.pay) { location.href = S.pay + (S.pay.indexOf("?") < 0 ? "?" : "&") + "email=" + encodeURIComponent(em) + "&items=" + encodeURIComponent(ids.join(",")); return; }
    $("coSoon").hidden = false;
  });
  document.addEventListener("langchange", render);
  var paid = /[?&]paid=1\b/.test(location.search);
  if (paid) { ids = []; save(); try { localStorage.removeItem("cart"); } catch(e){} }
  load(); render();
  if (paid) { $("coEmpty").hidden = true; $("coForm").hidden = true; $("coList").hidden = true; $("coThanks").hidden = false; }
})();
