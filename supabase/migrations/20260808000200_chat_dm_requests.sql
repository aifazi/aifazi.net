-- 031_chat_dm_requests.sql
-- DM request/accept/block model so strangers can't DM freely, plus
-- per-participant read state for unread badges.
--
-- dm_requests : directional request sender -> recipient.
--               status: pending | accepted | rejected. An ACCEPTED request in
--               either direction authorises a thread between the pair.
-- dm_blocks   : blocker blocks blocked (directional). Blocks are checked on
--               thread creation AND on every DM send.
-- dm_read_state : (thread_id, username) -> last_read_at, used for unread counts.
--
-- Same security stance as 030: private tables, RLS on, zero policies, all
-- access via the backend service-role client.
CREATE TABLE IF NOT EXISTS public.dm_requests (
    id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    sender      TEXT NOT NULL,
    recipient   TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'pending',  -- pending | accepted | rejected
    created_at  TIMESTAMPTZ DEFAULT now(),
    UNIQUE(sender, recipient)
);

CREATE INDEX IF NOT EXISTS dm_requests_recipient_idx ON public.dm_requests (recipient, status);
CREATE INDEX IF NOT EXISTS dm_requests_sender_idx    ON public.dm_requests (sender, status);

CREATE TABLE IF NOT EXISTS public.dm_blocks (
    blocker     TEXT NOT NULL,
    blocked     TEXT NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (blocker, blocked)
);
CREATE INDEX IF NOT EXISTS dm_blocks_blocked_idx ON public.dm_blocks (blocked);
CREATE INDEX IF NOT EXISTS dm_blocks_blocker_idx ON public.dm_blocks (blocker);

CREATE TABLE IF NOT EXISTS public.dm_read_state (
    thread_id    TEXT NOT NULL,
    username     TEXT NOT NULL,
    last_read_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (thread_id, username)
);

ALTER TABLE public.dm_requests   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dm_blocks     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dm_read_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.dm_requests   FROM anon, authenticated;
REVOKE ALL ON public.dm_blocks     FROM anon, authenticated;
REVOKE ALL ON public.dm_read_state FROM anon, authenticated;
