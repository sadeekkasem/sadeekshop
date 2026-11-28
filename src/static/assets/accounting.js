/* SkillPostApp – accounting page. All numbers come from AccCore (assets/acc-core.js);
 * all writes go through the database functions in docs/accounting.sql, which refuse anything unbalanced. */
(function () {
  "use strict";
  var SB_URL = "https://opauvtpuiqrywpsgcorv.supabase.co";
  var SB_KEY = "sb_publishable_FqN53bpc23Le9WVCuUnc5g_ZQQTqnDD";
  var C = window.AccCore, $ = function (id) { return document.getElementById(id); };
  var sb = window.supabase.createClient(SB_URL, SB_KEY);
  var S = { accounts: [], am: {}, settings: {}, fx: [], budget: [], lines: [], tab: "ov", st: "is", jLimit: 100,
    charts: {}, bdDirty: false, editId: null };
  var AUTO = { sale: 1, refund: 1 };
  var MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
  var CF_AR = { op: "تشغيلي", inv: "استثماري", fin: "تمويلي" };
  var TYPE_ONE = { asset: "أصل", liability: "التزام", equity: "حقوق ملكية", revenue: "إيراد", expense: "مصروف" };

  /* ---------- small helpers ---------- */
  function el(tag, props, kids) {
    var e = document.createElement(tag);
    Object.keys(props || {}).forEach(function (k) {
      var v = props[k]; if (v === undefined || v === null || v === false) return;
      if (k === "class") e.className = v; else if (k === "text") e.textContent = v;
      else if (k.slice(0, 2) === "on") e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? "" : v);
    });
    (kids || []).forEach(function (c) { if (c !== null && c !== undefined && c !== false) e.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return e;
  }
  var toastT = null;
  function toast(msg, err) { var t = $("toast"); t.textContent = msg; t.className = err ? "err" : ""; t.style.display = "block"; clearTimeout(toastT); toastT = setTimeout(function () { t.style.display = "none"; }, err ? 8000 : 3500); }
  function explain(e) {
    var m = (e && (e.message || e.details)) || String(e);
    var map = [
      [/not_admin/, "هذا الحساب ليس مديراً."],
      [/unbalanced_entry/, "القيد غير متوازن: مجموع المدين لا يساوي مجموع الدائن."],
      [/entry_needs_two_lines/, "القيد يحتاج سطرين على الأقل."],
      [/line_debit_or_credit/, "كل سطر يجب أن يكون مديناً أو دائناً، وليس الاثنين ولا صفراً."],
      [/two_decimals/, "المبالغ يجب أن تكون بخانتين عشريتين على الأكثر."],
      [/negative_amount/, "لا تُكتب مبالغ سالبة: استخدم عمود المدين أو الدائن."],
      [/period_locked/, "هذه الفترة مقفلة (تاريخ الإقفال في الإعدادات). لا يمكن إضافة أو تعديل قيود بتاريخ قبله."],
      [/account_inactive/, "الحساب غير موجود أو موقوف. فعّله من دليل الحسابات أو اختر حساباً آخر."],
      [/auto_entry/, "قيود البيع والاسترداد تلقائية: عدّل البيع من لوحة التحكم ثم اضغط «تحديث المبيعات»."],
      [/system_account/, "هذا حساب نظام يستخدمه التسجيل التلقائي: لا يُحذف ولا يُوقف ولا يتغير نوعه."],
      [/account_in_use/, "لا يمكن تغيير نوع حساب مستخدم في قيود."],
      [/acc_lines_account_code_fkey|violates foreign key/, "الحساب مستخدم في قيود أو موازنة: أوقفه بدلاً من حذفه."],
      [/lock_in_future/, "تاريخ الإقفال لا يمكن أن يكون في المستقبل."],
      [/duplicate key|already exists/, "هذا الرقم موجود مسبقاً."],
      [/date_required/, "التاريخ مطلوب."],
      [/acc_code_check|code_check/, "رقم الحساب يجب أن يكون من 3 إلى 6 أرقام."],
      [/relation .* does not exist|Could not find the (table|function)|schema cache/, "نظام المحاسبة غير مفعّل: نفّذ docs/accounting.sql في Supabase مرة واحدة."],
      [/permission denied|row-level security/, "ليست لديك صلاحية لهذا الإجراء."]
    ];
    for (var i = 0; i < map.length; i++) if (map[i][0].test(m)) return map[i][1];
    return m;
  }
  function pad(n) { return String(n).padStart(2, "0"); }
  function iso(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function today() { return iso(new Date()); }
  function f(c) { return C.fmt(c); }
  function dt(x) { return "\u2066" + x + "\u2069"; }   // keep dates/numbers left-to-right inside Arabic text
  function eur(c) { return C.fmt(c) + " €"; }
  function num(c, cls) { return el("td", { class: "n" + (c < 0 ? " neg" : "") + (cls ? " " + cls : ""), text: C.fmt(c) }); }
  function numBlank(c) { return el("td", { class: "n", text: c ? C.fmt(c) : "" }); }
  function accName(code) { var a = S.am[code]; return a ? code + " · " + a.name_ar : code; }
  function inPeriod(d) { return d >= S.from && d <= S.to; }
  function arm(btn, label, fn) {
    if (btn.dataset.arm !== "1") { var old = btn.textContent; btn.dataset.arm = "1"; btn.textContent = label || "تأكيد؟";
      setTimeout(function () { if (btn.dataset.arm === "1") { btn.dataset.arm = ""; btn.textContent = old; } }, 4000); return; }
    btn.dataset.arm = ""; fn();
  }
  function download(name, text, type) {
    var a = el("a", { href: URL.createObjectURL(new Blob([text], { type: type || "text/csv;charset=utf-8" })), download: name });
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 3000);
  }
  function table(head, rows) {
    var t = el("table"), th = el("tr");
    head.forEach(function (h) { th.appendChild(el("th", { class: h[1] ? "n" : "", text: h[0] })); });
    t.appendChild(el("thead", {}, [th]));
    var tb = el("tbody"); rows.forEach(function (r) { tb.appendChild(r); }); t.appendChild(tb);
    return t;
  }
  function put(id, node) { var x = $(id); x.textContent = ""; if (node) x.appendChild(node); }
  function cssv(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }

  /* ---------- loading ---------- */
  async function pageAll(build) {
    var all = [], from = 0, step = 1000;
    for (;;) {
      var r = await build().range(from, from + step - 1);
      if (r.error) throw r.error;
      all = all.concat(r.data || []);
      if (!r.data || r.data.length < step) break;
      from += step;
    }
    return all;
  }
  async function loadMeta() {
    var r = await Promise.all([
      sb.from("acc_accounts").select("*").order("code"),
      sb.from("acc_settings").select("*").eq("id", 1).maybeSingle(),
      sb.from("acc_fx_rates").select("*").order("currency").order("month", { ascending: false }),
      sb.from("acc_budget").select("*")
    ]);
    for (var i = 0; i < r.length; i++) if (r[i].error) throw r[i].error;
    S.accounts = r[0].data || []; S.am = C.accMap(S.accounts);
    S.settings = r[1].data || { vat_enabled: false, vat_rate: 25.5, fiscal_start_month: 1, company_name: "" };
    S.fx = r[2].data || []; S.budget = r[3].data || [];
    $("coName").textContent = S.settings.company_name ? "· " + S.settings.company_name : "";
  }
  async function loadLines() {
    S.lines = await pageAll(function () {
      return sb.from("acc_ledger_v").select("*").order("entry_date").order("entry_id").order("line_no");
    });
  }
  async function reloadAll() { await loadMeta(); await loadLines(); fillSelects(); render(); }

  async function sync(silent) {
    var b = $("syncBtn"); b.disabled = true;
    try {
      var r = await sb.rpc("acc_sync_sales");
      if (r.error) throw r.error;
      var j = r.data || {}, msg = [];
      if (j.posted) msg.push("سُجّل " + j.posted + " بيع");
      if (j.refunds) msg.push(j.refunds + " استرداد");
      if (j.removed) msg.push("حُذف " + j.removed + " قيد لبيع محذوف");
      $("syncInfo").textContent = "آخر تحديث للمبيعات: " + new Date().toLocaleTimeString("ar", { hour: "2-digit", minute: "2-digit" });
      var warn = [];
      if (j.missing_rates && j.missing_rates.length) warn.push("مبيعات بعملة " + j.missing_rates.join("، ") + " لم تُسجَّل لأنه لا يوجد سعر صرف لها. أضفه من ⚙️ الإعدادات.");
      if (j.invalid) warn.push(j.invalid + " مبيعة لم تُسجَّل لأن أرقامها غير منطقية (مثلاً الرسوم أكبر من المبلغ). راجع 🧹 تنظيف البيانات.");
      if (j.locked) warn.push(j.locked + " مبيعة تغيّرت داخل فترة مقفلة ولم يُعدَّل قيدها.");
      S.syncWarn = warn;
      if (!silent || msg.length) toast(msg.length ? msg.join("، ") : "لا توجد مبيعات جديدة.");
      return true;
    } catch (e) { toast("تعذّر تحديث المبيعات: " + explain(e), true); return false; }
    finally { b.disabled = false; }
  }

  /* ---------- period ---------- */
  function setPreset(p) {
    var t = new Date(), y = t.getFullYear(), m = t.getMonth(), fy = Number(S.settings.fiscal_start_month) || 1, from, to = today();
    if (p === "m") from = y + "-" + pad(m + 1) + "-01";
    else if (p === "pm") { var d = new Date(y, m - 1, 1); from = iso(d); to = iso(new Date(y, m, 0)); }
    else if (p === "q") from = y + "-" + pad(Math.floor(m / 3) * 3 + 1) + "-01";
    else if (p === "py") { var s = C.fyStart(today(), fy), py = (Number(s.slice(0, 4)) - 1) + s.slice(4); from = py; var e = new Date(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, 0); to = iso(e); }
    else if (p === "all") {
      from = S.lines.length ? S.lines.reduce(function (a, l) { return l.entry_date < a ? l.entry_date : a; }, today()) : today().slice(0, 4) + "-01-01";
      var last = S.lines.reduce(function (a, l) { return l.entry_date > a ? l.entry_date : a; }, today()); to = last;
    } else if (p === "custom") return;
    else from = C.fyStart(today(), fy);
    $("from").value = from; $("to").value = to; S.from = from; S.to = to;
  }
  function readPeriod() {
    var a = $("from").value, b = $("to").value;
    if (!a || !b) return false;
    if (a > b) { toast("تاريخ البداية بعد تاريخ النهاية.", true); return false; }
    S.from = a; S.to = b; return true;
  }

  /* ---------- tabs ---------- */
  function tab(t) {
    S.tab = t;
    document.querySelectorAll(".tabs[role=tablist] button").forEach(function (b) { b.className = b.dataset.t === t ? "on" : ""; });
    document.querySelectorAll(".pane").forEach(function (p) { p.hidden = p.id !== "p_" + t; });
    render();
  }
  function render() {
    try {
      ({ ov: renderOverview, jr: renderJournal, lg: renderLedger, tb: renderTB, st: renderStatements, bd: renderBudget,
        cl: function () {}, fa: renderAssets, ac: renderAccounts, se: renderSettings, au: function () { S.auLimit = 200; loadAudit(); } })[S.tab]();
    } catch (e) { console.error(e); toast("خطأ في العرض: " + (e.message || e), true); }
  }

  /* ---------- charts ---------- */
  function chart(id, cfg) {
    if (S.charts[id]) { S.charts[id].destroy(); delete S.charts[id]; }
    var cv = $(id);
    if (!window.Chart) { cv.parentNode.hidden = true; var d = cv.parentNode.nextElementSibling; if (d && d.tagName === "DETAILS") d.open = true; return; }
    S.charts[id] = new window.Chart(cv, cfg);
  }
  function baseOpts(horizontal) {
    var mut = cssv("--mut"), grid = cssv("--grid");
    var money = { color: mut, font: { family: "Cairo", size: 11 }, callback: function (v) { return C.fmt(Math.round(v * 100)).replace(/\.00$/, ""); } };
    var cat = { color: mut, font: { family: "Cairo", size: 11 } };
    return {
      responsive: true, maintainAspectRatio: false, animation: false, indexAxis: horizontal ? "y" : "x",
      interaction: { mode: horizontal ? "nearest" : "index", intersect: false },
      plugins: { legend: { display: false },
        tooltip: { rtl: true, textDirection: "rtl", bodyFont: { family: "Cairo" }, titleFont: { family: "Cairo" },
          callbacks: { label: function (ctx) { var v = horizontal ? ctx.parsed.x : ctx.parsed.y; return (ctx.dataset.label ? ctx.dataset.label + ": " : "") + eur(Math.round(v * 100)); } } } },
      scales: horizontal
        ? { x: { grid: { color: grid }, border: { display: false }, ticks: money, beginAtZero: true }, y: { grid: { display: false }, ticks: cat } }
        : { x: { grid: { display: false }, ticks: cat }, y: { grid: { color: grid }, border: { display: false }, ticks: money, beginAtZero: true } }
    };
  }
  function bar(label, data, color) {
    return { type: "bar", label: label, data: data, backgroundColor: color, borderRadius: 4, borderSkipped: "start",
      maxBarThickness: 26, categoryPercentage: 0.7, barPercentage: 0.9, borderColor: cssv("--card"), borderWidth: { left: 1, right: 1 } };
  }
  function monthLabel(k) { return MONTHS[Number(k.slice(5, 7)) - 1] + " " + k.slice(2, 4); }

  /* ---------- overview ---------- */
  function renderOverview() {
    var is = C.incomeStatement(S.lines, S.accounts, S.from, S.to),
      cashNow = S.lines.reduce(function (s, l) { return (S.am[l.account_code] || {}).is_cash && l.entry_date <= S.to ? s + C.cents(l.debit) - C.cents(l.credit) : s; }, 0),
      nSales = {}, exp = is.totalCogs + is.totalOpex;
    S.lines.forEach(function (l) { if (l.kind === "sale" && inPeriod(l.entry_date)) nSales[l.entry_id] = 1; });
    var k = [
      ["الإيرادات (صافي الاسترداد)", eur(is.totalRevenue), Object.keys(nSales).length + " عملية بيع"],
      ["المصروفات", eur(exp), is.totalRevenue ? "≈ " + C.pct(exp, is.totalRevenue) + "% من الإيرادات" : ""],
      ["صافي الربح", eur(is.netProfit), is.netMargin === null ? "" : "هامش " + is.netMargin + "%"],
      ["النقدية في " + dt(S.to), eur(cashNow), "صندوق + بنك + أرصدة المنصات"]
    ];
    if (S.settings.vat_enabled) { var v = C.vatReport(S.lines, S.from, S.to); k.push(["ضريبة مستحقة للفترة", eur(v.payable), "مخرجات " + f(v.output) + " − مدخلات " + f(v.input)]); }
    put("kpis", null);
    k.forEach(function (x, i) {
      var b = el("b", { text: x[1] }); if (i === 2 && is.netProfit < 0) b.className = "neg";
      $("kpis").appendChild(el("div", { class: "stat" }, [el("span", { text: x[0] }), b, el("small", { text: x[2] })]));
    });
    var w = $("ovWarn"); w.textContent = ""; w.hidden = !(S.syncWarn && S.syncWarn.length);
    (S.syncWarn || []).forEach(function (t) { w.appendChild(el("p", { class: "warnc", style: "margin:4px 0", text: "⚠ " + t })); });
    if (!S.lines.length) { w.hidden = false; w.appendChild(el("p", { style: "margin:4px 0", text: "لا توجد قيود بعد. ابدأ من 📓 دفتر اليومية: سجّل رأس المال (تحويل من «رأس المال» إلى «البنك») ثم مصروفاتك. المبيعات تُسجَّل تلقائياً." })); }

    var mo = C.monthly(S.lines, S.accounts, S.from, S.to);
    if (mo.length > 36) mo = mo.slice(-36);
    var o = baseOpts(false);
    chart("chMonthly", { data: { labels: mo.map(function (m) { return monthLabel(m.month); }), datasets: [
      bar("الإيرادات", mo.map(function (m) { return m.revenue / 100; }), cssv("--s1")),
      bar("المصروفات", mo.map(function (m) { return m.expense / 100; }), cssv("--s2")),
      { type: "line", label: "صافي الربح", data: mo.map(function (m) { return m.profit / 100; }), borderColor: cssv("--s3"), backgroundColor: cssv("--s3"),
        borderWidth: 2, pointRadius: 4, pointHoverRadius: 6, pointBorderColor: cssv("--card"), pointBorderWidth: 2, tension: 0 }
    ] }, options: o });
    put("tMonthly", table([["الشهر"], ["الإيرادات", 1], ["المصروفات", 1], ["صافي الربح", 1], ["النقدية آخر الشهر", 1]],
      mo.map(function (m) { return el("tr", {}, [el("td", { text: m.month }), num(m.revenue), num(m.expense), num(m.profit), num(m.cash)]); })));

    chart("chCash", { type: "line", data: { labels: mo.map(function (m) { return monthLabel(m.month); }), datasets: [{ label: "النقدية", data: mo.map(function (m) { return m.cash / 100; }),
      borderColor: cssv("--s1"), backgroundColor: cssv("--s1"), borderWidth: 2, pointRadius: 4, pointBorderColor: cssv("--card"), pointBorderWidth: 2, tension: 0 }] },
      options: (function () { var x = baseOpts(false); x.scales.y.beginAtZero = false; return x; })() });
    put("tCash", table([["الشهر"], ["النقدية آخر الشهر", 1]], mo.map(function (m) { return el("tr", {}, [el("td", { text: m.month }), num(m.cash)]); })));

    hbar("chExp", "tExp", C.breakdown(S.lines, S.accounts, S.from, S.to, "expense").map(function (r) { return { k: r.name, v: r.amount }; }), cssv("--s2"), "المصروف");
    hbar("chPlat", "tPlat", C.salesByPlatform(S.lines, S.accounts, S.from, S.to).map(function (r) { return { k: platName(r.platform), v: r.amount }; }), cssv("--s1"), "صافي المبيعات");
    hbar("chRev", "tRev", C.breakdown(S.lines, S.accounts, S.from, S.to, "revenue").map(function (r) { return { k: r.name, v: r.amount }; }), cssv("--s1"), "الإيراد");
  }
  function platName(p) { return ({ payhip: "Payhip", gumroad: "Gumroad", etsy: "Etsy", sikka: "سكة", other: "أخرى" })[p] || p; }
  function hbar(cid, tid, rows, color, label) {
    var top = rows.slice(0, 8);
    if (rows.length > 8) top.push({ k: "أخرى (" + (rows.length - 8) + ")", v: rows.slice(8).reduce(function (s, r) { return s + r.v; }, 0) });
    var box = $(cid).parentNode, empty = box.parentNode.querySelector(".empty");
    if (!top.length) { if (!empty) box.parentNode.insertBefore(el("p", { class: "muted empty", text: "لا توجد بيانات في هذه الفترة." }), box); box.hidden = true; }
    else { if (empty) empty.remove(); box.hidden = false; }
    chart(cid, { data: { labels: top.map(function (r) { return r.k; }), datasets: [bar(label, top.map(function (r) { return r.v / 100; }), color)] }, options: baseOpts(true) });
    put(tid, table([["البند"], [label, 1]], rows.map(function (r) { return el("tr", {}, [el("td", { text: r.k }), num(r.v)]); })));
  }

  /* ---------- journal ---------- */
  function renderJournal() {
    var kind = $("jKind").value, q = C.cleanText($("jSearch").value).toLowerCase();
    var list = C.journal(S.lines).filter(function (e) {
      if (!inPeriod(e.date) || (kind && e.kind !== kind)) return false;
      if (!q) return true;
      var hay = [e.id, e.memo, e.partner, e.ref].concat(e.lines.map(function (l) { return accName(l.account) + " " + C.fmt(l.dr || l.cr); })).join(" ").toLowerCase();
      return hay.indexOf(q) >= 0;
    }).reverse();
    var rows = [], shown = list.slice(0, S.jLimit), tDr = 0, tCr = 0;
    list.forEach(function (e) { tDr += e.dr; tCr += e.cr; });
    shown.forEach(function (e) {
      var acts = el("td", { class: "noprint", style: "white-space:nowrap" });
      if (AUTO[e.kind]) acts.appendChild(el("span", { class: "tag auto", text: "تلقائي" }));
      else {
        acts.appendChild(el("button", { class: "sm", text: "تعديل", onclick: function () { openEntry(e); } }));
        acts.appendChild(document.createTextNode(" "));
        var del = el("button", { class: "sm bad", text: "حذف" });
        del.addEventListener("click", function () { arm(del, "تأكيد الحذف؟", function () { delEntry(e.id); }); });
        acts.appendChild(del);
      }
      var desc = [e.memo || "—"]; if (e.partner) desc.push(" · " + (AUTO[e.kind] ? platName(e.partner) : e.partner)); if (e.ref && !AUTO[e.kind]) desc.push(" · مستند " + e.ref);
      if (e.currency && e.currency !== "EUR" && e.orig_amount) desc.push(" · " + dt(e.orig_amount + " " + e.currency + " × " + Number(e.fx_rate)));
      rows.push(el("tr", { class: "sub" }, [el("td", { text: e.date }), el("td", { class: "n", text: "#" + e.id }),
        el("td", {}, [el("span", { class: "tag", text: C.KIND_AR[e.kind] || e.kind })]), el("td", { text: desc.join("") }),
        num(e.dr), num(e.cr), acts]));
      e.lines.forEach(function (l) {
        rows.push(el("tr", { class: "l2" }, [el("td"), el("td"), el("td"),
          el("td", { style: l.cr ? "padding-inline-start:28px" : "", text: accName(l.account) + (l.memo ? " — " + l.memo : "") }),
          numBlank(l.dr), numBlank(l.cr), el("td", { class: "noprint" })]));
      });
    });
    if (list.length) rows.push(el("tr", { class: "tot" }, [el("td", { text: "الإجمالي" }), el("td"), el("td"), el("td", { text: list.length + " قيد" }), num(tDr), num(tCr), el("td", { class: "noprint" })]));
    put("jTable", list.length ? table([["التاريخ"], ["رقم", 1], ["النوع"], ["البيان / الحساب"], ["مدين", 1], ["دائن", 1], [""]], rows)
      : el("p", { class: "muted", text: "لا توجد قيود في هذه الفترة." }));
    $("jMore").hidden = list.length <= S.jLimit;
    $("jCount").textContent = list.length ? "يُعرض " + shown.length + " من " + list.length + " قيد (الأحدث أولاً)" + (tDr === tCr ? " · المدين = الدائن ✓" : "") : "";
  }
  async function delEntry(id) {
    var r = await sb.rpc("acc_delete_entry", { p_id: id });
    if (r.error) { toast(explain(r.error), true); return; }
    toast("حُذف القيد #" + id); await loadLines(); render();
  }

  /* ---------- account selects ---------- */
  function accOptions(sel, filter, includeCode, placeholder) {
    var cur = sel.value; sel.textContent = "";
    if (placeholder) sel.appendChild(el("option", { value: "", text: placeholder }));
    ["asset", "liability", "equity", "revenue", "expense"].forEach(function (t) {
      var g = el("optgroup", { label: C.TYPE_AR[t] });
      S.accounts.forEach(function (a) {
        if (a.type !== t) return;
        if ((!a.active || (filter && !filter(a))) && a.code !== includeCode) return;
        g.appendChild(el("option", { value: a.code, text: a.code + " · " + a.name_ar + (a.active ? "" : " (موقوف)") }));
      });
      if (g.children.length) sel.appendChild(g);
    });
    if (cur && sel.querySelector('option[value="' + cur + '"]')) sel.value = cur;
  }
  function fillSelects() {
    var lg = $("lgAcc"), cur = lg.value;
    accOptions(lg, function () { return true; }, null);
    S.accounts.forEach(function (a) { if (!a.active && !lg.querySelector('option[value="' + a.code + '"]')) lg.appendChild(el("option", { value: a.code, text: a.code + " · " + a.name_ar + " (موقوف)" })); });
    lg.value = cur && S.am[cur] ? cur : (S.am["1010"] ? "1010" : (S.accounts[0] || {}).code);
    var ic = $("imCash"), icv = ic.value; accOptions(ic, function (a) { return a.is_cash; }, null); ic.value = icv && S.am[icv] ? icv : (S.am["1010"] ? "1010" : ic.value);
    var dl = $("partnersList"), seen = {}; dl.textContent = "";
    S.lines.forEach(function (l) { if (AUTO[l.kind]) return; var p = C.cleanText(l.partner); if (p && !seen[p]) { seen[p] = 1; dl.appendChild(el("option", { value: p })); } });
  }

  /* ---------- manual entry dialog ---------- */
  function lineRow(l) {
    var sel = el("select", { "aria-label": "الحساب" }), dr = el("input", { type: "number", min: "0", step: "0.01", dir: "ltr", "aria-label": "مدين" }),
      cr = el("input", { type: "number", min: "0", step: "0.01", dir: "ltr", "aria-label": "دائن" }), memo = el("input", { maxlength: "200", "aria-label": "ملاحظة" });
    accOptions(sel, null, l && l.account, "— اختر الحساب —");
    if (l) { sel.value = l.account || ""; dr.value = l.debit ? Number(l.debit).toFixed(2) : ""; cr.value = l.credit ? Number(l.credit).toFixed(2) : ""; memo.value = l.memo || ""; }
    dr.addEventListener("input", function () { if (dr.value) cr.value = ""; totals(); });
    cr.addEventListener("input", function () { if (cr.value) dr.value = ""; totals(); });
    sel.addEventListener("change", totals);
    var rm = el("button", { type: "button", class: "sm", text: "✕", "aria-label": "حذف السطر", onclick: function () { tr.remove(); totals(); } });
    var tr = el("tr", {}, [el("td", { style: "min-width:220px" }, [sel]), el("td", { style: "width:120px" }, [dr]), el("td", { style: "width:120px" }, [cr]), el("td", {}, [memo]), el("td", {}, [rm])]);
    tr._get = function () { return { account: sel.value, dr: C.cents(dr.value), cr: C.cents(cr.value), drRaw: dr.value, crRaw: cr.value, memo: C.cleanText(memo.value) }; };
    return tr;
  }
  function decimalsOk(v) { return !v || /^\d+(\.\d{1,2})?$/.test(String(v).trim()); }
  function readLines() {
    var out = [], err = null;
    Array.prototype.forEach.call($("eLines").children, function (tr) {
      var g = tr._get();
      if (!g.account && !g.drRaw && !g.crRaw) return;
      if (!g.account) err = err || "اختر الحساب في كل سطر.";
      if (!decimalsOk(g.drRaw) || !decimalsOk(g.crRaw) || isNaN(g.dr) || isNaN(g.cr)) err = err || "مبلغ غير صحيح (استخدم رقماً بخانتين عشريتين على الأكثر).";
      if ((g.dr > 0) === (g.cr > 0)) err = err || "كل سطر يحتاج مبلغاً في المدين أو الدائن.";
      out.push(g);
    });
    return { lines: out, err: err };
  }
  function totals() {
    var r = readLines(), d = 0, c = 0;
    r.lines.forEach(function (l) { d += l.dr || 0; c += l.cr || 0; });
    $("eDr").textContent = f(d); $("eCr").textContent = f(c);
    var diff = d - c, ok = !r.err && r.lines.length >= 2 && diff === 0 && d > 0;
    $("eDiff").textContent = r.err ? r.err : diff === 0 ? (d ? "متوازن ✓" : "") : "الفرق: " + f(Math.abs(diff)) + (diff > 0 ? " (المدين أكبر)" : " (الدائن أكبر)");
    $("eDiff").className = "diff " + (ok ? "ok" : "badc");
    $("eSave").disabled = !ok;
  }
  function openEntry(e, preset) {
    S.editId = e ? e.id : null;
    $("eTitle").textContent = e ? "تعديل القيد #" + e.id : "قيد يدوي";
    var ks = $("e_kind"); ks.textContent = "";
    ["manual", "opening", "adjust", "transfer", "purchase", "expense", "vat"].forEach(function (k) { ks.appendChild(el("option", { value: k, text: C.KIND_AR[k] })); });
    var src = e || preset || {};
    $("e_date").value = src.date || today(); ks.value = src.kind || "manual";
    $("e_ref").value = src.ref || ""; $("e_partner").value = src.partner || ""; $("e_memo").value = src.memo || "";
    S.editMeta = e ? { currency: e.currency, fx_rate: e.fx_rate, orig_amount: e.orig_amount } : (preset && preset.meta) || null;
    var body = $("eLines"); body.textContent = "";
    var ls = e ? e.lines.map(function (l) { return { account: l.account, debit: l.dr / 100, credit: l.cr / 100, memo: l.memo }; }) : (preset && preset.lines) || [{}, {}];
    ls.forEach(function (l) { body.appendChild(lineRow(l)); });
    if (ls.length < 2) body.appendChild(lineRow());
    totals(); $("dEntry").showModal();
  }
  async function saveEntry(payload, dlg) {
    var r = await sb.rpc("acc_save_entry", { p: payload });
    if (r.error) { toast(explain(r.error), true); return false; }
    if (dlg) $(dlg).close();
    toast("تم حفظ القيد #" + r.data); await loadLines(); fillSelects(); render(); return true;
  }
  $("eAdd").addEventListener("click", function () { $("eLines").appendChild(lineRow()); totals(); });
  $("fEntry").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var r = readLines(); if (r.err) { toast(r.err, true); return; }
    var p = { id: S.editId, date: $("e_date").value, kind: $("e_kind").value, ref: C.cleanText($("e_ref").value), partner: C.cleanText($("e_partner").value),
      memo: C.cleanText($("e_memo").value),
      lines: r.lines.map(function (l) { return { account: l.account, debit: (l.dr / 100).toFixed(2), credit: (l.cr / 100).toFixed(2), memo: l.memo }; }) };
    if (S.editMeta) { p.currency = S.editMeta.currency; p.fx_rate = S.editMeta.fx_rate; p.orig_amount = S.editMeta.orig_amount; }
    saveEntry(p, "dEntry");
  });

  /* ---------- expense / purchase dialog ---------- */
  function rateFor(cur, date) {
    cur = String(cur || "").toUpperCase(); if (cur === "EUR") return 1;
    var best = null; S.fx.forEach(function (r) { if (r.currency === cur && r.month <= date && (!best || r.month > best.month)) best = r; });
    return best ? Number(best.rate_to_eur) : null;
  }
  function openExp() {
    accOptions($("x_acc"), function (a) { return a.type === "expense" || (a.type === "asset" && !a.is_cash && a.code !== "1300" && a.code !== "1510"); }, null, "— اختر —");
    var pay = $("x_pay"); accOptions(pay, function (a) { return a.is_cash || a.code === "2000" || a.code === "3000" || a.type === "liability" && a.code !== "2100" && a.code !== "2110"; }, null);
    if (S.am["1010"]) pay.value = "1010";
    ["x_partner", "x_ref", "x_amt", "x_memo"].forEach(function (id) { $(id).value = ""; });
    $("x_date").value = today(); $("x_cur").value = "EUR"; $("x_rate").value = "";
    $("x_vatBox").hidden = !S.settings.vat_enabled; $("x_vat").checked = !!S.settings.vat_enabled; $("x_vrate").value = S.settings.vat_rate;
    expPreview(); $("dExp").showModal();
  }
  function expBuild() {
    var cur = C.cleanText($("x_cur").value).toUpperCase() || "EUR", date = $("x_date").value;
    $("x_rateBox").hidden = cur === "EUR";
    if (cur !== "EUR" && !$("x_rate").value) { var rr = rateFor(cur, date); if (rr) $("x_rate").value = rr; }
    if (!/^[A-Z]{3}$/.test(cur)) throw new Error("رمز العملة يجب أن يكون 3 أحرف مثل EUR أو USD.");
    var amt = $("x_amt").value; if (!decimalsOk(amt) || !(C.cents(amt) > 0)) throw new Error("اكتب المبلغ (رقم موجب بخانتين عشريتين على الأكثر).");
    var rate = cur === "EUR" ? 1 : Number($("x_rate").value);
    if (!(rate > 0)) throw new Error("اكتب سعر صرف " + cur + " إلى اليورو.");
    if (!$("x_acc").value) throw new Error("اختر الحساب.");
    if ($("x_acc").value === $("x_pay").value) throw new Error("الحساب وحساب الدفع لا يمكن أن يكونا نفس الحساب.");
    var eurC = C.convert(amt, rate), vatOn = S.settings.vat_enabled && $("x_vat").checked;
    var vr = Number($("x_vrate").value); if (vatOn && !(vr >= 0 && vr < 100)) throw new Error("نسبة الضريبة غير صحيحة.");
    var lines = C.purchaseLines({ gross: eurC / 100, vat: vatOn, vatRate: vr, account: $("x_acc").value, payFrom: $("x_pay").value });
    return { cur: cur, rate: rate, amt: amt, lines: lines };
  }
  function expPreview() {
    var box = $("x_prev"); box.textContent = "";
    try {
      var b = expBuild();
      box.appendChild(table([["الحساب"], ["مدين", 1], ["دائن", 1]], b.lines.map(function (l) { return el("tr", {}, [el("td", { text: accName(l.account) }), numBlank(C.cents(l.debit)), numBlank(C.cents(l.credit))]); })));
      $("x_save").disabled = false;
    } catch (e) { box.appendChild(el("p", { class: "muted", text: e.message })); $("x_save").disabled = true; }
  }
  ["x_kind", "x_date", "x_acc", "x_pay", "x_amt", "x_cur", "x_rate", "x_vat", "x_vrate"].forEach(function (id) { $(id).addEventListener("input", expPreview); $(id).addEventListener("change", expPreview); });
  $("x_cur").addEventListener("input", function () { $("x_rate").value = ""; });
  $("fExp").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var b; try { b = expBuild(); } catch (e) { toast(e.message, true); return; }
    var partner = C.cleanText($("x_partner").value); if (!partner) { toast("اكتب اسم المورد.", true); return; }
    saveEntry({ date: $("x_date").value, kind: $("x_kind").value, partner: partner, ref: C.cleanText($("x_ref").value),
      memo: C.cleanText($("x_memo").value) || (S.am[$("x_acc").value] || {}).name_ar || "",
      currency: b.cur, fx_rate: b.rate, orig_amount: b.amt,
      lines: b.lines.map(function (l) { return { account: l.account, debit: Number(l.debit).toFixed(2), credit: Number(l.credit).toFixed(2) }; }) }, "dExp");
  });

  /* ---------- transfer dialog ---------- */
  function openTr() {
    accOptions($("t_from"), null, null, "— اختر —"); accOptions($("t_to"), null, null, "— اختر —");
    $("t_date").value = today(); $("t_amt").value = ""; $("t_memo").value = ""; $("dTr").showModal();
  }
  $("fTr").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var a = $("t_amt").value, fr = $("t_from").value, to = $("t_to").value;
    if (!decimalsOk(a) || !(C.cents(a) > 0)) { toast("اكتب مبلغاً صحيحاً.", true); return; }
    if (!fr || !to || fr === to) { toast("اختر حسابين مختلفين.", true); return; }
    var amt = (C.cents(a) / 100).toFixed(2);
    saveEntry({ date: $("t_date").value, kind: "transfer", memo: C.cleanText($("t_memo").value) || ("تحويل من " + S.am[fr].name_ar + " إلى " + S.am[to].name_ar),
      lines: [{ account: to, debit: amt, credit: "0" }, { account: fr, debit: "0", credit: amt }] }, "dTr");
  });

  /* ---------- ledger ---------- */
  function renderLedger() {
    var code = $("lgAcc").value; if (!code) return;
    var L = C.ledger(S.lines, S.accounts, code, S.from, S.to), rows = [];
    var side = L.side > 0 ? "مدين" : "دائن";
    rows.push(el("tr", { class: "sub" }, [el("td", { text: S.from }), el("td"), el("td"), el("td", { text: "رصيد أول المدة" }), el("td"), el("td"), num(L.opening)]));
    L.rows.forEach(function (r) {
      rows.push(el("tr", {}, [el("td", { text: r.date }), el("td", { class: "n", text: "#" + r.entry }), el("td", {}, [el("span", { class: "tag", text: C.KIND_AR[r.kind] || r.kind })]),
        el("td", { text: [r.memo, AUTO[r.kind] ? platName(r.partner) : r.partner, r.ref && !AUTO[r.kind] ? "مستند " + r.ref : ""].filter(Boolean).join(" · ") }),
        numBlank(r.dr), numBlank(r.cr), num(r.balance)]));
    });
    rows.push(el("tr", { class: "tot" }, [el("td", { text: S.to }), el("td"), el("td"), el("td", { text: "الإجمالي ورصيد آخر المدة" }), num(L.totalDr), num(L.totalCr), num(L.closing)]));
    var wrap = el("div", {}, [el("h2", { text: accName(code) + " — " + (TYPE_ONE[L.account.type] || "") }),
      el("p", { class: "muted", text: "الرصيد بطبيعة الحساب (" + side + "): الرقم الموجب يعني رصيداً " + side + "اً، والسالب عكس طبيعته." }),
      table([["التاريخ"], ["القيد", 1], ["النوع"], ["البيان"], ["مدين", 1], ["دائن", 1], ["الرصيد", 1]], rows)]);
    put("lgTable", wrap);
    S.lgCsv = function () {
      download("ledger_" + code + "_" + S.from + "_" + S.to + ".csv", C.toCSV(L.rows.map(function (r) {
        return { date: r.date, entry: r.entry, kind: C.KIND_AR[r.kind] || r.kind, memo: r.memo, partner: r.partner, ref: r.ref, debit: r.dr / 100, credit: r.cr / 100, balance: r.balance / 100 };
      })));
    };
  }

  /* ---------- trial balance ---------- */
  function renderTB() {
    var t = C.trialBalance(S.lines, S.accounts, S.from, S.to);
    $("tbPeriod").textContent = "من " + dt(S.from) + " إلى " + dt(S.to);
    put("tbCheck", el("p", { class: t.balanced ? "ok" : "badc", text: t.balanced ? "✓ الميزان متوازن: مجموع المدين = مجموع الدائن في كل الأعمدة." : "✗ الميزان غير متوازن — راجع 🧹 تنظيف البيانات." }));
    var rows = t.rows.map(function (r) {
      return el("tr", {}, [el("td", { class: "n", text: r.code }), el("td", { text: r.name }), numBlank(r.openDr), numBlank(r.openCr), numBlank(r.dr), numBlank(r.cr), numBlank(r.closeDr), numBlank(r.closeCr)]);
    });
    var T = t.totals;
    rows.push(el("tr", { class: "tot" }, [el("td"), el("td", { text: "الإجمالي" }), num(T.openDr), num(T.openCr), num(T.dr), num(T.cr), num(T.closeDr), num(T.closeCr)]));
    put("tbTable", table([["الرقم", 1], ["الحساب"], ["أول المدة مدين", 1], ["أول المدة دائن", 1], ["الحركة مدين", 1], ["الحركة دائن", 1], ["آخر المدة مدين", 1], ["آخر المدة دائن", 1]], rows));
    S.tbCsv = function () { download("trial-balance_" + S.from + "_" + S.to + ".csv", C.toCSV(t.rows.map(function (r) {
      return { code: r.code, account: r.name, open_debit: r.openDr / 100, open_credit: r.openCr / 100, debit: r.dr / 100, credit: r.cr / 100, close_debit: r.closeDr / 100, close_credit: r.closeCr / 100 }; }))); };
  }

  /* ---------- statements ---------- */
  function sline(name, amount, cls, code) { return el("tr", { class: cls || "" }, [el("td", { class: "n", text: code || "" }), el("td", { text: name }), amount === null ? el("td") : num(amount)]); }
  function renderStatements() {
    document.querySelectorAll("#stTabs button").forEach(function (b) { b.className = b.dataset.s === S.st ? "on" : ""; });
    var rows = [], h = "", note = null, ok = null, co = S.settings.company_name || "";
    if (S.st === "is") {
      var is = C.incomeStatement(S.lines, S.accounts, S.from, S.to);
      h = "قائمة الدخل من " + dt(S.from) + " إلى " + dt(S.to);
      rows.push(sline("الإيرادات", null, "grp"));
      is.revenue.forEach(function (r) { rows.push(sline(r.name, r.amount, "", r.code)); });
      rows.push(sline("صافي الإيرادات", is.totalRevenue, "sub"));
      if (is.cogs.length) { rows.push(sline("تكلفة المبيعات", null, "grp")); is.cogs.forEach(function (r) { rows.push(sline(r.name, r.amount, "", r.code)); }); rows.push(sline("إجمالي تكلفة المبيعات", is.totalCogs, "sub")); }
      rows.push(sline("مجمل الربح" + (is.grossMargin === null ? "" : " (" + is.grossMargin + "%)"), is.grossProfit, "sub"));
      rows.push(sline("المصروفات التشغيلية", null, "grp"));
      is.opex.forEach(function (r) { rows.push(sline(r.name, r.amount, "", r.code)); });
      rows.push(sline("إجمالي المصروفات التشغيلية", is.totalOpex, "sub"));
      rows.push(sline((is.netProfit >= 0 ? "صافي الربح" : "صافي الخسارة") + (is.netMargin === null ? "" : " (هامش " + is.netMargin + "%)"), is.netProfit, "tot"));
      note = "الأرقام بعد خصم المردودات. ضريبة الدخل غير محسوبة هنا.";
    } else if (S.st === "bs") {
      var bs = C.balanceSheet(S.lines, S.accounts, S.to, S.settings.fiscal_start_month);
      h = "الميزانية العمومية (المركز المالي) في " + dt(S.to);
      rows.push(sline("الأصول", null, "grp")); bs.assets.forEach(function (r) { rows.push(sline(r.name, r.amount, "", r.code)); });
      rows.push(sline("إجمالي الأصول", bs.totalAssets, "tot"));
      rows.push(sline("الالتزامات", null, "grp")); bs.liabilities.forEach(function (r) { rows.push(sline(r.name, r.amount, "", r.code)); });
      rows.push(sline("إجمالي الالتزامات", bs.totalLiabilities, "sub"));
      rows.push(sline("حقوق الملكية", null, "grp")); bs.equity.forEach(function (r) { rows.push(sline(r.name, r.amount, "", r.code)); });
      rows.push(sline("إجمالي حقوق الملكية", bs.totalEquity, "sub"));
      rows.push(sline("إجمالي الالتزامات وحقوق الملكية", bs.totalLiabilities + bs.totalEquity, "tot"));
      ok = bs.balanced ? "✓ متوازنة: الأصول = الالتزامات + حقوق الملكية" : "✗ غير متوازنة بفارق " + f(bs.difference);
      note = "بداية السنة المالية: " + dt(bs.fyStart) + ". ربح السنة الحالية محسوب من بداية السنة المالية حتى " + dt(S.to) + ".";
    } else if (S.st === "cf") {
      var cf = C.cashFlow(S.lines, S.accounts, S.from, S.to);
      h = "قائمة التدفقات النقدية (الطريقة المباشرة) من " + dt(S.from) + " إلى " + dt(S.to);
      rows.push(sline("النقدية أول المدة", cf.opening, "sub"));
      [["op", "التدفقات من الأنشطة التشغيلية", cf.operating], ["inv", "التدفقات من الأنشطة الاستثمارية", cf.investing], ["fin", "التدفقات من الأنشطة التمويلية", cf.financing]].forEach(function (g) {
        rows.push(sline(g[1], null, "grp"));
        cf.rows.filter(function (r) { return r.group === g[0]; }).forEach(function (r) { rows.push(sline(r.name, r.amount, "", r.code)); });
        rows.push(sline("صافي " + g[1].replace("التدفقات من ", ""), g[2], "sub"));
      });
      rows.push(sline("صافي التغير في النقدية", cf.net, "sub"));
      rows.push(sline("النقدية آخر المدة", cf.closing, "tot"));
      ok = cf.balanced ? "✓ النقدية أول المدة + صافي التغير = النقدية آخر المدة" : "✗ فرق في النقدية";
      note = "النقدية = الحسابات المعلَّمة «نقدية» في دليل الحسابات (الصندوق، البنك، أرصدة المنصات). التحويل بينها لا يظهر كتدفق.";
    } else {
      var v = C.vatReport(S.lines, S.from, S.to);
      h = "ضريبة القيمة المضافة (ALV) من " + dt(S.from) + " إلى " + dt(S.to);
      rows.push(sline("ضريبة المبيعات (مخرجات)", v.output, "", "2100"));
      rows.push(sline("ضريبة المشتريات القابلة للخصم (مدخلات)", v.input, "", "1300"));
      rows.push(sline(v.payable >= 0 ? "الضريبة المستحقة للدفع" : "ضريبة مستردة لك", Math.abs(v.payable), "tot"));
      note = S.settings.vat_enabled ? "قيود التسوية لا تُحسب ضمن هذه الأرقام. بعد تقديم الإقرار سجّل قيد التسوية لنقل المبلغ إلى «الضريبة المستحقة»."
        : "خيار الضريبة غير مفعّل في الإعدادات، لذلك المبيعات تُسجَّل بلا ضريبة.";
      if (v.output || v.input) S.vatPreset = { date: S.to, kind: "vat", memo: "تسوية ضريبة القيمة المضافة " + S.from + " – " + S.to, lines: C.vatSettlementLines(v) };
      else S.vatPreset = null;
    }
    var box = el("div", {}, [el("h2", { text: h }), co ? el("p", { class: "muted", style: "margin-top:-6px", text: co }) : null,
      table([["", 1], ["البند"], ["المبلغ €", 1]], rows),
      ok ? el("p", { class: /✓/.test(ok) ? "ok" : "badc", text: ok }) : null, note ? el("p", { class: "muted", text: note }) : null]);
    if (S.st === "vat" && S.vatPreset && S.settings.vat_enabled) box.appendChild(el("button", { class: "pri noprint", text: "إنشاء قيد تسوية الضريبة", onclick: function () { openEntry(null, S.vatPreset); } }));
    put("stBody", box);
  }

  /* ---------- budget ---------- */
  function renderBudget() {
    var ys = $("bdYear"), thisY = new Date().getFullYear();
    if (!ys.children.length) {
      var minY = S.lines.reduce(function (a, l) { return Math.min(a, Number(l.entry_date.slice(0, 4))); }, thisY);
      S.budget.forEach(function (b) { minY = Math.min(minY, b.year); });
      for (var y = Math.max(minY, thisY - 5); y <= thisY + 1; y++) ys.appendChild(el("option", { value: y, text: y }));
      ys.value = thisY; ys.dataset.prev = thisY;
    }
    var Y = Number(ys.value), accs = S.accounts.filter(function (a) { return (a.type === "revenue" || a.type === "expense") && (a.active || S.budget.some(function (b) { return b.account_code === a.code && b.year === Y; })); });
    var cur = {}; S.budget.forEach(function (b) { if (b.year === Y) cur[b.account_code + ":" + b.month] = C.cents(b.amount); });
    var head = [["الحساب"]].concat(MONTHS.map(function (m) { return [m.slice(0, 3), 1]; })).concat([["سنوي ←", 1], ["الإجمالي", 1]]);
    var rows = [], lastType = null;
    accs.forEach(function (a) {
      if (a.type !== lastType) { lastType = a.type; rows.push(el("tr", { class: "grp" }, [el("td", { colspan: "15", text: C.TYPE_AR[a.type] })])); }
      var cells = [], tot = el("td", { class: "n" });
      var recalc = function () { var s = 0, bad = false; cells.forEach(function (i) { var v = i.value.trim(); if (v && (!decimalsOk(v))) bad = true; s += C.cents(v) || 0; }); tot.textContent = bad ? "؟" : f(s); };
      for (var m = 1; m <= 12; m++) {
        var c = cur[a.code + ":" + m], inp = el("input", { type: "text", inputmode: "decimal", dir: "ltr", "data-acc": a.code, "data-m": m, value: c ? (c / 100).toFixed(2) : "", "aria-label": a.name_ar + " " + MONTHS[m - 1] });
        inp.addEventListener("input", function (ev) { var ok = decimalsOk(ev.target.value.trim()); ev.target.style.borderColor = ok ? "" : "var(--bad)"; recalc(); markDirty(); });
        cells.push(inp);
      }
      var yr = el("input", { type: "text", inputmode: "decimal", dir: "ltr", placeholder: "مثلاً 1200", "aria-label": "مبلغ سنوي يوزَّع على 12 شهراً" });
      yr.addEventListener("change", function () {
        var t = C.cents(yr.value); if (!decimalsOk(yr.value.trim()) || !(t >= 0)) { toast("مبلغ سنوي غير صحيح.", true); return; }
        var per = Math.floor(t / 12), rem = t - per * 12;
        cells.forEach(function (i, k) { var v = per + (k === 11 ? rem : 0); i.value = v ? (v / 100).toFixed(2) : ""; i.style.borderColor = ""; });
        yr.value = ""; recalc(); markDirty();
      });
      recalc();
      rows.push(el("tr", {}, [el("td", { style: "white-space:nowrap", text: a.code + " · " + a.name_ar })].concat(cells.map(function (i) { return el("td", {}, [i]); })).concat([el("td", {}, [yr]), tot])));
    });
    put("bdGrid", table(head, rows));
    S.bdDirty = false; $("bdSave").disabled = true;
    renderBudgetCompare(Y);
  }
  function markDirty() { S.bdDirty = true; $("bdSave").disabled = false; }
  function renderBudgetCompare(Y) {
    var b = C.budgetVsActual(S.lines, S.accounts, S.budget, Y);
    var o = baseOpts(false);
    chart("chBud", { data: { labels: MONTHS.map(function (m) { return m.slice(0, 3); }), datasets: [
      bar("الربح الفعلي", b.months.map(function (m) { return m.profitA / 100; }), cssv("--s1")),
      bar("الربح المخطط", b.months.map(function (m) { return m.profitB / 100; }), cssv("--s2"))] }, options: o });
    put("tBud", table([["الشهر"], ["إيراد فعلي", 1], ["إيراد مخطط", 1], ["مصروف فعلي", 1], ["مصروف مخطط", 1], ["ربح فعلي", 1], ["ربح مخطط", 1]],
      b.months.map(function (m) { return el("tr", {}, [el("td", { text: MONTHS[m.month - 1] }), num(m.revA), num(m.revB), num(m.expA), num(m.expB), num(m.profitA), num(m.profitB)]); })));
    var rows = b.rows.filter(function (r) { return r.totalActual || r.totalBudget; }).map(function (r) {
      var v = el("td", { class: "n " + (r.totalBudget || r.totalActual ? (r.favourable ? "ok" : "badc") : ""), text: (r.variance > 0 ? "+" : "") + f(r.variance) });
      return el("tr", {}, [el("td", { text: r.code + " · " + r.name }), el("td", { text: TYPE_ONE[r.type] }), num(r.totalBudget), num(r.totalActual), v,
        el("td", { class: "n", text: r.usedPct === null ? "—" : r.usedPct + "%" })]);
    });
    put("bdCmp", rows.length ? table([["الحساب"], ["النوع"], ["المخطط", 1], ["الفعلي", 1], ["الفرق", 1], ["نسبة التحقق", 1]], rows)
      : el("p", { class: "muted", text: "لا توجد موازنة ولا حركة لهذه السنة بعد." }));
  }
  $("bdYear").addEventListener("change", function () {
    var ys = $("bdYear");
    if (S.bdDirty) { toast("احفظ الموازنة أولاً أو حدّث الصفحة لتجاهل التغييرات.", true); ys.value = ys.dataset.prev; return; }
    ys.dataset.prev = ys.value; renderBudget();
  });
  $("bdSave").addEventListener("click", async function () {
    var Y = Number($("bdYear").value), rows = [], bad = false;
    document.querySelectorAll("#bdGrid input[data-acc]").forEach(function (i) {
      var v = i.value.trim(); if (v && !decimalsOk(v)) bad = true;
      rows.push({ year: Y, month: Number(i.dataset.m), account_code: i.dataset.acc, amount: ((C.cents(v) || 0) / 100).toFixed(2) });
    });
    if (bad) { toast("صحّح الخانات المعلَّمة بالأحمر (أرقام موجبة بخانتين عشريتين).", true); return; }
    var b = $("bdSave"); b.disabled = true;
    var r = await sb.from("acc_budget").upsert(rows, { onConflict: "year,month,account_code" });
    if (r.error) { b.disabled = false; toast(explain(r.error), true); return; }
    toast("تم حفظ موازنة " + Y); S.bdDirty = false; await loadMeta(); renderBudget();
  });

  /* ---------- data cleaning ---------- */
  async function runChecks() {
    var b = $("clRun"); b.disabled = true; b.textContent = "جارٍ الفحص…";
    try {
      var sales = await pageAll(function () { return sb.from("sales").select("*").order("sold_at"); });
      S.sales = sales;
      var si = C.checkSales(sales, S.fx, today()).concat(C.checkSalesOutliers(sales)),
        ei = C.checkEntries(S.lines, S.accounts, today()).concat(C.checkOutliers(S.lines, S.accounts));
      var names = []; S.lines.forEach(function (l) { if (!AUTO[l.kind] && l.line_no === 1 && l.partner) names.push(l.partner); });
      var sp = C.similarPartners(names);
      var cnt = { bad: 0, warn: 0, info: 0 }; si.concat(ei).forEach(function (i) { cnt[i.severity]++; });
      put("clSummary", el("p", {}, [
        el("span", { class: "sev bad", text: cnt.bad + " خطأ" }), el("span", { class: "sev warn", text: cnt.warn + " تنبيه" }), el("span", { class: "sev info", text: cnt.info + " ملاحظة" }),
        el("span", { class: "muted", text: " · فُحص " + sales.length + " بيع و" + C.journal(S.lines).length + " قيد" })]));
      renderSalesIssues(si); renderEntryIssues(ei); renderPartners(sp);
    } catch (e) { toast("تعذّر الفحص: " + explain(e), true); }
    b.disabled = false; b.textContent = "🔍 افحص الآن";
  }
  function issueRow(i, desc, actions) {
    return el("div", { class: "issue" }, [el("div", {}, [el("span", { class: "sev " + i.severity, text: { bad: "خطأ", warn: "تنبيه", info: "ملاحظة" }[i.severity] }),
      el("b", { text: i.msg }), el("div", { class: "muted", text: desc })]), el("div", { class: "row" }, actions || [])]);
  }
  function renderSalesIssues(list) {
    var box = $("clSales"); box.textContent = ""; box.className = "";
    if (!list.length) { box.appendChild(el("p", { class: "ok", text: "✓ لا توجد مشاكل في المبيعات." })); return; }
    list.sort(function (a, b) { return ["bad", "warn", "info"].indexOf(a.severity) - ["bad", "warn", "info"].indexOf(b.severity); });
    list.forEach(function (i) {
      var s = i.row, acts = [];
      if (i.fix === "delete" || i.code === "dup") {
        var d = el("button", { class: "sm bad", text: i.code === "dup" ? "حذف هذا المكرر" : "حذف البيع التجريبي" });
        d.addEventListener("click", function () { arm(d, "تأكيد الحذف؟", function () { fixSale("delete", s); }); });
        acts.push(d);
      }
      if (i.fix === "trim") acts.push(el("button", { class: "sm", text: "إزالة المسافات", onclick: function () { fixSale("trim", s); } }));
      if (i.code === "rate") acts.push(el("button", { class: "sm", text: "أضف سعر الصرف", onclick: function () { tab("se"); $("fx_cur").value = String(s.currency).toUpperCase(); $("fx_month").value = String(s.sold_at).slice(0, 7); $("fx_rate").focus(); } }));
      if (i.code === "slug") acts.push(el("a", { class: "btn sm", href: "dashboard.html", text: "اربطه من لوحة التحكم" }));
      box.appendChild(issueRow(i, s.id + " · " + dt(String(s.sold_at).slice(0, 10)) + " · " + (s.product || "—") + " · " + dt(s.amount + " " + s.currency), acts));
    });
  }
  async function fixSale(what, s) {
    var r = what === "delete" ? await sb.from("sales").delete().eq("id", s.id) : await sb.from("sales").update({ product: C.cleanText(s.product) }).eq("id", s.id);
    if (r.error) { toast(explain(r.error), true); return; }
    toast(what === "delete" ? "حُذف البيع " + s.id : "تم التصحيح");
    await sync(true); await loadLines(); await runChecks();
  }
  function renderEntryIssues(list) {
    var box = $("clEntries"); box.textContent = ""; box.className = "";
    if (!list.length) { box.appendChild(el("p", { class: "ok", text: "✓ لا توجد مشاكل في القيود." })); return; }
    list.forEach(function (i) {
      var e = i.entry, acts = [];
      if (!AUTO[e.kind]) acts.push(el("button", { class: "sm", text: "فتح القيد", onclick: function () { openEntry(e); } }));
      if (i.code === "spaces" && !AUTO[e.kind]) acts.push(el("button", { class: "sm", text: "إزالة المسافات", onclick: function () { renamePartner([e], C.cleanText(e.partner)); } }));
      box.appendChild(issueRow(i, "#" + e.id + " · " + dt(e.date) + " · " + (C.KIND_AR[e.kind] || e.kind) + " · " + (e.memo || "—") + " · " + dt(f(e.dr) + " €"), acts));
    });
  }
  function renderPartners(groups) {
    var box = $("clPartners"); box.textContent = ""; box.className = "";
    if (!groups.length) { box.appendChild(el("p", { class: "ok", text: "✓ أسماء الأطراف موحّدة." })); return; }
    groups.forEach(function (g) {
      var inp = el("input", { value: g.best, style: "width:220px" });
      var go = el("button", { class: "sm pri", text: "توحيد الاسم", onclick: function () {
        var target = C.cleanText(inp.value); if (!target) return;
        var es = C.journal(S.lines).filter(function (e) { return !AUTO[e.kind] && g.names.indexOf(e.partner) >= 0 && e.partner !== target; });
        renamePartner(es, target);
      } });
      box.appendChild(el("div", { class: "issue" }, [el("div", {}, [el("b", { text: "قد تكون نفس الجهة: " }), el("span", { text: g.names.map(function (n) { return "«" + n + "»"; }).join("، ") })]), el("div", { class: "row" }, [inp, go])]));
    });
  }
  async function renamePartner(entries, name) {
    var ok = 0, fail = [];
    for (var k = 0; k < entries.length; k++) {
      var e = entries[k];
      var r = await sb.rpc("acc_save_entry", { p: { id: e.id, date: e.date, kind: e.kind, ref: e.ref, partner: name, memo: e.memo, currency: e.currency, fx_rate: e.fx_rate, orig_amount: e.orig_amount,
        lines: e.lines.map(function (l) { return { account: l.account, debit: (l.dr / 100).toFixed(2), credit: (l.cr / 100).toFixed(2), memo: l.memo }; }) } });
      if (r.error) fail.push("#" + e.id + ": " + explain(r.error)); else ok++;
    }
    toast("وُحّد " + ok + " قيد" + (fail.length ? "\nلم يُعدَّل: " + fail.join("\n") : ""), !!fail.length);
    await loadLines(); fillSelects(); await runChecks();
  }
  $("clRun").addEventListener("click", runChecks);
  $("dsCsv").addEventListener("click", function () {
    var rows = C.dataset(S.lines.filter(function (l) { return inPeriod(l.entry_date); }), S.accounts);
    if (!rows.length) { toast("لا توجد حركات في هذه الفترة.", true); return; }
    download("accounting-data_" + S.from + "_" + S.to + ".csv", C.toCSV(rows));
  });
  $("dsSales").addEventListener("click", async function () {
    try {
      var sales = S.sales || await pageAll(function () { return sb.from("sales").select("*").order("sold_at"); });
      var rows = sales.filter(function (s) { var d = String(s.sold_at).slice(0, 10); return inPeriod(d); }).map(function (s) {
        return { id: s.id, date: String(s.sold_at).slice(0, 10), month: String(s.sold_at).slice(0, 7), platform: platName(s.platform), product: C.cleanText(s.product),
          product_slug: s.product_slug, currency: String(s.currency).toUpperCase(), amount: Number(s.amount), fees: Number(s.fees), net: (C.cents(s.amount) - C.cents(s.fees)) / 100,
          refunded: Number(s.refunded), source: s.source };
      });
      if (!rows.length) { toast("لا توجد مبيعات في هذه الفترة.", true); return; }
      download("sales_" + S.from + "_" + S.to + ".csv", C.toCSV(rows));
    } catch (e) { toast(explain(e), true); }
  });

  /* ---------- chart of accounts ---------- */
  function renderAccounts() {
    var b = C.balances(S.lines, null, S.to), used = {};
    S.lines.forEach(function (l) { used[l.account_code] = 1; });
    var rows = S.accounts.map(function (a) {
      var bal = b[a.code] ? b[a.code].close * C.sideOf(a) : 0, acts = el("td", { class: "noprint", style: "white-space:nowrap" });
      acts.appendChild(el("button", { class: "sm", text: "تعديل", onclick: function () { openAcc(a); } }));
      if (!a.system) {
        acts.appendChild(document.createTextNode(" "));
        acts.appendChild(el("button", { class: "sm", text: a.active ? "إيقاف" : "تفعيل", onclick: function () { accUpdate(a.code, { active: !a.active }); } }));
        if (!used[a.code]) {
          var d = el("button", { class: "sm bad", text: "حذف" });
          d.addEventListener("click", function () { arm(d, "تأكيد؟", async function () {
            var r = await sb.from("acc_accounts").delete().eq("code", a.code);
            if (r.error) { toast(explain(r.error), true); return; } toast("حُذف الحساب " + a.code); await reloadAll(); }); });
          acts.appendChild(document.createTextNode(" ")); acts.appendChild(d);
        }
      }
      return el("tr", { style: a.active ? "" : "opacity:.55" }, [el("td", { class: "n", text: a.code + (a.system ? " 🔒" : "") }), el("td", { text: a.name_ar }), el("td", { dir: "ltr", text: a.name_en || "" }),
        el("td", { text: TYPE_ONE[a.type] }), el("td", { text: a.is_cash ? "نقدي" : "" }), el("td", { text: CF_AR[a.cf_group] }), num(bal), acts]);
    });
    put("accTable", table([["الرقم", 1], ["الاسم"], ["English"], ["النوع"], [""], ["التدفق النقدي"], ["الرصيد في " + dt(S.to), 1], [""]], rows));
  }
  async function accUpdate(code, patch) {
    var r = await sb.from("acc_accounts").update(patch).eq("code", code);
    if (r.error) { toast(explain(r.error), true); return false; }
    await reloadAll(); return true;
  }
  function openAcc(a) {
    S.accEdit = a ? a.code : null;
    $("aTitle").textContent = a ? "تعديل الحساب " + a.code : "حساب جديد";
    $("a_code").value = a ? a.code : ""; $("a_code").readOnly = !!a;
    $("a_type").value = a ? a.type : "expense"; $("a_type").disabled = !!(a && a.system);
    $("a_ar").value = a ? a.name_ar : ""; $("a_en").value = a ? a.name_en || "" : "";
    $("a_cf").value = a ? a.cf_group : "op"; $("a_cash").checked = !!(a && a.is_cash);
    $("dAcc").showModal();
  }
  $("fAcc").addEventListener("submit", async function (ev) {
    ev.preventDefault();
    var row = { name_ar: C.cleanText($("a_ar").value), name_en: C.cleanText($("a_en").value), type: $("a_type").value, cf_group: $("a_cf").value, is_cash: $("a_cash").checked };
    if (!row.name_ar) { toast("اكتب اسم الحساب.", true); return; }
    var r;
    if (S.accEdit) r = await sb.from("acc_accounts").update(row).eq("code", S.accEdit);
    else { row.code = $("a_code").value.trim(); if (!/^[0-9]{3,6}$/.test(row.code)) { toast("رقم الحساب من 3 إلى 6 أرقام.", true); return; } r = await sb.from("acc_accounts").insert(row); }
    if (r.error) { toast(explain(r.error), true); return; }
    $("dAcc").close(); toast("تم الحفظ"); await reloadAll();
  });

  /* ---------- settings ---------- */
  function renderSettings() {
    var s = S.settings, fy = $("s_fy");
    if (!fy.children.length) MONTHS.forEach(function (m, i) { fy.appendChild(el("option", { value: i + 1, text: m })); });
    $("s_name").value = s.company_name || ""; fy.value = s.fiscal_start_month || 1; $("s_vat").checked = !!s.vat_enabled;
    $("s_rate").value = s.vat_rate; $("s_lock").value = s.lock_date || ""; $("s_lock").max = today();
    var rows = S.fx.map(function (r) {
      var d = el("button", { class: "sm bad", text: "حذف" });
      d.addEventListener("click", function () { arm(d, "تأكيد؟", async function () {
        var x = await sb.from("acc_fx_rates").delete().eq("currency", r.currency).eq("month", r.month);
        if (x.error) { toast(explain(x.error), true); return; } toast("حُذف السعر"); await sync(true); await reloadAll(); }); });
      return el("tr", {}, [el("td", { dir: "ltr", text: r.currency }), el("td", { text: String(r.month).slice(0, 7) }), el("td", { class: "n", text: "1 " + r.currency + " = " + Number(r.rate_to_eur) + " EUR" }), el("td", {}, [d])]);
    });
    put("fxTable", rows.length ? table([["العملة"], ["من شهر"], ["السعر", 1], [""]], rows) : el("p", { class: "muted", text: "لا توجد أسعار صرف بعد. مبيعات اليورو لا تحتاج سعراً." }));
  }
  $("setForm").addEventListener("submit", async function (ev) {
    ev.preventDefault();
    var rate = Number($("s_rate").value);
    if (!(rate >= 0 && rate < 100)) { toast("نسبة الضريبة غير صحيحة.", true); return; }
    var lock = $("s_lock").value || null;
    if (lock && lock > today()) { toast("تاريخ الإقفال لا يمكن أن يكون في المستقبل.", true); return; }
    var vatChanged = !!S.settings.vat_enabled !== $("s_vat").checked || Number(S.settings.vat_rate) !== rate;
    var r = await sb.from("acc_settings").update({ company_name: C.cleanText($("s_name").value), fiscal_start_month: Number($("s_fy").value),
      vat_enabled: $("s_vat").checked, vat_rate: rate, lock_date: lock }).eq("id", 1);
    if (r.error) { toast(explain(r.error), true); return; }
    toast("تم حفظ الإعدادات" + (vatChanged ? "، وأُعيد تسجيل المبيعات بحسب الضريبة الجديدة (خارج الفترات المقفلة)." : ""));
    await loadMeta(); if (vatChanged) await sync(true); await reloadAll();
  });
  $("fxForm").addEventListener("submit", async function (ev) {
    ev.preventDefault();
    var cur = C.cleanText($("fx_cur").value).toUpperCase(), m = $("fx_month").value, rate = Number($("fx_rate").value);
    if (!/^[A-Z]{3}$/.test(cur) || cur === "EUR") { toast("رمز العملة 3 أحرف، وليس EUR.", true); return; }
    if (!/^\d{4}-\d{2}$/.test(m) || !(rate > 0)) { toast("اختر الشهر واكتب سعراً موجباً.", true); return; }
    var r = await sb.from("acc_fx_rates").upsert({ currency: cur, month: m + "-01", rate_to_eur: rate }, { onConflict: "currency,month" });
    if (r.error) { toast(explain(r.error), true); return; }
    $("fx_rate").value = ""; toast("تم حفظ سعر " + cur); await loadMeta(); await sync(false); await reloadAll();
  });

  /* ---------- fixed assets & depreciation ---------- */
  function renderAssets() {
    var ys = $("faYear"), sm = Number(S.settings.fiscal_start_month) || 1, cur = Number(C.fyStart(today(), sm).slice(0, 4));
    if (!ys.children.length) {
      var first = S.lines.reduce(function (a, l) { return Math.min(a, Number(C.fyStart(l.entry_date, sm).slice(0, 4))); }, cur);
      for (var y = Math.max(first, cur - 8); y <= cur; y++) ys.appendChild(el("option", { value: y, text: sm === 1 ? String(y) : y + "/" + (y + 1) }));
      ys.value = cur;
    }
    var Y = Number(ys.value), rate = Number($("faRate").value);
    if (!(rate >= 0 && rate <= 25)) { $("faRate").value = 25; rate = 25; }
    var d = C.depreciationCalc(S.lines, S.accounts, Y, sm, rate), full = $("faFull") && $("faFull").checked && d.canWriteOff;
    var amount = full ? d.base : d.suggested;
    put("faCalc", table([["البند"], ["المبلغ €", 1]], [
      el("tr", {}, [el("td", { text: "القيمة المتبقية في بداية السنة (" + dt(d.from) + ")" }), num(d.opening)]),
      el("tr", {}, [el("td", { text: "+ مشتريات أصول خلال السنة" }), num(d.additions)]),
      el("tr", {}, [el("td", { text: "− أصول بيعت أو استُبعدت" }), num(-d.disposals)]),
      el("tr", { class: "sub" }, [el("td", { text: "القيمة الخاضعة للإهلاك" }), num(d.base)]),
      el("tr", {}, [el("td", { text: full ? "الإهلاك (كامل القيمة، لأنها 1,200 € أو أقل)" : "الإهلاك (" + d.rate + "%)" }), num(amount)]),
      el("tr", { class: "tot" }, [el("td", { text: "القيمة المتبقية في نهاية السنة (" + dt(d.to) + ")" }), num(d.base - amount)])]));
    var act = $("faAct"); act.textContent = "";
    if (d.canWriteOff) {
      var cb = el("input", { type: "checkbox", id: "faFull" }); cb.checked = !!full;
      cb.addEventListener("change", renderAssets);
      act.appendChild(el("label", { class: "chk", for: "faFull" }, [cb, "القيمة المتبقية 1,200 € أو أقل: أهلكها كاملة هذه السنة"]));
    }
    if (d.existing) {
      act.appendChild(el("p", { class: "ok", text: "✓ إهلاك هذه السنة مسجّل: " + f(d.existing.amount) + " € (القيد #" + d.existing.id + ")" }));
      var ex = C.journal(S.lines).filter(function (e) { return e.id === d.existing.id; })[0];
      if (ex) act.appendChild(el("button", { text: "فتح القيد لتعديله", onclick: function () { openEntry(ex); } }));
    } else if (d.base <= 0) {
      act.appendChild(el("p", { class: "muted", text: "لا توجد أصول تحتاج إهلاكاً في هذه السنة." }));
    } else if (amount > 0) {
      if (d.to > today()) act.appendChild(el("p", { class: "warnc", text: "⚠ السنة لم تنتهِ بعد. سجّل الإهلاك في نهايتها، لأن أي أصل تشتريه قبل ذلك يغيّر المبلغ." }));
      act.appendChild(el("button", { class: "pri", text: "إنشاء قيد الإهلاك (" + f(amount) + " €)", onclick: function () {
        openEntry(null, { date: d.to, kind: "adjust", ref: d.ref, memo: "إهلاك الأجهزة والمعدات لسنة " + Y + (full ? " (كامل القيمة)" : " (" + d.rate + "%)"),
          lines: C.depreciationLines(amount).map(function (l) { return { account: l.account, debit: Number(l.debit), credit: Number(l.credit) }; }) });
      } }));
    }
    var reg = C.assetRegister(S.lines, S.accounts, d.to);
    put("faReg", reg.length ? table([["التاريخ"], ["القيد", 1], ["البيان"], ["المورد"], ["الحساب"], ["المبلغ €", 1]], reg.map(function (r) {
      return el("tr", {}, [el("td", { text: r.date }), el("td", { class: "n", text: "#" + r.entry }), el("td", { text: (r.kind === "out" ? "بيع / استبعاد: " : "") + (r.memo || "—") }),
        el("td", { text: r.partner || "" }), el("td", { text: accName(r.account) }), num(r.amount)]);
    })) : el("p", { class: "muted", text: "لم تُسجَّل أصول بعد." }));
    var start = d.existing ? d.base - d.existing.amount : d.base - amount;
    var plan = C.depreciationPlan(start, d.rate, Y + 1, 6);
    put("faPlan", plan.length ? table([["السنة"], ["الإهلاك €", 1], ["المتبقي €", 1], [""]], plan.map(function (p) {
      return el("tr", {}, [el("td", { text: sm === 1 ? String(p.year) : p.year + "/" + (p.year + 1) }), num(p.depreciation), num(p.remaining), el("td", { class: "muted", text: p.writeOff ? "إهلاك كامل (≤ 1,200 €)" : "" })]);
    })) : el("p", { class: "muted", text: "لا يبقى شيء للإهلاك." }));
  }
  $("faYear").addEventListener("change", renderAssets);
  $("faRate").addEventListener("change", renderAssets);

  /* ---------- CSV import ---------- */
  var IM = { rows: null, header: null, items: [] };
  var MAP_FIELDS = [["date", "التاريخ *"], ["amount", "المبلغ (موجب = داخل، سالب = خارج)"], ["debit", "أو: عمود الخارج (مدين في البنك)"], ["credit", "أو: عمود الداخل"],
    ["partner", "الطرف (المستفيد / الدافع)"], ["desc", "البيان / الرسالة"], ["ref", "رقم المرجع"], ["currency", "العملة"]];
  function decodeFile(buf) {
    try { return new TextDecoder("utf-8", { fatal: true }).decode(buf); }
    catch (e) { return new TextDecoder("windows-1252").decode(buf); }   // many Finnish bank exports are Latin-1
  }
  $("imFile").addEventListener("change", function () {
    var f = this.files && this.files[0]; if (!f) return;
    if (f.size > 5 * 1048576) { toast("الملف أكبر من 5 ميغابايت.", true); this.value = ""; return; }
    var r = new FileReader();
    r.onload = function () { IM.text = decodeFile(r.result); imParse(true); };
    r.onerror = function () { toast("تعذّرت قراءة الملف.", true); };
    r.readAsArrayBuffer(f);
  });
  function imParse(guess) {
    if (!IM.text) return;
    var d = $("imDelim").value === "tab" ? "\t" : $("imDelim").value;
    var p = C.parseCSV(IM.text, d || null);
    if (!p.rows.length) { toast("الملف فارغ.", true); return; }
    if (!$("imDelim").value) $("imDelim").dataset.auto = p.delimiter;
    IM.header = $("imHeader").checked ? p.rows[0] : p.rows[0].map(function (_, i) { return "عمود " + (i + 1); });
    IM.rows = $("imHeader").checked ? p.rows.slice(1) : p.rows;
    var g = guess ? C.guessColumns(IM.header) : null, grid = $("imMapGrid");
    if (guess || !grid.children.length) {
      grid.textContent = "";
      MAP_FIELDS.forEach(function (fd) {
        var sel = el("select", { id: "im_" + fd[0] });
        sel.appendChild(el("option", { value: "", text: "—" }));
        IM.header.forEach(function (h, i) { sel.appendChild(el("option", { value: String(i), text: (i + 1) + ": " + (C.cleanText(h) || "(بلا عنوان)") + (IM.rows[0] && IM.rows[0][i] ? "  ← " + C.cleanText(IM.rows[0][i]).slice(0, 24) : "") })); });
        if (g && g[fd[0]] !== undefined) sel.value = String(g[fd[0]]);
        sel.addEventListener("change", imPreview);
        grid.appendChild(el("div", {}, [el("label", { for: "im_" + fd[0], text: fd[1] }), sel]));
      });
    }
    $("imMap").hidden = false; imPreview();
  }
  function imMapNow() { var m = {}; MAP_FIELDS.forEach(function (fd) { var v = $("im_" + fd[0]).value; if (v !== "") m[fd[0]] = v; }); return m; }
  function imPreview() {
    var note = $("imNote"), box = $("imPrev"); note.textContent = ""; box.textContent = ""; $("imGo").disabled = true; $("imInfo").textContent = "";
    if (!IM.rows) return;
    var m = imMapNow(), cash = $("imCash").value;
    if (m.date === undefined || (m.amount === undefined && (m.debit === undefined || m.credit === undefined))) {
      note.appendChild(el("p", { class: "warnc", text: "اختر عمود التاريخ، وعمود المبلغ (أو عمودي الداخل والخارج معاً)." })); return; }
    IM.items = C.buildImport(IM.rows, m, S.lines, { dateFmt: $("imDate").value, cashAccount: cash, accounts: S.accounts, today: today() });
    var cnt = {}; IM.items.forEach(function (it) { cnt[it.status] = (cnt[it.status] || 0) + 1; });
    var amb = IM.items.some(function (it) { return it.ambiguous; });
    note.appendChild(el("p", {}, [el("span", { class: "sev info", text: (cnt.ok || 0) + " جاهز" }), el("span", { class: "sev warn", text: ((cnt.maybe_dup || 0) + (cnt.dup_file || 0)) + " مكرر محتمل" }),
      el("span", { class: "sev warn", text: (cnt.dup_existing || 0) + " مستورد سابقاً" }), el("span", { class: "sev bad", text: (cnt.invalid || 0) + " غير صالح" }),
      el("span", { class: "muted", text: " · الفاصل: " + ({ ",": "فاصلة", ";": "فاصلة منقوطة", "\t": "Tab", "|": "|" }[$("imDelim").value === "tab" ? "\t" : ($("imDelim").value || $("imDelim").dataset.auto)] || "?") })]));
    if (amb) note.appendChild(el("p", { class: "warnc", text: "⚠ بعض التواريخ تحتمل قراءتين (مثل 03.04). قرأتها يوم.شهر.سنة؛ إن كان الملف أمريكياً اختر «شهر/يوم/سنة» من صيغة التاريخ." }));
    var STATUS = { ok: ["جاهز", "info"], maybe_dup: ["مكرر محتمل", "warn"], dup_file: ["مكرر في الملف", "warn"], dup_existing: ["مستورد سابقاً", "warn"], invalid: ["غير صالح", "bad"] };
    var rows = IM.items.map(function (it) {
      var cb = el("input", { type: "checkbox", "aria-label": "استيراد السطر " + it.i }); cb.checked = it.select; cb.disabled = it.status === "invalid" || it.status === "dup_existing";
      cb.addEventListener("change", function () { it.select = cb.checked; imCount(); });
      var acc = null;
      if (it.status !== "invalid") {
        if (it.account === cash) it.account = it.amount > 0 ? "4900" : "6900";   // the counter account can never be the statement account
        acc = el("select", { "aria-label": "الحساب المقابل" });
        accOptions(acc, function (a) { return a.code !== cash; }, it.account);
        acc.value = it.account; acc.addEventListener("change", function () { it.account = acc.value; });
      }
      var st = STATUS[it.status];
      return el("tr", { class: "st-" + it.status }, [el("td", {}, [cb]), el("td", { class: "n", text: it.i }), el("td", { text: it.date || "—" }),
        el("td", { text: [it.partner, it.desc].filter(Boolean).join(" · ") }), isNaN(it.amount) ? el("td", { class: "n", text: "؟" }) : num(it.amount),
        el("td", {}, [el("span", { class: "sev " + st[1], text: st[0] }), it.reason ? el("div", { class: "muted", text: it.reason }) : null]), el("td", {}, [acc])]);
    });
    var t = table([[""], ["#", 1], ["التاريخ"], ["الطرف / البيان"], ["المبلغ €", 1], ["الحالة"], ["الحساب المقابل"]], rows); t.className = "imp";
    box.appendChild(t); imCount();
  }
  function imCount() {
    var sel = IM.items.filter(function (it) { return it.select && (it.status === "ok" || it.status === "maybe_dup" || it.status === "dup_file"); });
    var inC = 0, outC = 0; sel.forEach(function (it) { if (it.amount > 0) inC += it.amount; else outC -= it.amount; });
    $("imGo").disabled = !sel.length || !$("imCash").value;
    $("imInfo").textContent = sel.length ? "سيُستورد " + sel.length + " حركة: داخل " + f(inC) + " € · خارج " + f(outC) + " €" : "";
  }
  ["imDelim", "imHeader"].forEach(function (id) { $(id).addEventListener("change", function () { imParse(true); }); });
  ["imDate", "imCash"].forEach(function (id) { $(id).addEventListener("change", imPreview); });
  $("imGo").addEventListener("click", async function () {
    var cash = $("imCash").value, todo = IM.items.filter(function (it) { return it.select && it.status !== "invalid" && it.status !== "dup_existing"; });
    if (!todo.length) return;
    if (todo.some(function (it) { return !it.account || it.account === cash; })) { toast("اختر حساباً مقابلاً مختلفاً عن حساب الكشف لكل سطر.", true); return; }
    var b = $("imGo"); b.disabled = true; var ok = 0, fail = [];
    for (var k = 0; k < todo.length; k++) {
      $("imInfo").textContent = "جارٍ الاستيراد " + (k + 1) + " / " + todo.length;
      var r = await sb.rpc("acc_save_entry", { p: C.importEntry(todo[k], cash, todo[k].account) });
      if (r.error) fail.push("السطر " + todo[k].i + ": " + explain(r.error)); else ok++;
    }
    await loadLines(); fillSelects(); imPreview();
    toast("استُورد " + ok + " قيد" + (fail.length ? "\nلم يُستورد:\n" + fail.slice(0, 8).join("\n") + (fail.length > 8 ? "\n…" : "") : ""), !!fail.length);
  });

  /* ---------- change log ---------- */
  var TBL_AR = { acc_entries: "قيود اليومية", sales: "المبيعات", acc_accounts: "دليل الحسابات", acc_budget: "الموازنة", acc_fx_rates: "أسعار الصرف", acc_settings: "الإعدادات" };
  var ACT_AR = { insert: "إضافة", update: "تعديل", delete: "حذف", sync: "تسجيل تلقائي" };
  async function loadAudit() {
    var t = $("auTbl").value, q = sb.from("acc_audit").select("*").order("at", { ascending: false }).order("id", { ascending: false });
    if (t) q = q.eq("tbl", t);
    var r = await q.range(0, S.auLimit);
    if (r.error) { put("auTable", el("p", { class: "badc", text: explain(r.error) })); return; }
    var data = r.data || [], more = data.length > S.auLimit; if (more) data = data.slice(0, S.auLimit);
    S.auData = data;
    put("auTable", data.length ? table([["الوقت"], ["بواسطة"], ["السجل"], ["العملية"], ["المعرّف"], ["التفاصيل"]], data.map(function (a) {
      var when = new Date(a.at), sum = C.auditSummary(a);
      return el("tr", {}, [el("td", { style: "white-space:nowrap", text: iso(when) + " " + pad(when.getHours()) + ":" + pad(when.getMinutes()) }),
        el("td", { dir: "ltr", text: a.actor === "system" ? "النظام" : a.actor }), el("td", { text: TBL_AR[a.tbl] || a.tbl }),
        el("td", {}, [el("span", { class: "tag" + (a.action === "delete" ? " auto" : ""), text: ACT_AR[a.action] || a.action })]),
        el("td", { class: "n", text: a.tbl === "acc_entries" ? "#" + a.row_key : a.row_key }), el("td", { style: "font-size:13px", text: sum })]);
    })) : el("p", { class: "muted", text: "لا توجد تغييرات مسجلة بعد." }));
    $("auMore").hidden = !more;
  }
  $("auTbl").addEventListener("change", function () { S.auLimit = 200; loadAudit(); });
  $("auMore").addEventListener("click", function () { S.auLimit += 300; loadAudit(); });
  $("auCsv").addEventListener("click", function () {
    if (!S.auData || !S.auData.length) { toast("لا توجد بيانات.", true); return; }
    download("change-log_" + today() + ".csv", C.toCSV(S.auData.map(function (a) {
      return { at: a.at, actor: a.actor, table: TBL_AR[a.tbl] || a.tbl, action: ACT_AR[a.action] || a.action, key: a.row_key, summary: C.auditSummary(a),
        old: a.old_data ? JSON.stringify(a.old_data) : "", new: a.new_data ? JSON.stringify(a.new_data) : "" };
    })));
  });

  /* ---------- wiring ---------- */
  document.querySelectorAll(".tabs[role=tablist] button").forEach(function (b) { b.addEventListener("click", function () { tab(b.dataset.t); }); });
  document.querySelectorAll("#stTabs button").forEach(function (b) { b.addEventListener("click", function () { S.st = b.dataset.s; renderStatements(); }); });
  document.querySelectorAll("dialog .close").forEach(function (b) { b.addEventListener("click", function () { b.closest("dialog").close(); }); });
  document.querySelectorAll("button.pr").forEach(function (b) { b.addEventListener("click", function () {
    var p = b.closest(".pane"); p.classList.add("printing"); window.print(); setTimeout(function () { p.classList.remove("printing"); }, 500); }); });
  $("preset").addEventListener("change", function () { setPreset($("preset").value); S.jLimit = 100; render(); });
  ["from", "to"].forEach(function (id) { $(id).addEventListener("change", function () { $("preset").value = "custom"; if (readPeriod()) { S.jLimit = 100; render(); } }); });
  $("syncBtn").addEventListener("click", async function () { if (await sync(false)) { await loadLines(); fillSelects(); render(); } });
  $("newEntry").addEventListener("click", function () { openEntry(null); });
  $("newExp").addEventListener("click", openExp);
  $("newTr").addEventListener("click", openTr);
  $("jKind").addEventListener("change", function () { S.jLimit = 100; renderJournal(); });
  var jt = null; $("jSearch").addEventListener("input", function () { clearTimeout(jt); jt = setTimeout(function () { S.jLimit = 100; renderJournal(); }, 200); });
  $("jMore").addEventListener("click", function () { S.jLimit += 200; renderJournal(); });
  $("lgAcc").addEventListener("change", renderLedger);
  $("lgCsv").addEventListener("click", function () { if (S.lgCsv) S.lgCsv(); });
  $("tbCsv").addEventListener("click", function () { if (S.tbCsv) S.tbCsv(); });
  $("accNew").addEventListener("click", function () { openAcc(null); });
  Object.keys(C.KIND_AR).forEach(function (k) { $("jKind").appendChild(el("option", { value: k, text: C.KIND_AR[k] })); });
  window.addEventListener("beforeunload", function (e) { if (S.bdDirty) { e.preventDefault(); e.returnValue = ""; } });
  if (window.matchMedia) window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", function () { render(); });

  async function boot() {
    var s = await sb.auth.getSession();
    if (!s.data || !s.data.session) { $("gate").hidden = false; $("syncBtn").hidden = true; return; }
    var a = await sb.from("admins").select("email").limit(1);
    if (a.error || !a.data || !a.data.length) { $("gate").hidden = false; $("syncBtn").hidden = true; toast("هذا الحساب ليس مديراً لهذا الموقع.", true); return; }
    $("who").textContent = s.data.session.user.email;
    try { await loadMeta(); }
    catch (e) { $("setup").hidden = false; $("setupErr").textContent = explain(e) === e.message ? e.message : ""; $("syncBtn").hidden = true; return; }
    $("app").hidden = false;
    await sync(true);
    try { await loadLines(); } catch (e) { toast(explain(e), true); }
    setPreset("ytd"); fillSelects(); render();
  }
  boot();
})();
