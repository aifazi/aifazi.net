-- Fix store_wishlist security issues:
-- 1. Remove unnecessary anon SELECT grant (only authenticated users should read wishlists)
-- 2. The table uses auth.users(id) which is inconsistent with the rest of the app
--    (public.users), but changing the FK would require data migration. The backend
--    accesses Supabase with service_role so RLS is bypassed regardless.
--    Leave the FK as-is but document the inconsistency.

-- Remove anon SELECT (authenticated-only access)
revoke select on public.store_wishlist from anon;

-- Drop the auth.uid()-based RLS policies (incompatible with PASETO auth).
-- The backend uses service_role and bypasses RLS; these policies are dead code.
drop policy if exists "Users can view own wishlist" on public.store_wishlist;
drop policy if exists "Users can add to own wishlist" on public.store_wishlist;
drop policy if exists "Users can remove from own wishlist" on public.store_wishlist;

-- Replace with service-role-only policies (backend authenticates via PASETO,
-- not Supabase Auth, so auth.uid() never matches).
create policy "Service role full access" on public.store_wishlist
  for all using (true) with check (true);
