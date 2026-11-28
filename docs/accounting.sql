-- SkillPostApp – accounting system (journal, ledger, trial balance, statements, budget, VAT).
-- Needs docs/analytics.sql first (is_admin() and the sales table).
-- Run ONCE in Supabase → SQL Editor → New query → paste everything → Run.
-- Safe to run again: it only adds what is missing and never deletes your data.
--
-- Rules the database itself guarantees (the page cannot break them):
--   * every entry has at least 2 lines and total debit = total credit
--   * a line is either a debit or a credit, never both, never zero, at most 2 decimals
--   * nothing dated on or before the lock date can be added, changed or deleted
--   * entries can only be written through acc_save_entry / acc_delete_entry / acc_sync_sales
--   * a used account cannot be deleted (deactivate it instead)
--   * only administrators can read or write anything

-- 1) Chart of accounts -------------------------------------------------------
create table if not exists public.acc_accounts (
  code       text primary key check (code ~ '^[0-9]{3,6}$'),
  name_ar    text not null check (char_length(name_ar) between 1 and 80),
  name_en    text not null default '' check (char_length(name_en) <= 80),
  type       text not null check (type in ('asset', 'liability', 'equity', 'revenue', 'expense')),
  is_cash    boolean not null default false,          -- counts as cash in the cash-flow statement
  cf_group   text not null default 'op' check (cf_group in ('op', 'inv', 'fin')),
  active     boolean not null default true,
  system     boolean not null default false,          -- used by the automatic entries; cannot be deleted
  created_at timestamptz not null default now()
);

insert into public.acc_accounts (code, name_ar, name_en, type, is_cash, cf_group, system) values
  ('1000', 'الصندوق (النقدية)',                'Cash',                          'asset',     true,  'op',  false),
  ('1010', 'البنك',                            'Bank',                          'asset',     true,  'op',  true),
  ('1020', 'أرصدة المنصات (Payhip, Gumroad…)', 'Platform balances',             'asset',     true,  'op',  true),
  ('1100', 'العملاء (ذمم مدينة)',              'Accounts receivable',           'asset',     false, 'op',  false),
  ('1300', 'ضريبة القيمة المضافة على المشتريات', 'Input VAT (ALV)',             'asset',     false, 'op',  true),
  ('1500', 'الأجهزة والمعدات',                 'Equipment',                     'asset',     false, 'inv', false),
  ('1510', 'مجمع إهلاك الأجهزة',               'Accumulated depreciation',      'asset',     false, 'inv', false),
  ('2000', 'الموردون (ذمم دائنة)',             'Accounts payable',              'liability', false, 'op',  true),
  ('2100', 'ضريبة القيمة المضافة على المبيعات', 'Output VAT (ALV)',             'liability', false, 'op',  true),
  ('2110', 'ضريبة القيمة المضافة المستحقة',     'VAT payable',                  'liability', false, 'op',  true),
  ('2200', 'القروض',                           'Loans',                         'liability', false, 'fin', false),
  ('2300', 'مصروفات مستحقة',                   'Accrued expenses',              'liability', false, 'op',  false),
  ('3000', 'رأس المال',                        'Owner capital',                 'equity',    false, 'fin', true),
  ('3100', 'المسحوبات الشخصية',                'Owner drawings',                'equity',    false, 'fin', false),
  ('3200', 'الأرباح المرحّلة',                  'Retained earnings',             'equity',    false, 'op',  false),
  ('4000', 'مبيعات المنتجات الرقمية',           'Digital product sales',         'revenue',   false, 'op',  true),
  ('4100', 'إيرادات الخدمات حسب الطلب',         'Custom service income',         'revenue',   false, 'op',  false),
  ('4900', 'إيرادات أخرى',                     'Other income',                  'revenue',   false, 'op',  false),
  ('4910', 'مردودات المبيعات (استرداد)',        'Sales refunds',                 'revenue',   false, 'op',  true),
  ('5000', 'المشتريات وتكلفة المبيعات',         'Purchases / cost of sales',     'expense',   false, 'op',  false),
  ('6000', 'رسوم المنصات والدفع',               'Platform & payment fees',       'expense',   false, 'op',  true),
  ('6100', 'الإعلانات والتسويق',                'Advertising & marketing',       'expense',   false, 'op',  false),
  ('6200', 'البرمجيات والاشتراكات',             'Software & subscriptions',      'expense',   false, 'op',  false),
  ('6300', 'الاستضافة والنطاقات',               'Hosting & domains',             'expense',   false, 'op',  false),
  ('6400', 'أدوات ومستلزمات صغيرة',             'Small tools & supplies',        'expense',   false, 'op',  false),
  ('6500', 'الإنترنت والهاتف',                  'Internet & phone',              'expense',   false, 'op',  false),
  ('6600', 'التدريب والكتب',                    'Training & books',              'expense',   false, 'op',  false),
  ('6700', 'رسوم بنكية',                        'Bank charges',                  'expense',   false, 'op',  false),
  ('6800', 'الإهلاك',                           'Depreciation',                  'expense',   false, 'op',  false),
  ('6900', 'مصروفات أخرى',                      'Other expenses',                'expense',   false, 'op',  false),
  ('7000', 'فروق أسعار الصرف',                  'Exchange differences',          'expense',   false, 'op',  false)
