-- 014_rp_forum_categories.sql
-- Seed AIFAZI RP forum categories for the roleplay community.
-- Idempotent: safe to run repeatedly.

INSERT INTO public.forum_categories
  (slug, name, description, icon, color, display_order, locked, thread_count)
VALUES
  ('announcements',  'Announcements',  'Official server news, updates and events from the AIFAZI RP staff team.', '📢', '#00ff88', 1, FALSE, 0),
  ('general-discussion', 'General Discussion', 'Chat about anything FiveM, roleplay stories, or the community in general.', '💬', '#00d4ff', 2, FALSE, 0),
  ('whitelist-help', 'Whitelist & Support', 'Get help with your whitelist application, connecting, or in-game issues.', '🛟', '#ffd700', 3, FALSE, 0),
  ('roleplay-guides', 'Roleplay Guides', 'Character creation guides, RP tips, scripts, and rules explanations.', '📖', '#a78bfa', 4, FALSE, 0),
  ('guilds-factions', 'Guilds & Factions', 'Recruit for your gang, faction, or criminal organization. IC and OOC allowed.', '⚔️', '#ff6b6b', 5, FALSE, 0),
  ('vehicle-showcase', 'Vehicle Showcase', 'Show off your in-game builds, garages, and custom vehicles.', '🏎️', '#ff9f43', 6, FALSE, 0),
  ('suggestions',    'Suggestions',    'Suggest new features, scripts, jobs, or server improvements.', '💡', '#00ff88', 7, FALSE, 0),
  ('support-tickets', 'Support Tickets', 'Report a player, staff issue, or bug. Posts here are private to staff.', '🎫', '#ff4757', 8, TRUE, 0)
ON CONFLICT (slug) DO NOTHING;

-- Ensure the display_order column exists (migration safety) and repoint the
-- "Support Tickets" category to be visible only to staff roles.
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.columns
             WHERE table_name = 'forum_categories' AND column_name = 'view_roles') THEN
    UPDATE public.forum_categories
      SET view_roles = '{}', reply_roles = '{}', post_roles = '{}'
      WHERE slug IN ('announcements','general-discussion','whitelist-help',
                     'roleplay-guides','guilds-factions','vehicle-showcase','suggestions');
  END IF;
END $$;
