// Database tests for docs/accounting.sql. Run: npm i @electric-sql/pglite && node tests/accounting-db.test.mjs
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';

const db = new PGlite();
const R = new URL('../docs/', import.meta.url).pathname;
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL:', m); } };
async function expectErr(sql, re, m) {
  try { await db.exec(sql); ok(false, m + ' (no error)'); }
  catch (e) { ok(re.test(e.message), m + ' -> ' + e.message); }
}
const q = async (s, p) => (await db.query(s, p)).rows;
const asAdmin = `set role authenticated; select set_config('test.jwt','{"email":"Boss@x.com"}',false);`;
const asOther = `set role authenticated; select set_config('test.jwt','{"email":"evil@x.com"}',false);`;
const asSuper = `reset role;`;

await db.exec(`
  create role anon; create role authenticated; create role service_role;
  create schema auth;
  create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('test.jwt', true), ''), '{}')::jsonb $$;
  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.jwt() to anon, authenticated;
  grant usage on schema public to anon, authenticated, service_role;
  create table public.admins (email text primary key);
  insert into public.admins values ('boss@x.com');
  grant select on public.admins to authenticated;
`);
await db.exec(fs.readFileSync(R + 'analytics.sql', 'utf8'));
const acc = fs.readFileSync(R + 'accounting.sql', 'utf8').replace("notify pgrst, 'reload schema';", '');
await db.exec(acc);
await db.exec(acc); // idempotent
ok((await q(`select count(*)::int n from acc_accounts`))[0].n === 31, 'seed accounts 31');

const save = (p) => `select public.acc_save_entry('${JSON.stringify(p).replace(/'/g, "''")}'::jsonb) as id`;

// ---- not admin
await db.exec(asOther);
await expectErr(save({ date: '2026-01-05', lines: [{ account: '1010', debit: 10 }, { account: '3000', credit: 10 }] }), /not_admin/, 'non-admin cannot save');
ok((await q(`select count(*)::int n from acc_accounts`))[0].n === 0, 'non-admin sees no accounts (RLS)');
await expectErr(`select public.acc_sync_sales()`, /not_admin/, 'non-admin cannot sync');

// ---- admin entries
await db.exec(asAdmin);
let r = await q(save({ date: '2026-01-05', kind: 'opening', memo: 'رأس مال', lines: [{ account: '1010', debit: 1000 }, { account: '3000', credit: 1000 }] }));
const e1 = r[0].id;
ok(e1 > 0, 'balanced entry saved');
await expectErr(save({ date: '2026-01-06', lines: [{ account: '1010', debit: 10 }, { account: '3000', credit: 9 }] }), /unbalanced/, 'unbalanced rejected');
await expectErr(save({ date: '2026-01-06', lines: [{ account: '1010', debit: 10 }] }), /two_lines/, 'one line rejected');
await expectErr(save({ date: '2026-01-06' }), /two_lines/, 'no lines rejected');
await expectErr(save({ date: '2026-01-06', lines: [{ account: '1010', debit: 10, credit: 10 }, { account: '3000', credit: 0, debit: 0 }] }), /debit_or_credit/, 'both sides rejected');
await expectErr(save({ date: '2026-01-06', lines: [{ account: '1010', debit: 10.005 }, { account: '3000', credit: 10.005 }] }), /two_decimals/, '3 decimals rejected');
await expectErr(save({ date: '2026-01-06', lines: [{ account: '1010', debit: -5 }, { account: '3000', credit: -5 }] }), /negative/, 'negative rejected');
await expectErr(save({ date: '2026-01-06', lines: [{ account: '9999', debit: 5 }, { account: '3000', credit: 5 }] }), /account_inactive|foreign key/, 'unknown account rejected');
await expectErr(save({ date: '', lines: [{ account: '1010', debit: 5 }, { account: '3000', credit: 5 }] }), /date_required/, 'date required');
await expectErr(save({ date: '2026-01-06', kind: 'sale', lines: [{ account: '1010', debit: 5 }, { account: '3000', credit: 5 }] }), /auto_entry/, 'manual sale kind rejected');
ok((await q(`select count(*)::int n from acc_entries`))[0].n === 1, 'failed saves left nothing behind');

// direct writes blocked
await expectErr(`insert into acc_entries (entry_date) values ('2026-01-01')`, /permission denied/, 'direct insert entries blocked');
await expectErr(`delete from acc_lines`, /permission denied/, 'direct delete lines blocked');

// edit
r = await q(save({ id: e1, date: '2026-01-05', kind: 'opening', memo: 'رأس المال المعدل', lines: [{ account: '1010', debit: 1500 }, { account: '1000', debit: 500 }, { account: '3000', credit: 2000 }] }));
ok(r[0].id == e1, 'edit keeps id');
let tb = await q(`select account_code, sum(debit-credit)::numeric n from acc_lines group by 1 order by 1`);
ok(tb.length === 3 && Number(tb.find(x => x.account_code === '3000').n) === -2000, 'edit replaced lines');