on conflict (code) do nothing;

-- 2) Settings (one row) --------------------------------------------------------
create table if not exists public.acc_settings (
  id                 int primary key default 1 check (id = 1),
  company_name       text not null default 'SkillPostApp' check (char_length(company_name) <= 120),
  vat_enabled        boolean not null default false,
  vat_rate           numeric(5,2) not null default 25.5 check (vat_rate >= 0 and vat_rate < 100),
  lock_date          date,                                       -- nothing on/before this date can change
  fiscal_start_month int not null default 1 check (fiscal_start_month between 1 and 12),
  updated_at         timestamptz not null default now()
);
insert into public.acc_settings (id) values (1) on conflict (id) do nothing;

-- 3) Exchange rates: 1 unit of <currency> = <rate_to_eur> EUR, valid from <month> --------
create table if not exists public.acc_fx_rates (
  currency    text not null check (currency ~ '^[A-Z]{3}$' and currency <> 'EUR'),
  month       date not null check (extract(day from month) = 1),
  rate_to_eur numeric(14,6) not null check (rate_to_eur > 0),
  primary key (currency, month)
);

-- 4) Journal ----------------------------------------------------------------------
create table if not exists public.acc_entries (
  id          bigint generated always as identity primary key,
  entry_date  date not null,
  kind        text not null default 'manual'
              check (kind in ('manual', 'sale', 'refund', 'purchase', 'expense', 'transfer', 'opening', 'vat', 'adjust')),
  ref         text not null default '' check (char_length(ref) <= 60),     -- invoice / receipt number
  partner     text not null default '' check (char_length(partner) <= 120), -- supplier, customer or store
  memo        text not null default '' check (char_length(memo) <= 300),
  currency    text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  fx_rate     numeric(14,6) not null default 1 check (fx_rate > 0),
  orig_amount numeric(14,2),                                             -- total in the original currency (information)
  source_key  text unique,                                               -- 'sale:<id>' / 'refund:<id>' for automatic entries
  source_sig  text,                                                      -- fingerprint of the sale it was built from
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists acc_entries_date_idx on public.acc_entries (entry_date);

create table if not exists public.acc_lines (
  id           bigint generated always as identity primary key,
  entry_id     bigint not null references public.acc_entries (id) on delete cascade,
  line_no      smallint not null default 1,
  account_code text not null references public.acc_accounts (code) on update cascade on delete restrict,
  debit        numeric(14,2) not null default 0 check (debit >= 0),
  credit       numeric(14,2) not null default 0 check (credit >= 0),
  memo         text not null default '' check (char_length(memo) <= 200),
  check ((debit > 0) <> (credit > 0))
);
create index if not exists acc_lines_entry_idx on public.acc_lines (entry_id);
create index if not exists acc_lines_account_idx on public.acc_lines (account_code);

-- 5) Budget: planned amount per revenue/expense account per month ---------------
create table if not exists public.acc_budget (
  year         int not null check (year between 2000 and 2100),
  month        int not null check (month between 1 and 12),
  account_code text not null references public.acc_accounts (code) on update cascade on delete cascade,
  amount       numeric(14,2) not null default 0 check (amount >= 0),
  primary key (year, month, account_code)
);

