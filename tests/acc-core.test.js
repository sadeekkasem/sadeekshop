const A = require('../src/static/assets/acc-core.js');
let pass = 0, fail = 0;
const eq = (got, exp, m) => { const g = JSON.stringify(got), e = JSON.stringify(exp); if (g === e) pass++; else { fail++; console.log('FAIL', m, '\n got', g, '\n exp', e); } };

const accounts = [
  ['1000', 'asset', 1, 'op'], ['1010', 'asset', 1, 'op'], ['1020', 'asset', 1, 'op'], ['1300', 'asset', 0, 'op'], ['1500', 'asset', 0, 'inv'],
  ['2000', 'liability', 0, 'op'], ['2100', 'liability', 0, 'op'], ['2110', 'liability', 0, 'op'], ['3000', 'equity', 0, 'fin'], ['3100', 'equity', 0, 'fin'],
  ['4000', 'revenue', 0, 'op'], ['4100', 'revenue', 0, 'op'], ['4910', 'revenue', 0, 'op'], ['5000', 'expense', 0, 'op'], ['6000', 'expense', 0, 'op'], ['6300', 'expense', 0, 'op']
].map(([code, type, cash, cf]) => ({ code, type, is_cash: !!cash, cf_group: cf, name_ar: 'ح' + code, active: code !== '2000' }));

let L = [];
const E = (id, date, kind, lines, extra = {}) => lines.forEach(([a, d, c], i) => L.push(Object.assign({ entry_id: id, line_no: i + 1, account_code: a, debit: String(d), credit: String(c), entry_date: date, kind, ref: '', partner: '', memo: 'm' }, extra)));
E(1, '2025-12-31', 'opening', [['1010', 1000, 0], ['3000', 0, 1000]]);
E(2, '2026-01-10', 'sale', [['1020', 17.55, 0], ['6000', 1.45, 0], ['4000', 0, 19]], { partner: 'payhip' });
E(3, '2026-01-15', 'expense', [['6300', 10, 0], ['1300', 2.55, 0], ['1010', 0, 12.55]], { partner: 'Hetzner', ref: 'INV-1' });
E(4, '2026-02-01', 'purchase', [['1500', 500, 0], ['1010', 0, 500]]);
E(5, '2026-02-05', 'transfer', [['1010', 17.55, 0], ['1020', 0, 17.55]]);
E(6, '2026-02-20', 'refund', [['4910', 5, 0], ['1020', 0, 5]], { partner: 'payhip' });
E(7, '2025-06-01', 'manual', [['1000', 100, 0], ['4100', 0, 100]]);
E(8, '2026-03-01', 'manual', [['3100', 50, 0], ['1000', 0, 50]]);
L = L.reverse(); // engine must not depend on input order

// money
eq(A.cents('0.1') + A.cents('0.2'), 30, 'cents add');
eq(A.fmt(-123456), '-1,234.56', 'fmt negative');
eq(A.fmt(5), '0.05', 'fmt small');
eq(A.fmt(-5, { paren: true }), '(0.05)', 'fmt paren');
eq(A.cents('12,5'), 1250, 'comma decimal');
eq(A.monthsBetween('2025-11-15', '2026-02-01'), ['2025-11', '2025-12', '2026-01', '2026-02'], 'months');
eq(A.monthEnd('2024-02'), '2024-02-29', 'leap month end');
eq(A.fyStart('2026-03-10', 7), '2025-07-01', 'fiscal year start July');

// income statement 2026
const is = A.incomeStatement(L, accounts, '2026-01-01', '2026-12-31');
eq([is.totalRevenue, is.totalCogs, is.totalOpex, is.netProfit], [1400, 0, 1145, 255], 'IS totals');
eq(is.revenue.map(r => [r.code, r.amount]), [['4000', 1900], ['4910', -500]], 'IS revenue rows (refund negative)');
eq(is.netMargin, 18.2, 'net margin');

// balance sheet
const bs = A.balanceSheet(L, accounts, '2026-12-31', 1);
eq([bs.totalAssets, bs.totalLiabilities, bs.totalEquity, bs.balanced], [105255, 0, 105255, true], 'BS balanced');
eq(bs.equity.filter(r => r.computed).map(r => r.amount), [10000, 255], 'prior + current profit');
eq(bs.assets.find(r => r.code === '1020').amount, -500, 'platform balance negative after refund');
const bs2 = A.balanceSheet(L, accounts, '2026-01-31', 1);
eq(bs2.balanced, true, 'BS balanced mid-year');
const bs3 = A.balanceSheet(L, accounts, '2026-02-28', 7); // FY starts July → 2025-07-01
eq([bs3.balanced, bs3.fyStart, bs3.equity.filter(r => r.computed).map(r => r.amount)], [true, '2025-07-01', [10000, 255]], 'BS with July fiscal year');