// expense with VAT + purchase on credit + payout transfer
await q(save({ date: '2026-02-10', kind: 'expense', partner: 'Hetzner', ref: 'INV-1', lines: [{ account: '6300', debit: 10 }, { account: '1300', debit: 2.55 }, { account: '1010', credit: 12.55 }] }));
const e3 = (await q(save({ date: '2026-02-11', kind: 'purchase', partner: 'X', lines: [{ account: '5000', debit: 40 }, { account: '2000', credit: 40 }] })))[0].id;
await q(`select public.acc_delete_entry(${e3})`);
ok((await q(`select count(*)::int n from acc_entries where id=${e3}`))[0].n === 0, 'delete entry');
ok((await q(`select count(*)::int n from acc_lines where entry_id=${e3}`))[0].n === 0, 'delete cascades lines');

// ---- sales sync
await db.exec(asSuper);
await db.exec(`
  insert into sales (id, platform, sold_at, product, amount, fees, currency) values
   ('payhip:A', 'payhip', '2026-03-01 10:00+00', 'Dental kit', 19.00, 1.45, 'EUR'),
   ('gumroad:B', 'gumroad', '2026-03-31 23:30+00', 'Budget', 10.00, 1.00, 'USD'),
   ('manual:C', 'sikka', '2026-03-05 10:00+00', 'Bad', 5.00, 6.00, 'EUR');
`);
await db.exec(asAdmin);
let s = (await q(`select public.acc_sync_sales() j`))[0].j;
ok(s.posted === 1 && s.invalid === 1 && JSON.stringify(s.missing_rates) === '["USD"]', 'sync 1: ' + JSON.stringify(s));
let sl = await q(`select account_code a, debit::float d, credit::float c from acc_ledger_v where source_key='sale:payhip:A' order by line_no`);
ok(JSON.stringify(sl) === JSON.stringify([{ a: '1020', d: 17.55, c: 0 }, { a: '6000', d: 1.45, c: 0 }, { a: '4000', d: 0, c: 19 }]), 'sale lines ' + JSON.stringify(sl));
// Helsinki date: 2026-03-31 23:30 UTC = 2026-04-01 local
await db.exec(`insert into acc_fx_rates values ('USD','2026-03-01',0.9),('USD','2026-04-01',0.8)`);
s = (await q(`select public.acc_sync_sales() j`))[0].j;
ok(s.posted === 1 && s.missing_rates.length === 0, 'sync 2 posts USD ' + JSON.stringify(s));
let ub = await q(`select entry_date::text d, fx_rate::float r from acc_entries where source_key='sale:gumroad:B'`);
ok(ub[0].d === '2026-04-01' && ub[0].r === 0.8, 'USD uses Helsinki date and April rate ' + JSON.stringify(ub));
sl = await q(`select account_code a, debit::float d, credit::float c from acc_ledger_v where source_key='sale:gumroad:B' order by line_no`);
ok(sl[0].d === 7.2 && sl[1].d === 0.8 && sl[2].c === 8, 'USD converted');
s = (await q(`select public.acc_sync_sales() j`))[0].j;
ok(s.posted === 0 && s.refunds === 0 && s.removed === 0, 'sync idempotent ' + JSON.stringify(s));

// refund partial, then changed, then removed
await db.exec(asSuper);
await db.exec(`update sales set refunded = 19.00, refunded_at = '2026-03-10 12:00+00' where id = 'payhip:A'`);
await db.exec(asAdmin);
s = (await q(`select public.acc_sync_sales() j`))[0].j;
ok(s.refunds === 1, 'refund posted');
sl = await q(`select account_code a, debit::float d, credit::float c, entry_date::text t from acc_ledger_v where source_key='refund:payhip:A' order by line_no`);
ok(sl.length === 2 && sl[0].a === '4910' && sl[0].d === 19 && sl[1].a === '1020' && sl[1].c === 19 && sl[0].t === '2026-03-10', 'refund lines ' + JSON.stringify(sl));
await db.exec(asSuper);
await db.exec(`update sales set refunded = 0, refunded_at = null where id = 'payhip:A'`);
await db.exec(asAdmin);
s = (await q(`select public.acc_sync_sales() j`))[0].j;
ok(s.removed === 1 && (await q(`select count(*)::int n from acc_entries where source_key='refund:payhip:A'`))[0].n === 0, 'refund removed');
// auto entries cannot be edited/deleted by hand
const sid = (await q(`select id from acc_entries where source_key='sale:payhip:A'`))[0].id;
await expectErr(`select public.acc_delete_entry(${sid})`, /auto_entry/, 'cannot delete auto entry');
await expectErr(save({ id: sid, date: '2026-03-01', lines: [{ account: '1010', debit: 5 }, { account: '3000', credit: 5 }] }), /auto_entry/, 'cannot edit auto entry');