-- 6) Guards -------------------------------------------------------------------------
-- 6a) Debit must equal credit and every entry needs ≥ 2 lines (checked at COMMIT, so an
--     entry and its lines are always written together).
create or replace function public.acc_check_balance() returns trigger
language plpgsql security definer set search_path = public as $$
declare ids bigint[]; v_id bigint; d numeric; c numeric; n int;
begin
  if tg_table_name = 'acc_entries' then ids := array[new.id];
  elsif tg_op = 'INSERT' then ids := array[new.entry_id];
  elsif tg_op = 'DELETE' then ids := array[old.entry_id];
  else ids := array[old.entry_id, new.entry_id];          -- a line may have moved between entries
  end if;
  foreach v_id in array ids loop
    continue when not exists (select 1 from public.acc_entries where id = v_id);   -- entry was deleted
    select coalesce(sum(debit), 0), coalesce(sum(credit), 0), count(*) into d, c, n from public.acc_lines where entry_id = v_id;
    if n < 2 then raise exception 'entry_needs_two_lines: %', v_id; end if;
    if d <> c then raise exception 'unbalanced_entry: % (debit % / credit %)', v_id, d, c; end if;
  end loop;
  return null;
end $$;

drop trigger if exists acc_lines_balance on public.acc_lines;
create constraint trigger acc_lines_balance after insert or update or delete on public.acc_lines
  deferrable initially deferred for each row execute function public.acc_check_balance();
drop trigger if exists acc_entries_balance on public.acc_entries;
create constraint trigger acc_entries_balance after insert on public.acc_entries
  deferrable initially deferred for each row execute function public.acc_check_balance();

-- 6b) Lock date: closed periods cannot change.
create or replace function public.acc_lock_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare lk date; d_old date; d_new date;
begin
  select lock_date into lk from public.acc_settings where id = 1;
  if lk is not null then
    if tg_table_name = 'acc_entries' then
      if tg_op <> 'INSERT' then d_old := old.entry_date; end if;
      if tg_op <> 'DELETE' then d_new := new.entry_date; end if;
    else
      if tg_op <> 'INSERT' then select entry_date into d_old from public.acc_entries where id = old.entry_id; end if;
      if tg_op <> 'DELETE' then select entry_date into d_new from public.acc_entries where id = new.entry_id; end if;
    end if;
    if (d_old is not null and d_old <= lk) or (d_new is not null and d_new <= lk) then
      raise exception 'period_locked: %', lk;
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
drop trigger if exists acc_entries_lock on public.acc_entries;
create trigger acc_entries_lock before insert or update or delete on public.acc_entries
  for each row execute function public.acc_lock_guard();
drop trigger if exists acc_lines_lock on public.acc_lines;
create trigger acc_lines_lock before insert or update or delete on public.acc_lines
  for each row execute function public.acc_lock_guard();

-- 6c) Lines may only use active accounts; system accounts cannot be deleted or change type.
create or replace function public.acc_line_account_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.acc_accounts where code = new.account_code and active) then
    raise exception 'account_inactive: %', new.account_code;
  end if;
  return new;
end $$;
drop trigger if exists acc_lines_account on public.acc_lines;
create trigger acc_lines_account before insert or update of account_code on public.acc_lines
  for each row execute function public.acc_line_account_guard();

create or replace function public.acc_account_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if old.system then raise exception 'system_account: %', old.code; end if;
    return old;
  end if;
  if old.system and (new.code <> old.code or new.type <> old.type or not new.active or not new.system) then
    raise exception 'system_account: %', old.code;
  end if;
  if new.type <> old.type and exists (select 1 from public.acc_lines where account_code = old.code) then
    raise exception 'account_in_use: %', old.code;
  end if;
  return new;
end $$;
drop trigger if exists acc_accounts_guard on public.acc_accounts;
create trigger acc_accounts_guard before update or delete on public.acc_accounts
  for each row execute function public.acc_account_guard();

-- 6d) Lock date can only move by an administrator, and never past today.
create or replace function public.acc_settings_guard() returns trigger language plpgsql as $$
begin
  if new.lock_date is not null and new.lock_date > current_date then raise exception 'lock_in_future'; end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists acc_settings_guard on public.acc_settings;