// trial balance
const tb = A.trialBalance(L, accounts, '2026-01-01', '2026-12-31');
eq(tb.balanced, true, 'TB balanced');
eq(tb.totals.openDr, 110000, 'TB opening debit = 1000 bank + 100 cash');

// ledger
const lg = A.ledger(L, accounts, '1010', '2026-01-01', '2026-12-31');
eq([lg.opening, lg.rows.map(r => r.balance), lg.closing], [100000, [98745, 48745, 50500], 50500], 'bank ledger running balance');
const lgr = A.ledger(L, accounts, '4000', null, null);
eq(lgr.closing, 1900, 'revenue ledger positive on credit side');

// journal
const j = A.journal(L);
eq(j.map(e => e.id), [7, 1, 2, 3, 4, 5, 6, 8], 'journal date order');
eq(j.every(e => e.dr === e.cr), true, 'journal entries balanced');

// monthly
const mo = A.monthly(L, accounts, '2026-01-01', '2026-03-31');
eq(mo.map(m => [m.month, m.revenue, m.expense, m.profit, m.cash]), [['2026-01', 1900, 1145, 755, 110500], ['2026-02', -500, 0, -500, 60000], ['2026-03', 0, 0, 0, 55000]], 'monthly series');

// cash flow
const cf = A.cashFlow(L, accounts, '2026-01-01', '2026-12-31');
eq([cf.opening, cf.operating, cf.investing, cf.financing, cf.net, cf.closing, cf.balanced], [110000, 0, -50000, -5000, -55000, 55000, true], 'cash flow');

// breakdown & platform
eq(A.breakdown(L, accounts, '2026-01-01', '2026-12-31', 'expense').map(r => [r.code, r.amount]), [['6300', 1000], ['6000', 145]], 'expense breakdown');
eq(A.salesByPlatform(L, accounts, '2026-01-01', '2026-12-31'), [{ platform: 'payhip', amount: 1400 }], 'sales by platform net of refunds');

// VAT
const v = A.vatReport(L, '2026-01-01', '2026-12-31');
eq(v, { output: 0, input: 255, payable: -255 }, 'VAT report');
const sl = A.vatSettlementLines(v);
eq(sl, [{ account: '1300', debit: 0, credit: 2.55 }, { account: '2110', debit: 2.55, credit: 0 }], 'VAT settlement lines balanced');
const v2 = { output: 1000, input: 255, payable: 745 };
const s2 = A.vatSettlementLines(v2); const d = s2.reduce((a, l) => a + A.cents(l.debit), 0), c = s2.reduce((a, l) => a + A.cents(l.credit), 0);
eq(d === c && d === 1000, true, 'VAT settlement payable balanced');

// budget
const bva = A.budgetVsActual(L, accounts, [{ year: 2026, month: 1, account_code: '6300', amount: '8' }, { year: 2026, month: 2, account_code: '6300', amount: 8 }, { year: 2026, month: 1, account_code: '4000', amount: 30 }, { year: 2025, month: 1, account_code: '4000', amount: 99 }, { year: 2026, month: 1, account_code: '1010', amount: 5 }], 2026);
const b63 = bva.rows.find(r => r.code === '6300'), b40 = bva.rows.find(r => r.code === '4000');
eq([b63.totalActual, b63.totalBudget, b63.variance, b63.favourable], [1000, 1600, -600, true], 'budget expense favourable');
eq([b40.totalActual, b40.totalBudget, b40.variance, b40.favourable], [1900, 3000, -1100, false], 'budget revenue unfavourable');
eq(bva.rows.some(r => r.code === '1010'), false, 'balance-sheet accounts ignored in budget');
eq([bva.months[0].revA, bva.months[0].revB, bva.months[0].expA, bva.months[0].expB], [1900, 3000, 1145, 800], 'budget month 1');

