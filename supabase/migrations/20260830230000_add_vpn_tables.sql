-- WireGuard VPN tables
-- Stores peer configs, IP allocations, and server state

create table if not exists public.vpn_server (
  id uuid primary key default gen_random_uuid(),
  public_key text not null,
  endpoint_host text not null,
  endpoint_port integer default 51820,
  subnet inet default '10.8.0.0/24',
  server_ip inet default '10.8.0.1',
  dns text default '1.1.1.1,1.0.0.1',
  created_at timestamptz default now() not null
);

create table if not exists public.vpn_peers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  public_key text not null unique,
  private_key text not null,
  preshared_key text,
  allocated_ip inet not null unique,
  device_name text not null,
  device_os text default '',
  status text default 'active',
  last_handshake timestamptz,
  transfer_rx bigint default 0,
  transfer_tx bigint default 0,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- Indexes
create index if not exists idx_vpn_peers_user_id on public.vpn_peers(user_id);
create index if not exists idx_vpn_peers_public_key on public.vpn_peers(public_key);
create index if not exists idx_vpn_peers_allocated_ip on public.vpn_peers(allocated_ip);
create index if not exists idx_vpn_peers_status on public.vpn_peers(status);

-- RLS: users can only see/modify their own peers
alter table public.vpn_peers enable row level security;

DO $$ BEGIN
  create policy "VPN peers: users can view own peers"
    on public.vpn_peers for select
    using (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  create policy "VPN peers: users can insert own peers"
    on public.vpn_peers for insert
    with check (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  create policy "VPN peers: users can update own peers"
    on public.vpn_peers for update
    using (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  create policy "VPN peers: users can delete own peers"
    on public.vpn_peers for delete
    using (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Server config: admin-only read
alter table public.vpn_server enable row level security;

DO $$ BEGIN
  create policy "VPN server: authenticated read"
    on public.vpn_server for select
    using (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