create trigger acc_settings_guard before update on public.acc_settings
  for each row execute function public.acc_settings_guard();

-- 7) Writing entries (the only way the page can write to the journal) ----------
create or replace function public.acc_save_entry(p jsonb) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_id bigint := nullif(p ->> 'id', '')::bigint;
  v_kind text := coalesce(nullif(p ->> 'kind', ''), 'manual');
  v_date date := nullif(p ->> 'date', '')::date;
  old_kind text;
  l jsonb; i int := 0; d numeric; c numeric; td numeric := 0; tc numeric := 0;
begin
  if not public.is_admin() then raise exception 'not_admin'; end if;
  if v_kind in ('sale', 'refund') then raise exception 'auto_entry'; end if;
  if v_date is null then raise exception 'date_required'; end if;
  if coalesce(jsonb_typeof(p -> 'lines'), '') <> 'array' or jsonb_array_length(p -> 'lines') < 2 then raise exception 'entry_needs_two_lines'; end if;
  if jsonb_array_length(p -> 'lines') > 200 then raise exception 'too_many_lines'; end if;
  for l in select * from jsonb_array_elements(p -> 'lines') loop
    d := coalesce(nullif(l ->> 'debit', '')::numeric, 0);
    c := coalesce(nullif(l ->> 'credit', '')::numeric, 0);
    if d < 0 or c < 0 then raise exception 'negative_amount'; end if;
    if (d > 0) = (c > 0) then raise exception 'line_debit_or_credit'; end if;
    if d <> round(d, 2) or c <> round(c, 2) then raise exception 'two_decimals'; end if;
    td := td + d; tc := tc + c;
  end loop;
  if td <> tc then raise exception 'unbalanced_entry: debit % / credit %', td, tc; end if;

  if v_id is null then
    insert into public.acc_entries (entry_date, kind, ref, partner, memo, currency, fx_rate, orig_amount)
    values (v_date, v_kind, coalesce(p ->> 'ref', ''), coalesce(p ->> 'partner', ''), coalesce(p ->> 'memo', ''),
            coalesce(nullif(upper(p ->> 'currency'), ''), 'EUR'), coalesce(nullif(p ->> 'fx_rate', '')::numeric, 1),
            nullif(p ->> 'orig_amount', '')::numeric)
    returning id into v_id;
  else
    select kind into old_kind from public.acc_entries where id = v_id for update;
    if old_kind is null then raise exception 'entry_not_found'; end if;
    if old_kind in ('sale', 'refund') then raise exception 'auto_entry'; end if;
    delete from public.acc_lines where entry_id = v_id;
    update public.acc_entries set entry_date = v_date, kind = v_kind, ref = coalesce(p ->> 'ref', ''),
      partner = coalesce(p ->> 'partner', ''), memo = coalesce(p ->> 'memo', ''),
      currency = coalesce(nullif(upper(p ->> 'currency'), ''), 'EUR'), fx_rate = coalesce(nullif(p ->> 'fx_rate', '')::numeric, 1),
      orig_amount = nullif(p ->> 'orig_amount', '')::numeric, updated_at = now()
    where id = v_id;
  end if;
  for l in select * from jsonb_array_elements(p -> 'lines') loop
    i := i + 1;
    insert into public.acc_lines (entry_id, line_no, account_code, debit, credit, memo)
    values (v_id, i, l ->> 'account', coalesce(nullif(l ->> 'debit', '')::numeric, 0), coalesce(nullif(l ->> 'credit', '')::numeric, 0),
            left(coalesce(l ->> 'memo', ''), 200));
  end loop;
  return v_id;
end $$;

create or replace function public.acc_delete_entry(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare k text;
begin
  if not public.is_admin() then raise exception 'not_admin'; end if;
  select kind into k from public.acc_entries where id = p_id;
  if k is null then raise exception 'entry_not_found'; end if;
  if k in ('sale', 'refund') then raise exception 'auto_entry'; end if;
  delete from public.acc_entries where id = p_id;
end $$;

-- 8) Sales → journal (automatic, safe to run any number of times) ---------------
--    sale:    Dr 1020 platform balance (net) + Dr 6000 fees   /  Cr 4000 sales (+ Cr 2100 VAT when enabled)
--    refund:  Dr 4910 refunds (+ Dr 2100 VAT)                 /  Cr 1020 platform balance
create or replace function public.acc_sale_rate(p_cur text, p_at date) returns numeric
language sql stable set search_path = public as $$
  select case when upper(p_cur) = 'EUR' then 1::numeric else
    (select rate_to_eur from public.acc_fx_rates where currency = upper(p_cur) and month <= p_at order by month desc limit 1) end;
