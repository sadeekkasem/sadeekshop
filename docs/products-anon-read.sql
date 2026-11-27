-- Fix: the public site (GitHub Actions build) reads public.products with the
-- anonymous publishable key. It must see active products only, and must not
-- call is_admin() — anon does not have EXECUTE on that function, and a policy
-- that mentions it returns 401 "permission denied for function is_admin".
--
-- Do not grant EXECUTE on public.is_admin() to anon.
--
-- Recorded before this change (27 Nov 2026):
--   "admin writes products"        TO public  ALL    USING (is_admin()) WITH CHECK (is_admin())
--   "public reads active products" TO public  SELECT USING ((active = true) OR is_admin())
-- The write policy is ALL, so it also ran on SELECT for anon and caused the 401.
--
-- After: authenticated keeps the same admin rules; anon gets a separate SELECT
-- policy that only uses (active = true).

alter policy "admin writes products" on public.products to authenticated;
alter policy "public reads active products" on public.products to authenticated;

drop policy if exists "anon reads active products" on public.products;
create policy "anon reads active products"
  on public.products
  for select
  to anon
  using (active = true);
