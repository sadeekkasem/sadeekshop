/* SkillPostApp – anonymous counting of visits and "Buy" clicks for the owner's statistics.
   No cookies, no local storage, no IP address, no personal data: only page, product, store, referrer site, device type and language. */
(function () {
  "use strict";
  var SB = "https://opauvtpuiqrywpsgcorv.supabase.co", KEY = "sb_publishable_FqN53bpc23Le9WVCuUnc5g_ZQQTqnDD";
  var ua = navigator.userAgent || "";
  if (navigator.webdriver || /bot|crawl|spider|slurp|preview|headless|lighthouse|pagespeed/i.test(ua)) return;
  if (!window.fetch || location.protocol !== "https:") return;

  function device() { var w = Math.min(screen.width || 0, window.innerWidth || 9999); return w < 700 ? "m" : (w < 1100 ? "t" : "d"); }
  function lang() { var l = (document.documentElement.lang || "").slice(0, 2); return /^(ar|en|fi)$/.test(l) ? l : ""; }
  function ref() {
    try {
      var q = new URLSearchParams(location.search), utm = q.get("utm_source") || q.get("ref");
      if (utm) return utm.toLowerCase().replace(/[^a-z0-9._-]/g, "").slice(0, 60);
      if (!document.referrer) return "";
      var h = new URL(document.referrer).hostname.replace(/^www\./, "").replace(/^(m|l|lm)\./, "");
      return h === location.hostname.replace(/^www\./, "") ? "" : h.slice(0, 60);
    } catch (e) { return ""; }
  }
  var base = { page: location.pathname.slice(0, 120), device: device(), lang: lang() };
  function send(rows) {
    if (!rows.length) return;
    try {
      fetch(SB + "/rest/v1/events", {
        method: "POST", keepalive: true,
        headers: { "apikey": KEY, "authorization": "Bearer " + KEY, "content-type": "application/json", "prefer": "return=minimal" },
        body: JSON.stringify(rows)
      }).catch(function () {});
    } catch (e) {}
  }
  function row(kind, extra) { var r = { kind: kind, page: base.page, device: base.device, lang: base.lang, product: "", store: "", ref: "" }; for (var k in extra) r[k] = extra[k]; return r; }

  // 1) the visit
  send([row("view", { ref: ref() })]);

  // 2) which products the visitor actually saw (counted once per page view)
  var seen = {}, queue = [];
  function flush() { if (queue.length) { send(queue); queue = []; } }
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (list) {
      list.forEach(function (en) {
        var pid = en.target.getAttribute("data-pid");
        if (en.isIntersecting && pid && !seen[pid]) { seen[pid] = 1; queue.push(row("seen", { product: pid })); io.unobserve(en.target); }
      });
      if (queue.length >= 10) flush();
    }, { threshold: 0.5 });
    document.querySelectorAll("[data-pid]").forEach(function (el) { if (el.tagName === "ARTICLE") io.observe(el); });
  }
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "hidden") flush(); });
  window.addEventListener("pagehide", flush);

  // 3) clicks on Buy / store links
  document.addEventListener("click", function (ev) {
    var a = ev.target.closest && ev.target.closest("a[href]");
    if (!a) return;
    var host = "";
    try { host = new URL(a.href, location.href).hostname.replace(/^www\./, ""); } catch (e) { return; }
    if (!host || host === location.hostname.replace(/^www\./, "")) return;
    if (!/(^|\.)(payhip\.com|etsy\.com|etsy\.me|sikka\.me|sikka\.sa|gumroad\.com|gum\.co)$/.test(host) && !a.closest("[data-pid]") && !a.hasAttribute("data-store")) return;
    var holder = a.closest("[data-pid]");
    flush();
    send([row("click", { product: holder ? holder.getAttribute("data-pid") : "", store: host.slice(0, 60) })]);
  }, true);
})();