$$;

create or replace function public.acc_sync_sales() returns json
language plpgsql security definer set search_path = public as $$
declare
  s record; st record; e record;
  v_rate numeric; v_day date; v_rday date; v_sig text; v_id bigint;
  gross numeric; fee numeric; vat numeric; r numeric; rvat numeric;
  n_post int := 0; n_ref int := 0; n_del int := 0; n_locked int := 0; n_bad int := 0;
  missing text[] := '{}';
begin
  if not public.is_admin() then raise exception 'not_admin'; end if;
  select * into st from public.acc_settings where id = 1;

  for s in select * from public.sales order by sold_at loop
    begin
      v_day  := (s.sold_at at time zone 'Europe/Helsinki')::date;
      v_rday := coalesce((s.refunded_at at time zone 'Europe/Helsinki')::date, v_day);
      v_rate := public.acc_sale_rate(s.currency, v_day);
      if v_rate is null then
        if not (upper(s.currency) = any (missing)) then missing := missing || upper(s.currency); end if;
        continue;
      end if;
      gross := round(s.amount * v_rate, 2);
      fee   := round(s.fees * v_rate, 2);
      if gross <= 0 or fee < 0 or fee > gross or s.refunded < 0 or s.refunded > s.amount then n_bad := n_bad + 1; continue; end if;
      vat := case when st.vat_enabled then round(gross * st.vat_rate / (100 + st.vat_rate), 2) else 0 end;

      -- the sale
      v_sig := concat_ws('|', s.amount, s.fees, upper(s.currency), v_day, v_rate, st.vat_enabled, st.vat_rate, s.platform, s.product);
      select id, source_sig into e from public.acc_entries where source_key = 'sale:' || s.id;
      if e.id is null or e.source_sig is distinct from v_sig then
        if e.id is not null then delete from public.acc_entries where id = e.id; end if;
        insert into public.acc_entries (entry_date, kind, ref, partner, memo, currency, fx_rate, orig_amount, source_key, source_sig)
        values (v_day, 'sale', left(s.id, 60), s.platform, left('بيع: ' || coalesce(nullif(s.product, ''), s.product_slug), 300),
                upper(s.currency), v_rate, s.amount, 'sale:' || s.id, v_sig)
        returning id into v_id;
        if gross - fee > 0 then insert into public.acc_lines (entry_id, line_no, account_code, debit) values (v_id, 1, '1020', gross - fee); end if;
        if fee > 0 then insert into public.acc_lines (entry_id, line_no, account_code, debit) values (v_id, 2, '6000', fee); end if;
        insert into public.acc_lines (entry_id, line_no, account_code, credit) values (v_id, 3, '4000', gross - vat);
        if vat > 0 then insert into public.acc_lines (entry_id, line_no, account_code, credit) values (v_id, 4, '2100', vat); end if;
        n_post := n_post + 1;
      end if;

      -- the refund (if any)
      e := null;
      select id, source_sig into e from public.acc_entries where source_key = 'refund:' || s.id;
      if s.refunded > 0 then
        r := round(s.refunded * v_rate, 2);
        if r <= 0 then n_bad := n_bad + 1; continue; end if;
        rvat := case when st.vat_enabled then round(r * st.vat_rate / (100 + st.vat_rate), 2) else 0 end;
        v_sig := concat_ws('|', s.refunded, upper(s.currency), v_rday, v_rate, st.vat_enabled, st.vat_rate);
        if e.id is null or e.source_sig is distinct from v_sig then
          if e.id is not null then delete from public.acc_entries where id = e.id; end if;
          insert into public.acc_entries (entry_date, kind, ref, partner, memo, currency, fx_rate, orig_amount, source_key, source_sig)
          values (v_rday, 'refund', left(s.id, 60), s.platform, left('استرداد: ' || coalesce(nullif(s.product, ''), s.product_slug), 300),
                  upper(s.currency), v_rate, s.refunded, 'refund:' || s.id, v_sig)
          returning id into v_id;
          insert into public.acc_lines (entry_id, line_no, account_code, debit) values (v_id, 1, '4910', r - rvat);
          if rvat > 0 then insert into public.acc_lines (entry_id, line_no, account_code, debit) values (v_id, 2, '2100', rvat); end if;
          insert into public.acc_lines (entry_id, line_no, account_code, credit) values (v_id, 3, '1020', r);
          n_ref := n_ref + 1;
        end if;
      elsif e.id is not null then
        delete from public.acc_entries where id = e.id; n_del := n_del + 1;
      end if;
    exception when others then
      if sqlerrm like 'period_locked%' then n_locked := n_locked + 1; else raise; end if;
    end;
  end loop;

  -- sales that were deleted (e.g. test sales): remove their automatic entries
  for e in select a.id from public.acc_entries a
           where a.kind in ('sale', 'refund')
             and not exists (select 1 from public.sales x where 'sale:' || x.id = a.source_key or 'refund:' || x.id = a.source_key) loop
    begin
      delete from public.acc_entries where id = e.id; n_del := n_del + 1;
    exception when others then
      if sqlerrm like 'period_locked%' then n_locked := n_locked + 1; else raise; end if;
    end;
  end loop;

  return json_build_object('posted', n_post, 'refunds', n_ref, 'removed', n_del, 'locked', n_locked,
                           'invalid', n_bad, 'missing_rates', to_json(missing));