// VAT on → resync splits VAT
await db.exec(`update acc_settings set vat_enabled = true, vat_rate = 25.5`);
s = (await q(`select public.acc_sync_sales() j`))[0].j;
ok(s.posted === 2, 'VAT change reposts both sales ' + JSON.stringify(s));
sl = await q(`select account_code a, debit::float d, credit::float c from acc_ledger_v where source_key='sale:payhip:A' order by line_no`);
// 19 * 25.5/125.5 = 3.86 ; revenue 15.14
ok(sl.find(x => x.a === '2100').c === 3.86 && sl.find(x => x.a === '4000').c === 15.14, 'VAT split ' + JSON.stringify(sl));

// deleted (test) sale → entries removed
await db.exec(asSuper);
await db.exec(`delete from sales where id = 'gumroad:B'`);
await db.exec(asAdmin);
s = (await q(`select public.acc_sync_sales() j`))[0].j;
ok(s.removed === 1 && (await q(`select count(*)::int n from acc_entries where source_key='sale:gumroad:B'`))[0].n === 0, 'orphan removed');

// global balance
let tot = (await q(`select sum(debit)::float d, sum(credit)::float c from acc_lines`))[0];
ok(tot.d === tot.c, 'whole ledger balanced ' + JSON.stringify(tot));

// ---- lock date
await expectErr(`update acc_settings set lock_date = current_date + 1`, /lock_in_future/, 'lock date in future rejected');
await db.exec(`update acc_settings set lock_date = '2026-02-28'`);
await expectErr(save({ id: e1, date: '2026-01-05', lines: [{ account: '1010', debit: 1 }, { account: '3000', credit: 1 }] }), /period_locked/, 'edit in locked period');
await expectErr(save({ date: '2026-02-01', lines: [{ account: '1010', debit: 1 }, { account: '3000', credit: 1 }] }), /period_locked/, 'new entry in locked period');
await expectErr(save({ id: e1, date: '2026-03-15', lines: [{ account: '1010', debit: 1 }, { account: '3000', credit: 1 }] }), /period_locked/, 'cannot move locked entry out');
await expectErr(`select public.acc_delete_entry(${e1})`, /period_locked/, 'delete in locked period');
// sale changed inside locked period → counted as locked, no crash
await db.exec(`update acc_settings set lock_date = '2026-03-02'`);
await db.exec(asSuper); await db.exec(`update sales set fees = 2 where id = 'payhip:A'`); await db.exec(asAdmin);
s = (await q(`select public.acc_sync_sales() j`))[0].j;
ok(s.locked === 1 && s.posted === 0, 'locked sale reported ' + JSON.stringify(s));
ok((await q(`select count(*)::int n from acc_entries where source_key='sale:payhip:A'`))[0].n === 1, 'locked sale entry kept');
await db.exec(`update acc_settings set lock_date = null`);

// ---- accounts
await expectErr(`delete from acc_accounts where code = '4000'`, /system_account/, 'system account delete blocked');
await expectErr(`update acc_accounts set active = false where code = '1010'`, /system_account/, 'system account deactivate blocked');
await expectErr(`delete from acc_accounts where code = '6300'`, /foreign key|violates/, 'used account delete blocked');
await db.exec(`update acc_accounts set active = false where code = '6300'`);
await expectErr(save({ date: '2026-05-01', lines: [{ account: '6300', debit: 1 }, { account: '1010', credit: 1 }] }), /account_inactive/, 'inactive account rejected');
await expectErr(`update acc_accounts set type = 'asset' where code = '6300'`, /account_in_use/, 'type change of used account blocked');
await db.exec(`insert into acc_accounts (code, name_ar, type) values ('6950','تجربة','expense'); delete from acc_accounts where code='6950'`);
ok(true, 'unused account add/delete');

// ---- budget
await db.exec(`insert into acc_budget values (2026, 1, '6100', 50)`);
await expectErr(`insert into acc_budget values (2026, 13, '6100', 50)`, /check/, 'budget month range');

// ---- anon
await db.exec(`reset role; set role anon;`);
await expectErr(`select * from acc_ledger_v`, /permission denied/, 'anon cannot read ledger');
await expectErr(`select * from acc_accounts`, /permission denied/, 'anon cannot read accounts');
await expectErr(`select public.acc_sync_sales()`, /permission denied|not_admin/, 'anon cannot sync');

console.log(`pass ${pass}  fail ${fail}`);
process.exit(fail ? 1 : 0);
