-- YouTube live URL for finals (admin-set, visible to all viewers).
-- Photos stay in the repo; only the stream URL is stored here.

CREATE TABLE IF NOT EXISTS finals_settings (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  youtube_url text,
  live_match_id text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO finals_settings (id, youtube_url, live_match_id)
VALUES (1, NULL, NULL)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE finals_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_finals_settings" ON finals_settings;
CREATE POLICY "public_read_finals_settings"
  ON finals_settings FOR SELECT USING (true);

DROP POLICY IF EXISTS "admin_write_finals_settings" ON finals_settings;
DROP POLICY IF EXISTS "admin_update_finals_settings" ON finals_settings;
DROP POLICY IF EXISTS "admin_delete_finals_settings" ON finals_settings;
CREATE POLICY "admin_insert_finals_settings"
  ON finals_settings FOR INSERT WITH CHECK (is_admin());
CREATE POLICY "admin_update_finals_settings"
  ON finals_settings FOR UPDATE USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "admin_delete_finals_settings"
  ON finals_settings FOR DELETE USING (is_admin());

ALTER PUBLICATION supabase_realtime ADD TABLE finals_settings;