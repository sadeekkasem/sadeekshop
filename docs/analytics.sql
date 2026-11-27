-- SkillPostApp – statistics, sales and email alerts for the control panel.
-- Run ONCE in Supabase → SQL Editor → New query → paste everything → Run.
-- Safe to run again: it only adds what is missing and never deletes your data.

-- 0) Who is an administrator (the same people who can open the control panel)
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins a where lower(a.email) = lower(coalesce(auth.jwt() ->> 'email', '')));
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- 1) Visits and button clicks (anonymous: no cookies, no IP address, no names or emails)
create table if not exists public.events (
  id      bigint generated always as identity primary key,
  at      timestamptz not null default now(),
  kind    text not null check (kind in ('view', 'seen', 'click')),
  page    text not null default '' check (char_length(page) <= 120),
  product text not null default '' check (char_length(product) <= 80),
  store   text not null default '' check (char_length(store) <= 60),
  ref     text not null default '' check (char_length(ref) <= 80),
  device  text not null default '' check (device in ('', 'm', 't', 'd')),
  lang    text not null default '' check (lang in ('', 'ar', 'en', 'fi'))
);
create index if not exists events_at_idx on public.events (at);

-- the time of an event is always set by the server, never by the visitor's browser
create or replace function public.events_set_time() returns trigger language plpgsql as $$
begin new.at := now(); return new; end $$;
drop trigger if exists events_set_time on public.events;
create trigger events_set_time before insert on public.events for each row execute function public.events_set_time();

alter table public.events enable row level security;
drop policy if exists events_insert_public on public.events;
create policy events_insert_public on public.events for insert to anon, authenticated with check (true);
drop policy if exists events_read_admin on public.events;
create policy events_read_admin on public.events for select to authenticated using (public.is_admin());
drop policy if exists events_delete_admin on public.events;
create policy events_delete_admin on public.events for delete to authenticated using (public.is_admin());
grant insert on public.events to anon, authenticated;
grant select, delete on public.events to authenticated;

-- 2) Sales from Payhip / Gumroad (arrive automatically) and manual sales (SIKKA, Etsy, others)
create table if not exists public.sales (
  id            text primary key,                 -- e.g. payhip:ZGjVj5x4GN  or  manual:<random>
  platform      text not null check (platform in ('payhip', 'gumroad', 'etsy', 'sikka', 'other')),
  sold_at       timestamptz not null default now(),
  product       text not null default '',         -- product name as the store sends it
  product_link  text not null default '',         -- product page on the store (used to match our products)
  product_slug  text not null default '',         -- our product id, when known
  amount        numeric(12,2) not null default 0, -- what the customer paid
  fees          numeric(12,2) not null default 0, -- store + payment fees
  currency      text not null default 'EUR',
  refunded      numeric(12,2) not null default 0,
  refunded_at   timestamptz,
  source        text not null default 'manual' check (source in ('webhook', 'manual')),
  note          text not null default '' check (char_length(note) <= 300),
  created_at    timestamptz not null default now()
);
create index if not exists sales_sold_at_idx on public.sales (sold_at);
alter table public.sales enable row level security;
drop policy if exists sales_admin on public.sales;
create policy sales_admin on public.sales for all to authenticated using (public.is_admin()) with check (public.is_admin());
grant select, insert, update, delete on public.sales to authenticated;

-- 3) Email alert settings (one row)
create table if not exists public.alert_settings (
  id            int primary key default 1 check (id = 1),
  email         text not null default '',
  daily_report  boolean not null default true,
  on_sale       boolean not null default true,
  no_visits     boolean not null default true,
  clicks_no_sale boolean not null default true,
  last_daily    date,
  last_no_visit date,
  updated_at    timestamptz not null default now()
);
insert into public.alert_settings (id) values (1) on conflict (id) do nothing;
alter table public.alert_settings enable row level security;
drop policy if exists alert_settings_admin on public.alert_settings;
create policy alert_settings_admin on public.alert_settings for all to authenticated using (public.is_admin()) with check (public.is_admin());
grant select, insert, update on public.alert_settings to authenticated;

-- 4) One call that returns every number the statistics tab needs (administrators only)
create or replace function public.site_stats(p_from timestamptz, p_to timestamptz)
returns json language plpgsql stable security definer set search_path = public as $$
declare r json;
begin
  if not public.is_admin() then raise exception 'not_admin'; end if;
  with e as (select * from public.events where at >= p_from and at < p_to)
  select json_build_object(
    'views',    (select count(*) from e where kind = 'view'),
    'clicks',   (select count(*) from e where kind = 'click'),
    'by_day',   coalesce((select json_agg(x order by x.day) from (
                   select to_char(date_trunc('day', at at time zone 'Europe/Helsinki'), 'YYYY-MM-DD') as day,
                          count(*) filter (where kind = 'view') as views,
                          count(*) filter (where kind = 'click') as clicks
                   from e group by 1) x), '[]'::json),
    'by_ref',   coalesce((select json_agg(x order by x.n desc) from (
                   select coalesce(nullif(ref, ''), '(direct)') as k, count(*) as n from e where kind = 'view' group by 1 order by 2 desc limit 15) x), '[]'::json),
    'by_device',coalesce((select json_agg(x order by x.n desc) from (
                   select device as k, count(*) as n from e where kind = 'view' group by 1) x), '[]'::json),
    'by_lang',  coalesce((select json_agg(x order by x.n desc) from (
                   select lang as k, count(*) as n from e where kind = 'view' group by 1) x), '[]'::json),
    'by_page',  coalesce((select json_agg(x order by x.n desc) from (
                   select page as k, count(*) as n from e where kind = 'view' group by 1 order by 2 desc limit 15) x), '[]'::json),
    'by_store', coalesce((select json_agg(x order by x.n desc) from (
                   select coalesce(nullif(store, ''), '?') as k, count(*) as n from e where kind = 'click' group by 1) x), '[]'::json),
    'by_product', coalesce((select json_agg(x) from (
                   select product as k,
                          count(*) filter (where kind = 'seen') as seen,
                          count(*) filter (where kind = 'click') as clicks
                   from e where product <> '' group by 1) x), '[]'::json)
  ) into r;
  return r;
end $$;
revoke all on function public.site_stats(timestamptz, timestamptz) from public;
grant execute on function public.site_stats(timestamptz, timestamptz) to authenticated;

-- 5) Keep the visit log small: events older than 13 months can be deleted from the Statistics tab (button "حذف القديم").
