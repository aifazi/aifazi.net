-- VPN session tracking — logs connect/disconnect events per peer
-- Used by the mobile dashboard to show connection history and session duration.

create table if not exists public.vpn_sessions (
  id uuid primary key default gen_random_uuid(),
  peer_id uuid references public.vpn_peers(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  connected_at timestamptz default now() not null,
  disconnected_at timestamptz,
  client_public_ip inet,
  client_public_ip_country text,
  bytes_rx bigint default 0,
  bytes_tx bigint default 0
);

create index if not exists idx_vpn_sessions_peer_id on public.vpn_sessions(peer_id);
create index if not exists idx_vpn_sessions_user_id on public.vpn_sessions(user_id);
create index if not exists idx_vpn_sessions_connected_at on public.vpn_sessions(connected_at desc);

-- RLS: users can only see their own sessions
alter table public.vpn_sessions enable row level security;

DO $$ BEGIN
  create policy "VPN sessions: users can view own sessions"
    on public.vpn_sessions for select
    using (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  create policy "VPN sessions: users can insert own sessions"
    on public.vpn_sessions for insert
    with check (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  create policy "VPN sessions: users can update own sessions"
    on public.vpn_sessions for update
    using (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Add last_connected_at to vpn_peers for quick status display
alter table public.vpn_peers
  add column if not exists last_connected_at timestamptz;
