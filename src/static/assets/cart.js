(function(){
  "use strict";
  var T = window.I18N || {}, root = document.documentElement;
  var WA = (window.SITE && window.SITE.wa) || "";
  var info = {}, ids = [];
  document.querySelectorAll("[data-add]").forEach(function(b){ info[b.dataset.add] = Number(b.dataset.price) || 0; });
  if (!Object.keys(info).length) return;

  function tr(k){ var v = T[k]; return v ? (v[root.lang] || v.en || "") : ""; }
  function name(id){ return tr("p." + id + ".name"); }
  function money(n){ var s = (Math.round(n * 100) / 100).toString().replace(/\.0+$/, ""); return root.lang === "en" ? "€" + s : s + " €"; }
  function load(){ try { var a = JSON.parse(localStorage.getItem("cart") || "[]"); ids = Array.isArray(a) ? a.filter(function(x){ return info.hasOwnProperty(x); }) : []; } catch(e){ ids = []; } }
  function save(){ try { localStorage.setItem("cart", JSON.stringify(ids)); } catch(e){} }
  function total(){ return ids.reduce(function(s, id){ return s + info[id]; }, 0); }

  function el(tag, cls, text){ var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

  var fab = el("button", "cart-fab"); fab.type = "button"; fab.hidden = true;
  var fabCount = el("span", "cart-count"), fabIcon = el("span", "cart-fab-ic", "🛒");
  fab.appendChild(fabIcon); fab.appendChild(fabCount);
  var panel = el("div", "cart-panel"); panel.hidden = true; panel.setAttribute("role", "dialog"); panel.setAttribute("aria-modal", "false");
  var head = el("div", "cart-head"), title = el("h2", "cart-title"), close = el("button", "cart-close", "✕"); close.type = "button";
  head.appendChild(title); head.appendChild(close);
  var list = el("ul", "cart-list"), foot = el("div", "cart-foot");
  var totalRow = el("div", "cart-total"), totalLbl = el("span"), totalVal = el("b");
  totalRow.appendChild(totalLbl); totalRow.appendChild(totalVal);
  var send = el("a", "btn btn-yellow btn-lg cart-send"); send.href = "checkout.html";
  var note = el("p", "cart-note");
  foot.appendChild(totalRow); foot.appendChild(send); foot.appendChild(note);
  panel.appendChild(head); panel.appendChild(list); panel.appendChild(foot);
  document.body.appendChild(fab); document.body.appendChild(panel);

  function render(){
    title.textContent = tr("cart.title");
    close.setAttribute("aria-label", tr("cart.close"));
    fab.setAttribute("aria-label", tr("cart.open"));
    fabCount.textContent = String(ids.length);
    fab.hidden = ids.length === 0;
    if (!ids.length) panel.hidden = true;
    list.textContent = "";
    if (!ids.length) { list.appendChild(el("li", "cart-empty", tr("cart.empty"))); }
    ids.forEach(function(id){
      var li = el("li", "cart-item"), n = el("span", "cart-name", name(id)), p = el("b", "cart-price", money(info[id]));
      var rm = el("button", "cart-rm", tr("cart.remove")); rm.type = "button";
      rm.addEventListener("click", function(){ ids = ids.filter(function(x){ return x !== id; }); save(); render(); mark(); });
      li.appendChild(n); li.appendChild(p); li.appendChild(rm); list.appendChild(li);
    });
    totalLbl.textContent = tr("cart.total"); totalVal.textContent = money(total());
    send.textContent = tr("cart.send");
        send.setAttribute("aria-disabled", ids.length ? "false" : "true");
    note.textContent = tr("cart.note");
  }
  function mark(){
    document.querySelectorAll("[data-add]").forEach(function(b){
      var inCart = ids.indexOf(b.dataset.add) >= 0, s = b.querySelector("span");
      b.classList.toggle("is-in", inCart);
      if (s) s.textContent = tr(inCart ? "cart.added" : "cart.add");
    });
  }
  document.addEventListener("click", function(ev){
    var b = ev.target.closest && ev.target.closest("[data-add]");
    if (!b) return;
    var id = b.dataset.add;
    if (ids.indexOf(id) < 0) { ids.push(id); save(); }
    render(); mark();
    fab.classList.remove("pop"); void fab.offsetWidth; fab.classList.add("pop");
  });
  fab.addEventListener("click", function(){ panel.hidden = !panel.hidden; });
  close.addEventListener("click", function(){ panel.hidden = true; });
  send.addEventListener("click", function(ev){ if (!ids.length) ev.preventDefault(); });
  document.addEventListener("keydown", function(ev){ if (ev.key === "Escape") panel.hidden = true; });
  document.addEventListener("langchange", function(){ render(); mark(); });
  load(); render(); mark();
})();
