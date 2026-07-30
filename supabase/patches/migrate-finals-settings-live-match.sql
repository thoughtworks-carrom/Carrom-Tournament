-- Migrate older finals_settings schemas to live_match_id (safe to re-run).

ALTER TABLE finals_settings
  ADD COLUMN IF NOT EXISTS live_match_id text;

ALTER TABLE finals_settings
  ADD COLUMN IF NOT EXISTS youtube_url text;

-- Drop legacy is_live flag if present (Go Live now uses live_match_id).
ALTER TABLE finals_settings DROP COLUMN IF EXISTS is_live;

INSERT INTO finals_settings (id, youtube_url, live_match_id)
VALUES (1, NULL, NULL)
ON CONFLICT (id) DO NOTHING;