// cleaning: sales
const sales = [
  { id: 'payhip:1', platform: 'payhip', sold_at: '2026-01-10T10:00:00Z', product: 'Kit ', product_slug: '', amount: '19', fees: '1', currency: 'EUR', refunded: '0' },
  { id: 'manual:2', platform: 'payhip', sold_at: '2026-01-10T10:01:00Z', product: 'Kit', product_slug: 'kit', amount: '19', fees: '1', currency: 'EUR', refunded: '0' },
  { id: 'gumroad:3', platform: 'gumroad', sold_at: '2030-01-01T00:00:00Z', product: 'Test product', product_slug: '', amount: '5', fees: '9', currency: 'usd', refunded: '6' },
  { id: 'x:4', platform: 'etsy', sold_at: '2026-01-01T00:00:00Z', product: 'Y', product_slug: 'y', amount: '3', fees: '0', currency: 'SEK', refunded: '1' }
];
const ci = A.checkSales(sales, [{ currency: 'USD', month: '2026-01-01', rate_to_eur: 0.9 }], '2026-11-28');
const codes = id => ci.filter(i => i.id === id).map(i => i.code).sort();
eq(codes('payhip:1'), ['slug', 'spaces'], 'sale 1 issues');
eq(codes('manual:2'), ['dup'], 'sale 2 duplicate detected');
eq(codes('gumroad:3'), ['fees_big', 'future', 'refund_big', 'refund_date', 'slug', 'test'], 'sale 3 issues (usd lowercase accepted)');
eq(codes('x:4'), ['rate', 'refund_date'], 'sale 4 missing rate');

// cleaning: entries
const L2 = L.concat([
  { entry_id: 9, line_no: 1, account_code: '6300', debit: '1', credit: '0', entry_date: '2026-04-01', kind: 'expense', ref: 'INV-1', partner: 'hetzner ', memo: '' },
  { entry_id: 9, line_no: 2, account_code: '2000', debit: '0', credit: '1', entry_date: '2026-04-01', kind: 'expense', ref: 'INV-1', partner: 'hetzner ', memo: '' },
  { entry_id: 10, line_no: 1, account_code: '1010', debit: '1', credit: '0', entry_date: '2027-01-01', kind: 'manual', ref: '', partner: '', memo: '' },
  { entry_id: 10, line_no: 2, account_code: '9999', debit: '0', credit: '1', entry_date: '2027-01-01', kind: 'manual', ref: '', partner: '', memo: '' }
]);
const ei = A.checkEntries(L2, accounts, '2026-11-28');
eq(ei.filter(i => i.id === 9).map(i => i.code).sort(), ['dup_ref', 'inactive', 'spaces'], 'entry 9 issues');
eq(ei.filter(i => i.id === 10).map(i => i.code).sort(), ['account', 'future', 'memo'], 'entry 10 issues');
eq(ei.some(i => i.id < 9), false, 'no false alarms on clean entries');

eq(A.similarPartners(['Hetzner', 'hetzner ', 'HETZNER Oy', 'Payhip']).map(g => g.names.length), [3], 'similar partners grouped');

// CSV
const csv = A.toCSV([{ a: '=1+1', b: 'x,y', c: -5, d: '-3.5', e: 'قال "مرحبا"' }]);
eq(csv, '﻿a,b,c,d,e\r\n\'=1+1,"x,y",-5,-3.5,"قال ""مرحبا"""\r\n', 'CSV escaping + formula guard');
const ds = A.dataset(L, accounts);
eq(ds.length, L.length, 'dataset rows');
eq(ds.reduce((s, r) => s + A.cents(r.net_dr_cr), 0), 0, 'dataset nets to zero');

// forms
eq(A.purchaseLines({ gross: '12.55', vat: true, vatRate: 25.5, account: '6300', payFrom: '1010' }), [{ account: '6300', debit: 10, credit: 0 }, { account: '1300', debit: 2.55, credit: 0 }, { account: '1010', debit: 0, credit: 12.55 }], 'purchase with VAT');
eq(A.purchaseLines({ gross: 7.99, vat: false, account: '6200', payFrom: '2000' }).length, 2, 'purchase without VAT');
let threw = false; try { A.purchaseLines({ gross: 0, account: '1', payFrom: '2' }); } catch (e) { threw = true; } eq(threw, true, 'zero amount rejected');
// rounding stress: many VAT purchases always balance
let bad = 0; for (let g = 1; g < 5000; g += 7) { const ls = A.purchaseLines({ gross: g / 100, vat: true, vatRate: 25.5, account: '6300', payFrom: '1010' }); const dd = ls.reduce((s, l) => s + A.cents(l.debit), 0), cc = ls.reduce((s, l) => s + A.cents(l.credit), 0); if (dd !== cc) bad++; }
eq(bad, 0, 'VAT rounding never unbalances');
eq(A.convert('10.00', 0.923456), 923, 'convert to EUR cents');

console.log(`pass ${pass} fail ${fail}`); process.exit(fail ? 1 : 0);