end $$;

-- 9) One flat, read-only view for reports and export ----------------------------
create or replace view public.acc_ledger_v with (security_invoker = true) as
  select l.id as line_id, l.entry_id, l.line_no, l.account_code, l.debit, l.credit, l.memo as line_memo,
         e.entry_date, e.kind, e.ref, e.partner, e.memo, e.currency, e.fx_rate, e.orig_amount, e.source_key
  from public.acc_lines l join public.acc_entries e on e.id = l.entry_id;

-- 10) Access: administrators only ----------------------------------------------
alter table public.acc_accounts enable row level security;
alter table public.acc_settings enable row level security;
alter table public.acc_fx_rates enable row level security;
alter table public.acc_entries  enable row level security;
alter table public.acc_lines    enable row level security;
alter table public.acc_budget   enable row level security;

drop policy if exists acc_accounts_admin on public.acc_accounts;
create policy acc_accounts_admin on public.acc_accounts for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists acc_settings_admin on public.acc_settings;
create policy acc_settings_admin on public.acc_settings for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists acc_fx_admin on public.acc_fx_rates;
create policy acc_fx_admin on public.acc_fx_rates for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists acc_budget_admin on public.acc_budget;
create policy acc_budget_admin on public.acc_budget for all to authenticated using (public.is_admin()) with check (public.is_admin());
-- journal: read only from the page; writes go through the functions above
drop policy if exists acc_entries_read on public.acc_entries;
create policy acc_entries_read on public.acc_entries for select to authenticated using (public.is_admin());
drop policy if exists acc_lines_read on public.acc_lines;
create policy acc_lines_read on public.acc_lines for select to authenticated using (public.is_admin());

revoke all on public.acc_entries, public.acc_lines from anon, authenticated;
grant select on public.acc_entries, public.acc_lines, public.acc_ledger_v to authenticated;
grant select, insert, update, delete on public.acc_accounts, public.acc_fx_rates, public.acc_budget to authenticated;
grant select, update on public.acc_settings to authenticated;
revoke all on public.acc_accounts, public.acc_settings, public.acc_fx_rates, public.acc_budget, public.acc_ledger_v from anon;

revoke all on function public.acc_save_entry(jsonb), public.acc_delete_entry(bigint), public.acc_sync_sales(),
                       public.acc_sale_rate(text, date), public.acc_check_balance(), public.acc_lock_guard(),
                       public.acc_line_account_guard(), public.acc_account_guard(),
                       public.acc_settings_guard() from public, anon;
grant execute on function public.acc_save_entry(jsonb), public.acc_delete_entry(bigint), public.acc_sync_sales() to authenticated;

-- 11) Reload the API so the page sees the new tables at once
notify pgrst, 'reload schema';
