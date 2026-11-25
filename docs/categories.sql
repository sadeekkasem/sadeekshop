-- SkillPostApp – new product categories (run ONCE in Supabase → SQL Editor → New query → Run).
-- Safe to run more than once. It changes nothing in your existing products.

-- 1) Product type (Excel, Google Sheets, website template, n8n, custom service)
alter table public.products add column if not exists product_type text;
update public.products set product_type = case when category = 'auto' then 'n8n' else 'excel' end where product_type is null;

-- 2) Allow the new fields (clinic, shop, ship, edu) if an old rule limited category to the first six values
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.products'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%category%'
  loop
    execute format('alter table public.products drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.products drop constraint if exists products_category_allowed;
alter table public.products add constraint products_category_allowed
  check (category in ('acc','stock','hr','clinic','price','shop','ship','home','auto','edu'));
alter table public.products drop constraint if exists products_type_allowed;
alter table public.products add constraint products_type_allowed
  check (product_type is null or product_type in ('excel','gsheets','web','n8n','custom'));
