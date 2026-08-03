-- =============================================================================
-- 019: Delivery Agent System — agents, assignments, scan events
-- =============================================================================

-- ── Delivery Agents ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS delivery_agents (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL DEFAULT '',
  phone       TEXT DEFAULT '',
  vehicle     TEXT DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available','busy','offline')),
  current_area TEXT DEFAULT '',
  avatar      TEXT DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

CREATE INDEX idx_delivery_agents_user  ON delivery_agents(user_id);
CREATE INDEX idx_delivery_agents_status ON delivery_agents(status);

-- ── Delivery Assignments ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS delivery_assignments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      UUID NOT NULL REFERENCES store_orders(id) ON DELETE CASCADE,
  agent_id      UUID NOT NULL REFERENCES delivery_agents(id) ON DELETE CASCADE,
  status        TEXT NOT NULL DEFAULT 'assigned'
                CHECK (status IN ('assigned','picked_up','in_transit','delivered','failed','returned')),
  assigned_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  picked_up_at  TIMESTAMPTZ,
  in_transit_at TIMESTAMPTZ,
  delivered_at  TIMESTAMPTZ,
  failed_at     TIMESTAMPTZ,
  returned_at   TIMESTAMPTZ,
  notes         TEXT DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_delivery_assignments_order  ON delivery_assignments(order_id);
CREATE INDEX idx_delivery_assignments_agent  ON delivery_assignments(agent_id);
CREATE INDEX idx_delivery_assignments_status ON delivery_assignments(status);

-- ── Delivery Scan Events ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS delivery_scan_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id   UUID NOT NULL REFERENCES delivery_assignments(id) ON DELETE CASCADE,
  agent_id        UUID NOT NULL REFERENCES delivery_agents(id) ON DELETE CASCADE,
  scan_type       TEXT NOT NULL CHECK (scan_type IN ('pickup','transit','delivery','attempt','return')),
  barcode_scanned TEXT DEFAULT '',
  location_lat    DOUBLE PRECISION,
  location_lng    DOUBLE PRECISION,
  note            TEXT DEFAULT '',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_delivery_scans_assignment ON delivery_scan_events(assignment_id);
CREATE INDEX idx_delivery_scans_agent      ON delivery_scan_events(agent_id);

-- ── RLS: delivery_agents ──────────────────────────────────────────────────────
ALTER TABLE delivery_agents ENABLE ROW LEVEL SECURITY;

CREATE POLICY delivery_agents_read ON delivery_agents
  FOR SELECT TO authenticated USING (true);

CREATE POLICY delivery_agents_admin ON delivery_agents
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin','moderator')
  ));

-- ── RLS: delivery_assignments ─────────────────────────────────────────────────
ALTER TABLE delivery_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY delivery_assignments_agent ON delivery_assignments
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM delivery_agents
    WHERE id = delivery_assignments.agent_id AND user_id = auth.uid()
  ));

CREATE POLICY delivery_assignments_agent_update ON delivery_assignments
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM delivery_agents
    WHERE id = delivery_assignments.agent_id AND user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM delivery_agents
    WHERE id = delivery_assignments.agent_id AND user_id = auth.uid()
  ));

CREATE POLICY delivery_assignments_admin ON delivery_assignments
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin','moderator')
  ));

-- ── RLS: delivery_scan_events ─────────────────────────────────────────────────
ALTER TABLE delivery_scan_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY delivery_scans_agent ON delivery_scan_events
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM delivery_agents
    WHERE id = delivery_scan_events.agent_id AND user_id = auth.uid()
  ));

CREATE POLICY delivery_scans_insert_agent ON delivery_scan_events
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM delivery_agents
    WHERE id = agent_id AND user_id = auth.uid()
  ));

CREATE POLICY delivery_scans_admin ON delivery_scan_events
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin','moderator')
  ));

-- ── Extend store_orders with delivery fields ───────────────────────────────────
ALTER TABLE store_orders
  ADD COLUMN IF NOT EXISTS delivery_agent_id   UUID REFERENCES delivery_agents(id),
  ADD COLUMN IF NOT EXISTS delivery_status     TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS estimated_delivery  TIMESTAMPTZ;

-- ── Seed: create delivery_agents for existing admin/staff users ────────────────
INSERT INTO delivery_agents (user_id, display_name, status)
SELECT id, COALESCE(username, 'Agent'), 'available'
FROM users
WHERE role IN ('admin','moderator')
  AND NOT EXISTS (SELECT 1 FROM delivery_agents WHERE delivery_agents.user_id = users.id);
