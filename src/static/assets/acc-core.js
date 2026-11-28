/* SkillPostApp accounting – reports engine.
 * Pure functions, no DOM, no network: every number on the accounting page comes from here.
 * Money is handled in integer cents so totals never drift (0.1 + 0.2 problems).
 * A "line" is a row of the acc_ledger_v view:
 *   {entry_id, line_no, account_code, debit, credit, entry_date:'YYYY-MM-DD', kind, ref, partner, memo, line_memo, source_key}
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.AccCore = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var DEBIT_NORMAL = { asset: true, expense: true };
  var TYPE_AR = { asset: "الأصول", liability: "الالتزامات", equity: "حقوق الملكية", revenue: "الإيرادات", expense: "المصروفات" };
  var KIND_AR = { manual: "قيد يدوي", sale: "بيع", refund: "استرداد", purchase: "مشتريات", expense: "مصروف",
    transfer: "تحويل", opening: "رصيد افتتاحي", vat: "تسوية ضريبة", adjust: "تسوية" };

  /* ---------- money ---------- */
  function cents(x) {
    if (x === null || x === undefined || x === "") return 0;
    var n = typeof x === "number" ? x : Number(String(x).replace(/\s/g, "").replace(",", "."));
    if (!isFinite(n)) return NaN;
    return Math.round(n * 100);
  }
  function toNum(c) { return c / 100; }
  function fmt(c, opts) {
    opts = opts || {};
    if (c === null || c === undefined || isNaN(c)) return "—";
    var neg = c < 0, a = Math.abs(c), s = String(Math.floor(a / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ","),
      d = String(a % 100).padStart(2, "0"), out = s + "." + d;
    if (opts.blankZero && c === 0) return "";
    return neg ? (opts.paren ? "(" + out + ")" : "-" + out) : out;
  }
  function pct(num, den) { return den ? Math.round((num / den) * 1000) / 10 : null; }

  /* ---------- dates ---------- */
  function ym(d) { return String(d).slice(0, 7); }
  function inRange(d, from, to) { return (!from || d >= from) && (!to || d <= to); }
  function fyStart(asOf, startMonth) {
    var y = Number(asOf.slice(0, 4)), m = Number(asOf.slice(5, 7)), sm = startMonth || 1;
    if (m < sm) y -= 1;
    return y + "-" + String(sm).padStart(2, "0") + "-01";
  }
  function monthsBetween(from, to) {
    var out = [], y = Number(from.slice(0, 4)), m = Number(from.slice(5, 7)),
      ey = Number(to.slice(0, 4)), em = Number(to.slice(5, 7));
    while (y < ey || (y === ey && m <= em)) {
      out.push(y + "-" + String(m).padStart(2, "0"));
      m++; if (m > 12) { m = 1; y++; }
      if (out.length > 600) break;
    }
    return out;
  }
  function monthEnd(key) {
    var y = Number(key.slice(0, 4)), m = Number(key.slice(5, 7));
    var last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return key + "-" + String(last).padStart(2, "0");
  }

  /* ---------- accounts ---------- */
  function accMap(accounts) { var m = {}; (accounts || []).forEach(function (a) { m[a.code] = a; }); return m; }
  function sideOf(a) { return a && DEBIT_NORMAL[a.type] ? 1 : -1; }   // +1: debit-normal, -1: credit-normal
  function isPL(a) { return a && (a.type === "revenue" || a.type === "expense"); }
  function isCOGS(a) { return a && a.type === "expense" && /^5/.test(a.code); }
  function sortCode(a, b) { return a.code < b.code ? -1 : a.code > b.code ? 1 : 0; }

  /* normalised line: dr/cr in cents, net = dr - cr */
  function norm(l) {
    var dr = cents(l.debit), cr = cents(l.credit);
    return { e: l.entry_id, n: l.line_no || 0, a: l.account_code, d: l.entry_date, dr: dr, cr: cr, net: dr - cr, l: l };
  }
  function prep(lines) {
    return (lines || []).map(norm).sort(function (x, y) {
      return x.d < y.d ? -1 : x.d > y.d ? 1 : x.e - y.e || x.n - y.n;
    });
  }

  /* ---------- balances ---------- */
  // per account: open (net before from), dr/cr inside [from,to], close (net up to to). Signed debit-positive.
  function balances(lines, from, to) {
    var b = {};
    prep(lines).forEach(function (x) {
      if (to && x.d > to) return;
      var r = b[x.a] || (b[x.a] = { open: 0, dr: 0, cr: 0, close: 0 });
      if (from && x.d < from) r.open += x.net;
      else { r.dr += x.dr; r.cr += x.cr; }
      r.close += x.net;
    });
    return b;
  }

  function trialBalance(lines, accounts, from, to) {
    var b = balances(lines, from, to), am = accMap(accounts), rows = [],
      t = { openDr: 0, openCr: 0, dr: 0, cr: 0, closeDr: 0, closeCr: 0 };
    Object.keys(b).sort().forEach(function (code) {
      var r = b[code], a = am[code] || { code: code, name_ar: code, type: "asset" };
      if (!r.open && !r.dr && !r.cr && !r.close) return;
      var row = { code: code, name: a.name_ar, type: a.type,
        openDr: Math.max(r.open, 0), openCr: Math.max(-r.open, 0), dr: r.dr, cr: r.cr,
        closeDr: Math.max(r.close, 0), closeCr: Math.max(-r.close, 0) };
      Object.keys(t).forEach(function (k) { t[k] += row[k]; });
      rows.push(row);
    });
    return { rows: rows, totals: t, balanced: t.openDr === t.openCr && t.dr === t.cr && t.closeDr === t.closeCr };
  }

  /* ---------- income statement ---------- */
  function incomeStatement(lines, accounts, from, to) {
    var b = balances(lines, from, to), am = accMap(accounts),
      rev = [], cogs = [], opex = [], R = 0, C = 0, O = 0;
    Object.keys(b).sort().forEach(function (code) {
      var a = am[code]; if (!isPL(a)) return;
      var amt = (b[code].dr - b[code].cr) * sideOf(a);   // period movement on the normal side
      if (!amt) return;
      var row = { code: code, name: a.name_ar, amount: amt };
      if (a.type === "revenue") { rev.push(row); R += amt; }
      else if (isCOGS(a)) { cogs.push(row); C += amt; }
      else { opex.push(row); O += amt; }
    });
    var gross = R - C, net = gross - O;
    return { revenue: rev, cogs: cogs, opex: opex, totalRevenue: R, totalCogs: C, totalOpex: O,
      grossProfit: gross, netProfit: net, grossMargin: pct(gross, R), netMargin: pct(net, R) };
  }

  /* ---------- balance sheet ---------- */
  function balanceSheet(lines, accounts, asOf, fyStartMonth) {
    var am = accMap(accounts), fy = fyStart(asOf, fyStartMonth), b = balances(lines, null, asOf),
      assets = [], liab = [], eq = [], A = 0, L = 0, E = 0, prior = 0, current = 0;
    prep(lines).forEach(function (x) {                // profit split: before / inside the fiscal year
      if (x.d > asOf) return;
      var a = am[x.a]; if (!isPL(a)) return;
      if (x.d < fy) prior -= x.net; else current -= x.net;   // profit = credits - debits on P&L accounts
    });
    Object.keys(b).sort().forEach(function (code) {
      var a = am[code] || { code: code, name_ar: code, type: "asset" }; if (isPL(a)) return;
      var amt = b[code].close * sideOf(a); if (!amt) return;
      var row = { code: code, name: a.name_ar, amount: amt };
      if (a.type === "asset") { assets.push(row); A += amt; }
      else if (a.type === "liability") { liab.push(row); L += amt; }
      else { eq.push(row); E += amt; }
    });
    if (prior) eq.push({ code: "", name: "أرباح (خسائر) السنوات السابقة", amount: prior, computed: true });
    eq.push({ code: "", name: "ربح (خسارة) السنة الحالية", amount: current, computed: true });
    E += prior + current;
    return { asOf: asOf, fyStart: fy, assets: assets, liabilities: liab, equity: eq,
      totalAssets: A, totalLiabilities: L, totalEquity: E, balanced: A === L + E, difference: A - (L + E) };
  }

  /* ---------- general ledger for one account ---------- */
  function ledger(lines, accounts, code, from, to) {
    var a = accMap(accounts)[code] || { code: code, type: "asset" }, s = sideOf(a), open = 0, rows = [], dr = 0, cr = 0;
    prep(lines).forEach(function (x) {
      if (x.a !== code || (to && x.d > to)) return;
      if (from && x.d < from) { open += x.net; return; }
      dr += x.dr; cr += x.cr;
      rows.push({ date: x.d, entry: x.e, kind: x.l.kind, ref: x.l.ref || "", partner: x.l.partner || "",
        memo: x.l.line_memo || x.l.memo || "", dr: x.dr, cr: x.cr, balance: 0 });
    });
    var run = open * s;
    rows.forEach(function (r) { run += (r.dr - r.cr) * s; r.balance = run; });
    return { account: a, opening: open * s, rows: rows, totalDr: dr, totalCr: cr, closing: run, side: s };
  }

  /* ---------- journal: lines grouped into entries ---------- */
  function journal(lines) {
    var map = {}, list = [];
    prep(lines).forEach(function (x) {
      var e = map[x.e];
      if (!e) {
        e = map[x.e] = { id: x.e, date: x.d, kind: x.l.kind, ref: x.l.ref || "", partner: x.l.partner || "",
          memo: x.l.memo || "", source_key: x.l.source_key || null, currency: x.l.currency || "EUR",
          fx_rate: x.l.fx_rate, orig_amount: x.l.orig_amount, lines: [], dr: 0, cr: 0 };
        list.push(e);
      }
      e.lines.push({ account: x.a, dr: x.dr, cr: x.cr, memo: x.l.line_memo || "" });
      e.dr += x.dr; e.cr += x.cr;
    });
    return list;
  }

  /* ---------- time series for the charts ---------- */
  function monthly(lines, accounts, from, to) {
    var am = accMap(accounts), keys = monthsBetween(from, to), idx = {}, cashOpen = 0;
    var out = keys.map(function (k, i) { idx[k] = i; return { month: k, revenue: 0, expense: 0, profit: 0, cash: 0, cashMove: 0 }; });
    prep(lines).forEach(function (x) {
      var a = am[x.a]; if (!a || x.d > to) return;
      if (x.d < from) { if (a.is_cash) cashOpen += x.net; return; }
      var r = out[idx[ym(x.d)]]; if (!r) return;
      if (a.type === "revenue") r.revenue -= x.net;
      else if (a.type === "expense") r.expense += x.net;
      if (a.is_cash) r.cashMove += x.net;
    });
    var run = cashOpen;
    out.forEach(function (r) { r.profit = r.revenue - r.expense; run += r.cashMove; r.cash = run; delete r.cashMove; });
    return out;
  }

  function breakdown(lines, accounts, from, to, type) {
    var am = accMap(accounts), m = {};
    prep(lines).forEach(function (x) {
      var a = am[x.a]; if (!a || a.type !== type || !inRange(x.d, from, to)) return;
      m[x.a] = (m[x.a] || 0) + x.net * sideOf(a);
    });
    return Object.keys(m).filter(function (k) { return m[k]; })
      .map(function (k) { return { code: k, name: am[k].name_ar, amount: m[k] }; })
      .sort(function (p, q) { return q.amount - p.amount; });
  }

  // net sales per store, from the automatic sale/refund entries (revenue accounts only)
  function salesByPlatform(lines, accounts, from, to) {
    var am = accMap(accounts), m = {};
    prep(lines).forEach(function (x) {
      var a = am[x.a]; if (!a || a.type !== "revenue" || !inRange(x.d, from, to)) return;
      if (x.l.kind !== "sale" && x.l.kind !== "refund") return;
      var k = x.l.partner || "other"; m[k] = (m[k] || 0) - x.net;
    });
    return Object.keys(m).map(function (k) { return { platform: k, amount: m[k] }; })
      .sort(function (p, q) { return q.amount - p.amount; });
  }

  /* ---------- cash flow (direct method) ---------- */
  // Each entry's change in cash accounts is split over its other lines by weight,
  // and each other line counts as operating / investing / financing (account.cf_group).
  function cashFlow(lines, accounts, from, to) {
    var am = accMap(accounts), byEntry = {}, open = 0, res = { op: 0, inv: 0, fin: 0 }, detail = {};
    prep(lines).forEach(function (x) {
      if (x.d > to) return;
      var a = am[x.a] || {};
      if (x.d < from) { if (a.is_cash) open += x.net; return; }
      (byEntry[x.e] || (byEntry[x.e] = [])).push(x);
    });
    Object.keys(byEntry).forEach(function (id) {
      var ls = byEntry[id], cash = 0, others = [], w = 0;
      ls.forEach(function (x) { var a = am[x.a] || {}; if (a.is_cash) cash += x.net; else { others.push(x); w += Math.abs(x.net); } });
      if (!cash) return;
      if (!others.length || !w) { res.op += cash; return; }
      var left = cash;
      others.forEach(function (x, i) {
        var part = i === others.length - 1 ? left : Math.round(cash * Math.abs(x.net) / w);
        left -= part;
        var g = (am[x.a] && am[x.a].cf_group) || "op";
        res[g] += part;
        var k = g + ":" + x.a; detail[k] = (detail[k] || 0) + part;
      });
    });
    var net = res.op + res.inv + res.fin, rows = Object.keys(detail).map(function (k) {
      var p = k.split(":"); return { group: p[0], code: p[1], name: (am[p[1]] || {}).name_ar || p[1], amount: detail[k] };
    }).filter(function (r) { return r.amount; }).sort(function (a, b) { return a.group < b.group ? -1 : a.group > b.group ? 1 : Math.abs(b.amount) - Math.abs(a.amount); });
    var close = 0; prep(lines).forEach(function (x) { if (x.d <= to && (am[x.a] || {}).is_cash) close += x.net; });
    return { opening: open, operating: res.op, investing: res.inv, financing: res.fin, net: net, closing: close,
      rows: rows, balanced: open + net === close };
  }

  /* ---------- VAT (ALV) ---------- */
  function vatReport(lines, from, to, outCode, inCode) {
    outCode = outCode || "2100"; inCode = inCode || "1300";
    var out = 0, inp = 0;
    prep(lines).forEach(function (x) {
      if (!inRange(x.d, from, to) || x.l.kind === "vat") return;     // settlement entries are not new VAT
      if (x.a === outCode) out -= x.net;
      if (x.a === inCode) inp += x.net;
    });
    return { output: out, input: inp, payable: out - inp };
  }
  function vatSettlementLines(v, payableCode) {
    payableCode = payableCode || "2110";
    var ls = [];
    if (v.output > 0) ls.push({ account: "2100", debit: toNum(v.output), credit: 0 });
    if (v.output < 0) ls.push({ account: "2100", debit: 0, credit: toNum(-v.output) });
    if (v.input > 0) ls.push({ account: "1300", debit: 0, credit: toNum(v.input) });
    if (v.input < 0) ls.push({ account: "1300", debit: toNum(-v.input), credit: 0 });
    if (v.payable > 0) ls.push({ account: payableCode, debit: 0, credit: toNum(v.payable) });
    if (v.payable < 0) ls.push({ account: payableCode, debit: toNum(-v.payable), credit: 0 });
    return ls;
  }

  /* ---------- budget vs actual ---------- */
  function budgetVsActual(lines, accounts, budget, year) {
    var am = accMap(accounts), Y = String(year), rows = {}, get = function (code) {
      var a = am[code]; if (!isPL(a)) return null;
      return rows[code] || (rows[code] = { code: code, name: a.name_ar, type: a.type, actual: new Array(12).fill(0), budget: new Array(12).fill(0) });
    };
    (budget || []).forEach(function (b) { if (String(b.year) !== Y) return; var r = get(b.account_code); if (r) r.budget[b.month - 1] += cents(b.amount); });
    prep(lines).forEach(function (x) {
      if (x.d.slice(0, 4) !== Y) return; var r = get(x.a); if (!r) return;
      r.actual[Number(x.d.slice(5, 7)) - 1] += x.net * sideOf(am[x.a]);
    });
    var list = Object.keys(rows).sort().map(function (k) {
      var r = rows[k], ta = r.actual.reduce(sum, 0), tb = r.budget.reduce(sum, 0);
      r.totalActual = ta; r.totalBudget = tb; r.variance = ta - tb;
      // favourable: more revenue than planned, or less expense than planned
      r.favourable = r.type === "revenue" ? r.variance >= 0 : r.variance <= 0;
      r.usedPct = pct(ta, tb);
      return r;
    });
    var months = [];
    for (var i = 0; i < 12; i++) {
      var m = { month: i + 1, revA: 0, revB: 0, expA: 0, expB: 0 };
      list.forEach(function (r) { if (r.type === "revenue") { m.revA += r.actual[i]; m.revB += r.budget[i]; } else { m.expA += r.actual[i]; m.expB += r.budget[i]; } });
      m.profitA = m.revA - m.expA; m.profitB = m.revB - m.expB; months.push(m);
    }
    return { rows: list, months: months };
  }
  function sum(a, b) { return a + b; }

  /* ---------- data cleaning ---------- */
  function partnerKey(s) { return String(s || "").toLowerCase().replace(/[\s.,\-_'"()]+/g, "").replace(/(oy|ab|ltd|llc|inc|gmbh)$/, ""); }
  function cleanText(s) { return String(s || "").replace(/[​-‏‪-‮﻿]/g, "").replace(/\s+/g, " ").trim(); }

  // sales: rows of the sales table; rates: acc_fx_rates rows; today 'YYYY-MM-DD'
  function checkSales(sales, rates, today) {
    var issues = [], seen = {}, rateCur = {};
    (rates || []).forEach(function (r) { rateCur[r.currency] = true; });
    (sales || []).forEach(function (s) {
      var amt = cents(s.amount), fee = cents(s.fees), ref = cents(s.refunded), day = String(s.sold_at || "").slice(0, 10), cur = String(s.currency || "").toUpperCase();
      var add = function (code, sev, msg, fix) { issues.push({ code: code, severity: sev, id: s.id, msg: msg, fix: fix || null, row: s }); };
      if (/test/i.test(s.note || "") || /^test\b|test product/i.test(s.product || "") || /test/i.test(s.id || "")) add("test", "warn", "يبدو بيعاً تجريبياً", "delete");
      if (!(amt > 0)) add("amount", "bad", "المبلغ صفر أو سالب");
      if (fee < 0) add("fees_neg", "bad", "الرسوم سالبة");
      if (fee > amt) add("fees_big", "bad", "الرسوم أكبر من مبلغ البيع");
      if (ref < 0 || ref > amt) add("refund_big", "bad", "المبلغ المسترد غير منطقي");
      if (ref > 0 && !s.refunded_at) add("refund_date", "warn", "استرداد بلا تاريخ (سيُسجَّل بتاريخ البيع)");
      if (!/^[A-Z]{3}$/.test(cur)) add("currency", "bad", "رمز العملة غير صحيح: " + (s.currency || "فارغ"));
      else if (cur !== "EUR" && !rateCur[cur]) add("rate", "bad", "لا يوجد سعر صرف لعملة " + cur + " (أضفه في الإعدادات)");
      if (day && today && day > today) add("future", "warn", "تاريخ البيع في المستقبل");
      if (!cleanText(s.product) && !s.product_slug) add("product", "warn", "بيع بلا اسم منتج");
      else if (!s.product_slug) add("slug", "info", "المنتج غير مربوط بمنتج في موقعك");
      if (s.product && s.product !== cleanText(s.product)) add("spaces", "info", "مسافات زائدة في اسم المنتج", "trim");
      // possible duplicate: same store, product, amount within 3 minutes but a different id
      var t = Date.parse(s.sold_at), k = (s.platform || "") + "|" + cleanText(s.product).toLowerCase() + "|" + amt;
      (seen[k] || []).forEach(function (o) {
        if (Math.abs(o.t - t) <= 180000) add("dup", "warn", "قد يكون مكرراً مع " + o.id);
      });
      (seen[k] || (seen[k] = [])).push({ id: s.id, t: t });
    });
    return issues;
  }

  // journal lines + accounts → issues on entries
  function checkEntries(lines, accounts, today) {
    var am = accMap(accounts), issues = [], refs = {};
    journal(lines).forEach(function (e) {
      var add = function (code, sev, msg) { issues.push({ code: code, severity: sev, id: e.id, msg: msg, entry: e }); };
      if (e.dr !== e.cr) add("unbalanced", "bad", "القيد غير متوازن");
      if (today && e.date > today) add("future", "warn", "قيد بتاريخ مستقبلي");
      if (!cleanText(e.memo) && !e.ref && e.kind !== "sale" && e.kind !== "refund") add("memo", "info", "قيد بلا بيان ولا رقم مستند");
      e.lines.forEach(function (l) {
        var a = am[l.account];
        if (!a) add("account", "bad", "حساب غير موجود: " + l.account);
        else if (!a.active) add("inactive", "warn", "يستخدم حساباً موقوفاً: " + l.account);
      });
      if (e.partner && e.partner !== cleanText(e.partner)) add("spaces", "info", "مسافات زائدة في اسم الطرف");
      if (e.ref && (e.kind === "purchase" || e.kind === "expense")) {
        var k = partnerKey(e.partner) + "|" + e.ref.trim().toLowerCase();
        if (refs[k]) add("dup_ref", "warn", "رقم المستند " + e.ref + " مسجّل مرتين لنفس الطرف (القيد " + refs[k] + ")");
        else refs[k] = e.id;
      }
    });
    return issues;
  }

  // groups of partner names that are probably the same (different spelling / spaces / case)
  function similarPartners(names) {
    var g = {};
    (names || []).forEach(function (n) { if (!n) return; var k = partnerKey(n); if (!k) return; (g[k] || (g[k] = {}))[n] = (g[k][n] || 0) + 1; });
    return Object.keys(g).map(function (k) {
      var vs = Object.keys(g[k]).sort(function (a, b) { return g[k][b] - g[k][a] || a.length - b.length; });
      return { key: k, names: vs, best: cleanText(vs[0]) };
    }).filter(function (x) { return x.names.length > 1 || x.names[0] !== x.best; });
  }

  /* ---------- flat dataset for analysis / CSV ---------- */
  function dataset(lines, accounts) {
    var am = accMap(accounts);
    return prep(lines).map(function (x) {
      var a = am[x.a] || { name_ar: "", name_en: "", type: "" };
      return { date: x.d, year: x.d.slice(0, 4), month: ym(x.d), entry: x.e, line: x.n, kind: x.l.kind,
        kind_ar: KIND_AR[x.l.kind] || x.l.kind, ref: cleanText(x.l.ref), partner: cleanText(x.l.partner),
        memo: cleanText(x.l.line_memo || x.l.memo), account: x.a, account_ar: a.name_ar, account_en: a.name_en || "",
        type: a.type, debit: toNum(x.dr), credit: toNum(x.cr), net_dr_cr: toNum(x.net), amount: toNum(x.net * sideOf(a)) };
    });
  }
  function toCSV(rows, cols) {
    var q = function (v) {
      v = v === null || v === undefined ? "" : String(v);
      if (/^[=+\-@\t\r]/.test(v) && !/^-?\d+(\.\d+)?$/.test(v)) v = "'" + v;   // stop formula injection in Excel
      return /[",\r\n;]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
    };
    cols = cols || (rows[0] ? Object.keys(rows[0]) : []);
    return "﻿" + [cols.join(",")].concat(rows.map(function (r) { return cols.map(function (c) { return q(r[c]); }).join(","); })).join("\r\n") + "\r\n";
  }

  /* ---------- helpers for forms ---------- */
  // purchase / expense with optional VAT included in the gross amount → balanced lines
  function purchaseLines(o) {
    var gross = cents(o.gross), rate = Number(o.vatRate) || 0, vat = o.vat ? Math.round(gross * rate / (100 + rate)) : 0;
    if (!(gross > 0)) throw new Error("amount");
    var ls = [{ account: o.account, debit: toNum(gross - vat), credit: 0 }];
    if (vat > 0) ls.push({ account: o.vatAccount || "1300", debit: toNum(vat), credit: 0 });
    ls.push({ account: o.payFrom, debit: 0, credit: toNum(gross) });
    return ls;
  }
  function convert(amount, rate) { return Math.round(cents(amount) * Number(rate)); }   // → cents in EUR

  /* ---------- unusual amounts (robust: median + MAD, so one big value cannot hide itself) ---------- */
  function median(a) { var s = a.slice().sort(function (x, y) { return x - y; }), n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : 0; }
  // items: [{v: cents > 0, ...}] → items flagged as unusually large (needs ≥ 6 values in the group)
  function flagOutliers(items, minN) {
    var vals = items.map(function (x) { return x.v; }).filter(function (v) { return v > 0; });
    if (vals.length < (minN || 6)) return [];
    var m = median(vals), mad = median(vals.map(function (v) { return Math.abs(v - m); })) * 1.4826;
    return items.filter(function (x) {
      if (!(x.v > 0) || x.v < m * 3) return false;            // must be at least 3× the usual amount
      return mad === 0 ? x.v > m : (x.v - m) / mad > 5;       // and far outside the normal spread
    }).map(function (x) { return Object.assign({ median: Math.round(m) }, x); });
  }
  function checkOutliers(lines, accounts) {
    var am = accMap(accounts), byAcc = {}, entries = {}, issues = [];
    journal(lines).forEach(function (e) { entries[e.id] = e; });
    prep(lines).forEach(function (x) {
      var a = am[x.a]; if (!a || a.is_cash || (a.type !== "expense" && a.type !== "revenue" && a.type !== "asset")) return;
      if (x.l.kind === "opening" || x.l.kind === "vat") return;
      var g = byAcc[x.a] || (byAcc[x.a] = {});
      g[x.e] = (g[x.e] || 0) + Math.abs(x.net);
    });
    Object.keys(byAcc).forEach(function (code) {
      var items = Object.keys(byAcc[code]).map(function (id) { return { id: Number(id), v: byAcc[code][id] }; });
      flagOutliers(items).forEach(function (o) {
        issues.push({ code: "outlier", severity: "warn", id: o.id, entry: entries[o.id],
          msg: "مبلغ غير معتاد في «" + am[code].name_ar + "»: " + fmt(o.v) + " بينما المعتاد نحو " + fmt(o.median) });
      });
    });
    return issues;
  }
  function checkSalesOutliers(sales) {
    var g = {}, issues = [];
    (sales || []).forEach(function (s) {
      var k = cleanText(s.product).toLowerCase() + "|" + String(s.currency || "").toUpperCase();
      (g[k] || (g[k] = [])).push({ id: s.id, v: cents(s.amount), row: s });
    });
    Object.keys(g).forEach(function (k) {
      flagOutliers(g[k]).forEach(function (o) {
        issues.push({ code: "outlier", severity: "warn", id: o.id, row: o.row, fix: null,
          msg: "سعر بيع غير معتاد لهذا المنتج: " + fmt(o.v) + " بينما المعتاد نحو " + fmt(o.median) });
      });
    });
    return issues;
  }

  /* ---------- CSV import: parse → map columns → clean → de-duplicate → suggest accounts ---------- */
  function detectDelimiter(text) {
    var first = String(text).replace(/^﻿/, "").split(/\r?\n/).filter(function (l) { return l.trim(); })[0] || "", best = ",", bestN = -1;
    [",", ";", "\t", "|"].forEach(function (d) {
      var n = 0, q = false;
      for (var i = 0; i < first.length; i++) { var c = first[i]; if (c === '"') q = !q; else if (!q && c === d) n++; }
      if (n > bestN) { bestN = n; best = d; }
    });
    return best;
  }
  function parseCSV(text, delim) {
    text = String(text || "").replace(/^﻿/, "");
    var d = delim || detectDelimiter(text), rows = [], row = [], cell = "", q = false, i = 0, c;
    for (; i < text.length; i++) {
      c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
        else cell += c;
      } else if (c === '"') q = true;
      else if (c === d) { row.push(cell); cell = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(cell); rows.push(row); row = []; cell = "";
      } else cell += c;
    }
    if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
    rows = rows.filter(function (r) { return r.some(function (x) { return String(x).trim() !== ""; }); });
    return { delimiter: d, rows: rows };
  }
  // "1 234,56" "-12.50" "(12.50)" "12,50-" "€ 9,99" "1,234.56" "1.234,56" → cents; NaN if not a number
  function parseAmount(s) {
    var t = String(s === undefined || s === null ? "" : s).trim();
    if (!t) return NaN;
    var neg = false;
    if (/^\(.*\)$/.test(t)) { neg = true; t = t.slice(1, -1); }
    t = t.replace(/[\s  ']/g, "").replace(/[€$£]|EUR|USD|GBP|SEK/gi, "");
    if (/-$/.test(t)) { neg = !neg; t = t.slice(0, -1); }
    if (/^[+-]/.test(t)) { if (t[0] === "-") neg = !neg; t = t.slice(1); }
    if (!/^[\d.,]+$/.test(t) || !/\d/.test(t)) return NaN;
    var lc = t.lastIndexOf(","), ld = t.lastIndexOf("."), dec = null;
    if (lc >= 0 && ld >= 0) dec = lc > ld ? "," : ".";
    else if (lc >= 0) dec = /^[1-9]\d{0,2}(,\d{3})+$/.test(t) ? null : ",";
    else if (ld >= 0) dec = /^[1-9]\d{0,2}(\.\d{3}){2,}$/.test(t) ? null : ".";
    var intPart = t, frac = "";
    if (dec) { var k = t.lastIndexOf(dec); intPart = t.slice(0, k); frac = t.slice(k + 1); }
    if (/[.,]/.test(intPart) && !/^[1-9]\d{0,2}([.,]\d{3})+$/.test(intPart)) return NaN;   // separators must be real thousand groups
    if (dec && new RegExp("\\" + dec).test(intPart)) return NaN;                          // decimal mark used twice
    intPart = intPart.replace(/[.,]/g, "");
    if (frac.length > 2 || /[.,]/.test(frac)) return NaN;
    var c = Number(intPart || "0") * 100 + Number((frac + "00").slice(0, 2));
    return neg ? -c : c;
  }
  // fmt: auto | ymd | dmy | mdy → {date:'YYYY-MM-DD', ambiguous:bool} or null
  function parseDate(s, fmt) {
    var t = String(s || "").trim().replace(/T.*$/, "").replace(/\s+\d{1,2}:\d{2}(:\d{2})?.*$/, "");
    var p = t.split(/[.\/\-\s]+/).filter(Boolean);
    if (p.length !== 3 || p.some(function (x) { return !/^\d+$/.test(x); })) return null;
    var y, m, d, amb = false, f = fmt || "auto";
    if (f === "auto") {
      if (p[0].length === 4) f = "ymd";
      else if (Number(p[0]) > 12) f = "dmy";
      else if (Number(p[1]) > 12) f = "mdy";
      else { f = "dmy"; amb = Number(p[0]) !== Number(p[1]); }
    }
    if (f === "ymd") { y = p[0]; m = p[1]; d = p[2]; } else if (f === "dmy") { d = p[0]; m = p[1]; y = p[2]; } else { m = p[0]; d = p[1]; y = p[2]; }
    y = Number(y); m = Number(m); d = Number(d);
    if (y < 100) y += 2000;
    var dt = new Date(Date.UTC(y, m - 1, d));
    if (y < 1990 || y > 2100 || dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
    return { date: y + "-" + String(m).padStart(2, "0") + "-" + String(d).padStart(2, "0"), ambiguous: amb };
  }
  var COLS = {
    date: /^(date|päivä|pvm|kirjauspäivä|arvopäivä|maksupäivä|transaction date|booking date|value date|تاريخ|التاريخ)|date|päivä|pvm|تاريخ/i,
    amount: /^(amount|määrä|summa|المبلغ|مبلغ|net|total|sum)$|amount|määrä|summa|المبلغ/i,
    debit: /^(debit|withdrawal|money out|paid out|veloitus|مدين|سحب)/i,
    credit: /^(credit|deposit|money in|paid in|hyvitys|دائن|إيداع)/i,
    desc: /description|desc|selite|viesti|message|memo|details|narrative|text|البيان|وصف|تفاصيل/i,
    partner: /payee|payer|saaja|maksaja|counterparty|merchant|beneficiary|^name$|nimi|customer|المستفيد|الطرف|الاسم/i,
    currency: /currency|valuutta|العملة/i,
    ref: /reference|viite|arkistointi|^ref|transaction id|^id$|المرجع/i
  };
  function guessColumns(headers) {
    var used = {}, out = {};
    ["date", "debit", "credit", "amount", "currency", "partner", "desc", "ref"].forEach(function (k) {
      for (var i = 0; i < headers.length; i++) {
        var h = String(headers[i] || "").trim();
        if (used[i] || !h || /balance|saldo|الرصيد/i.test(h)) continue;
        if (COLS[k].test(h)) { out[k] = i; used[i] = 1; break; }
      }
    });
    if (out.debit !== undefined && out.credit === undefined) { delete out.debit; }   // one side only is not a pair
    return out;
  }
  function hash(s) { var h = 0x811c9dc5; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return ("0000000" + h.toString(16)).slice(-8); }
  function importKey(date, amount, text) { return "IMP-" + hash(date + "|" + amount + "|" + cleanText(text).toLowerCase()); }

  // learn which account was used for a partner before (manual / expense / purchase entries only)
  function partnerAccounts(lines, accounts) {
    var am = accMap(accounts), cnt = {};
    journal(lines).forEach(function (e) {
      if (e.kind === "sale" || e.kind === "refund" || !e.partner) return;
      var k = partnerKey(e.partner); if (!k) return;
      e.lines.forEach(function (l) { var a = am[l.account]; if (!a || a.is_cash || l.account === "1300" || l.account === "2100") return;
        var c = cnt[k] || (cnt[k] = {}); c[l.account] = (c[l.account] || 0) + 1; });
    });
    var best = {};
    Object.keys(cnt).forEach(function (k) { best[k] = Object.keys(cnt[k]).sort(function (a, b) { return cnt[k][b] - cnt[k][a]; })[0]; });
    return best;
  }
  function suggestAccount(text, partner, amount, learned) {
    var k = partnerKey(partner); if (k && learned && learned[k]) return learned[k];
    var t = (String(text || "") + " " + String(partner || "")).toLowerCase();
    if (amount > 0 && /payhip|gumroad|etsy|sikka|stripe|paypal|lemon ?squeezy/.test(t)) return "1020";
    if (amount > 0) return "4900";
    if (/palvelumaksu|pankkimaksu|bank fee|service fee|رسوم بنك|kuukausimaksu/.test(t)) return "6700";
    if (/google ads|facebook|meta ads|instagram|tiktok|mainos|advert/.test(t)) return "6100";
    if (/hetzner|hostinger|namecheap|godaddy|vercel|netlify|cloudflare|domain|hosting|webhotelli/.test(t)) return "6300";
    if (/adobe|canva|microsoft|github|openai|anthropic|notion|figma|subscription|tilaus/.test(t)) return "6200";
    if (/elisa|telia|dna |internet|puhelin/.test(t)) return "6500";
    return "6900";
  }
  /* rows: parsed rows WITHOUT header; map: {date, amount | debit+credit, desc, partner, currency, ref}
     existing: journal lines (for duplicates); opts: {dateFmt, cashAccount, accounts, today} */
  function buildImport(rows, map, existing, opts) {
    opts = opts || {};
    var seenFile = {}, occ = {}, have = {}, sameDay = {}, learned = partnerAccounts(existing || [], opts.accounts || []);
    journal(existing || []).forEach(function (e) {
      if (/^IMP-[0-9a-f]{8}$/.test(e.ref)) have[e.ref] = e.id;
      e.lines.forEach(function (l) { if (l.account === opts.cashAccount) sameDay[e.date + "|" + (l.dr - l.cr)] = e.id; });
    });
    var get = function (r, k) { return map[k] === undefined || map[k] === "" || map[k] === null ? "" : cleanText(r[Number(map[k])]); };
    return rows.map(function (r, i) {
      var it = { i: i + 1, raw: r, date: null, amount: NaN, desc: get(r, "desc"), partner: get(r, "partner"), ref: get(r, "ref"),
        currency: (get(r, "currency") || "EUR").toUpperCase(), status: "ok", reason: "", select: true };
      var pd = parseDate(get(r, "date"), opts.dateFmt);
      if (map.amount !== undefined && map.amount !== "") it.amount = parseAmount(get(r, "amount"));
      else {
        var dv = get(r, "debit"), cv = get(r, "credit"), d = dv ? parseAmount(dv) : 0, c = cv ? parseAmount(cv) : 0;
        it.amount = isNaN(d) || isNaN(c) ? NaN : Math.abs(c) - Math.abs(d);
      }
      var bad = function (msg) { it.status = "invalid"; it.reason = msg; it.select = false; };
      if (!pd) bad("تاريخ غير مفهوم: «" + get(r, "date") + "»");
      else { it.date = pd.date; if (pd.ambiguous && opts.dateFmt !== "dmy" && opts.dateFmt !== "mdy") it.ambiguous = true; }
      if (it.status === "ok" && isNaN(it.amount)) bad("مبلغ غير مفهوم");
      if (it.status === "ok" && it.amount === 0) bad("المبلغ صفر");
      if (it.status === "ok" && it.currency !== "EUR" && /^[A-Z]{3}$/.test(it.currency)) bad("العملة " + it.currency + " وليست يورو: سجّلها من نموذج المصروف مع سعر الصرف");
      if (it.status === "ok" && opts.today && it.date > opts.today) bad("تاريخ في المستقبل");
      if (it.status === "ok" && !it.desc && !it.partner) { it.desc = "حركة مستوردة"; }
      if (it.status === "ok") {
        var base = it.date + "|" + it.amount + "|" + cleanText(it.desc + " " + it.partner + " " + it.ref).toLowerCase(), first = seenFile[base];
        // identical rows get "#2", "#3"… so each keeps a stable key and a re-import of the same file is still recognised
        occ[base] = (occ[base] || 0) + 1;
        it.key = importKey(it.date, it.amount, it.desc + " " + it.partner + " " + it.ref + (occ[base] > 1 ? " #" + occ[base] : ""));
        if (have[it.key]) { it.status = "dup_existing"; it.reason = "مستورد من قبل (القيد #" + have[it.key] + ")"; it.select = false; }
        else if (first) { it.status = "dup_file"; it.reason = "مطابق للسطر " + first + " في نفس الملف (اختره إن كانت عمليتين فعلاً)"; it.select = false; }
        else if (sameDay[it.date + "|" + it.amount]) { it.status = "maybe_dup"; it.reason = "يوجد قيد بنفس التاريخ والمبلغ (#" + sameDay[it.date + "|" + it.amount] + ")"; it.select = false; }
        if (!first) seenFile[base] = it.i;
        it.account = suggestAccount(it.desc, it.partner, it.amount, learned);
      }
      return it;
    });
  }
  function importEntry(it, cashAccount, counter) {
    var a = (Math.abs(it.amount) / 100).toFixed(2), inflow = it.amount > 0;
    return { date: it.date, kind: inflow ? "manual" : "expense", ref: it.key, partner: it.partner.slice(0, 120),
      memo: (it.desc || it.partner || "حركة مستوردة").slice(0, 300),
      lines: inflow ? [{ account: cashAccount, debit: a, credit: "0" }, { account: counter, debit: "0", credit: a }]
                    : [{ account: counter, debit: a, credit: "0" }, { account: cashAccount, debit: "0", credit: a }] };
  }

  /* ---------- change log: human summary of what changed ---------- */
  function auditSummary(row) {
    var o = row.old_data || null, n = row.new_data || null, act = row.action;
    if (act === "update" && (!o || !n)) act = o ? "delete" : "insert";   // never crash on an incomplete log row
    if ((act === "insert" && !n) || (act === "delete" && !o)) return "—";
    if (act === "sync") return n ? "تسجيل المبيعات: " + (n.posted || 0) + " بيع، " + (n.refunds || 0) + " استرداد، " + (n.removed || 0) + " حذف" : "—";
    var lineStr = function (s) { return (s.lines || []).map(function (l) { return l.account + (Number(l.debit) ? " مدين " + Number(l.debit).toFixed(2) : " دائن " + Number(l.credit).toFixed(2)); }).join(" / "); };
    if (row.tbl === "acc_entries") {
      if (act === "insert") return "قيد جديد " + n.date + ": " + (n.memo || "") + " — " + lineStr(n);
      if (act === "delete") return "حُذف قيد " + o.date + ": " + (o.memo || "") + " — " + lineStr(o);
      var ch = [];
      ["date", "kind", "ref", "partner", "memo"].forEach(function (k) { if (String(o[k] || "") !== String(n[k] || "")) ch.push(k + ": «" + (o[k] || "") + "» ← «" + (n[k] || "") + "»"); });
      if (lineStr(o) !== lineStr(n)) ch.push("السطور: " + lineStr(o) + " ← " + lineStr(n));
      return ch.join(" · ") || "بدون تغيير";
    }
    if (act === "insert") return "إضافة: " + Object.keys(n).filter(function (k) { return !/created_at|updated_at/.test(k); }).map(function (k) { return k + "=" + n[k]; }).join("، ");
    if (act === "delete") return "حذف: " + Object.keys(o).filter(function (k) { return !/created_at|updated_at/.test(k); }).map(function (k) { return k + "=" + o[k]; }).join("، ");
    return Object.keys(n).filter(function (k) { return !/updated_at/.test(k) && JSON.stringify(o[k]) !== JSON.stringify(n[k]); })
      .map(function (k) { return k + ": «" + (o[k] === null ? "" : o[k]) + "» ← «" + (n[k] === null ? "" : n[k]) + "»"; }).join(" · ") || "بدون تغيير";
  }

  /* ---------- fixed assets & depreciation (Finland, EVL 30 §: one pool, ≤ 25 % of the remaining value per year;
     a remaining value of ≤ 1 200 € may be written off at once). Everything is read from the ledger:
     pool = asset accounts marked "investing" in the chart of accounts (1500 equipment + 1510 accumulated depreciation). ---------- */
  var WRITE_OFF_LIMIT = 120000;   // cents
  function fyEnd(year, startMonth) {
    var sm = startMonth || 1, y = sm === 1 ? year : year + 1, m = sm === 1 ? 12 : sm - 1;
    return monthEnd(y + "-" + String(m).padStart(2, "0"));
  }
  function depRef(year) { return "POISTO-" + year; }
  function poolCodes(accounts) {
    return (accounts || []).filter(function (a) { return a.type === "asset" && a.cf_group === "inv"; }).map(function (a) { return a.code; });
  }
  function assetRegister(lines, accounts, to) {
    var pool = poolCodes(accounts), rows = [];
    journal(lines).forEach(function (e) {
      if (to && e.date > to) return;
      if (/^POISTO-\d{4}$/.test(e.ref)) return;
      e.lines.forEach(function (l) {
        if (pool.indexOf(l.account) < 0 || l.account === "1510") return;
        if (l.dr) rows.push({ date: e.date, entry: e.id, kind: "add", account: l.account, memo: l.memo || e.memo, partner: e.partner, amount: l.dr });
        if (l.cr) rows.push({ date: e.date, entry: e.id, kind: "out", account: l.account, memo: l.memo || e.memo, partner: e.partner, amount: -l.cr });
      });
    });
    return rows;
  }
  function depreciationCalc(lines, accounts, year, startMonth, ratePct) {
    var pool = poolCodes(accounts), fs = fyStart(fyEnd(year, startMonth), startMonth), fe = fyEnd(year, startMonth), ref = depRef(year);
    var r = { year: year, from: fs, to: fe, ref: ref, opening: 0, additions: 0, disposals: 0, base: 0, existing: null, rate: Math.min(Math.max(Number(ratePct) || 0, 0), 25) };
    journal(lines).forEach(function (e) {
      if (e.date > fe) return;
      var thisDep = e.ref === ref, otherDep = /^POISTO-\d{4}$/.test(e.ref);
      e.lines.forEach(function (l) {
        if (pool.indexOf(l.account) < 0) return;
        var net = l.dr - l.cr;
        if (thisDep) { r.existing = r.existing || { id: e.id, amount: 0, date: e.date }; if (l.account === "1510") r.existing.amount += l.cr - l.dr; return; }
        if (e.date < fs) { r.opening += net; return; }
        if (otherDep) { r.opening += net; return; }          // a late entry for an earlier year still belongs to the opening value
        if (net > 0) r.additions += net; else r.disposals -= net;
      });
    });
    r.base = r.opening + r.additions - r.disposals;
    r.canWriteOff = r.base > 0 && r.base <= WRITE_OFF_LIMIT;
    r.suggested = r.base > 0 ? Math.round(r.base * r.rate / 100) : 0;
    r.remaining = r.base - r.suggested;
    return r;
  }
  function depreciationPlan(base, ratePct, firstYear, years) {
    var rate = Math.min(Math.max(Number(ratePct) || 0, 0), 25), rem = base, out = [];
    for (var i = 0; i < (years || 6) && rem > 0; i++) {
      var full = rem <= WRITE_OFF_LIMIT, dep = full ? rem : Math.round(rem * rate / 100);
      if (!dep) break;
      rem -= dep; out.push({ year: firstYear + i, depreciation: dep, remaining: rem, writeOff: full });
    }
    return out;
  }
  function depreciationLines(amount, expenseCode, contraCode) {
    var a = toNum(amount).toFixed(2);
    return [{ account: expenseCode || "6800", debit: a, credit: "0.00" }, { account: contraCode || "1510", debit: "0.00", credit: a }];
  }

  return {
    WRITE_OFF_LIMIT: WRITE_OFF_LIMIT, fyEnd: fyEnd, depRef: depRef, poolCodes: poolCodes, assetRegister: assetRegister,
    depreciationCalc: depreciationCalc, depreciationPlan: depreciationPlan, depreciationLines: depreciationLines,
    flagOutliers: flagOutliers, checkOutliers: checkOutliers, checkSalesOutliers: checkSalesOutliers, median: median,
    detectDelimiter: detectDelimiter, parseCSV: parseCSV, parseAmount: parseAmount, parseDate: parseDate, guessColumns: guessColumns,
    importKey: importKey, partnerAccounts: partnerAccounts, suggestAccount: suggestAccount, buildImport: buildImport, importEntry: importEntry,
    auditSummary: auditSummary,
    TYPE_AR: TYPE_AR, KIND_AR: KIND_AR, cents: cents, toNum: toNum, fmt: fmt, pct: pct,
    fyStart: fyStart, monthsBetween: monthsBetween, monthEnd: monthEnd, sideOf: sideOf, accMap: accMap,
    balances: balances, trialBalance: trialBalance, incomeStatement: incomeStatement, balanceSheet: balanceSheet,
    ledger: ledger, journal: journal, monthly: monthly, breakdown: breakdown, salesByPlatform: salesByPlatform,
    cashFlow: cashFlow, vatReport: vatReport, vatSettlementLines: vatSettlementLines, budgetVsActual: budgetVsActual,
    checkSales: checkSales, checkEntries: checkEntries, similarPartners: similarPartners, cleanText: cleanText,
    partnerKey: partnerKey, dataset: dataset, toCSV: toCSV, purchaseLines: purchaseLines, convert: convert
  };
});
