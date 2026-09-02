-- Notifications table for in-app notifications
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  type text not null,              -- 'mention', 'reply', 'like', 'follow', 'order', 'system'
  title text not null,
  body text,
  link text,                       -- deep link or relative path
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_idx on public.notifications (user_id, read, created_at desc);

-- RLS: users see only their own notifications
alter table public.notifications enable row level security;

DO $$ BEGIN
  create policy "Users see own notifications" on public.notifications
    for select using (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  create policy "Service role manages notifications" on public.notifications
    for all using (true) with check (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
