-- Wishlist table for product sync across devices
create table if not exists public.store_wishlist (
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.store_products(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, product_id)
);

-- Index for fast lookups
create index if not exists store_wishlist_user_idx on public.store_wishlist (user_id);
create index if not exists store_wishlist_product_idx on public.store_wishlist (product_id);

-- RLS: users can only see/modify their own wishlist
alter table public.store_wishlist enable row level security;

create policy \"Users can view own wishlist\" on public.store_wishlist
  for select using (auth.uid() = user_id);

create policy \"Users can add to own wishlist\" on public.store_wishlist
  for insert with check (auth.uid() = user_id);

create policy \"Users can remove from own wishlist\" on public.store_wishlist
  for delete using (auth.uid() = user_id);

-- Grant permissions
grant select, insert, delete on public.store_wishlist to authenticated;
grant select on public.store_wishlist to anon;
