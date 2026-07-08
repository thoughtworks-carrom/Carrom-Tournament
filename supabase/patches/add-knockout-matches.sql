-- Knockout fixtures + live results (syncs across all devices).
-- Run once in Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS knockout_matches (
  id text PRIMARY KEY,
  category_name text NOT NULL,
  status match_status NOT NULL DEFAULT 'SCHEDULED',
  boards_a integer NOT NULL DEFAULT 0 CHECK (boards_a >= 0),
  boards_b integer NOT NULL DEFAULT 0 CHECK (boards_b >= 0),
  points_a integer NOT NULL DEFAULT 0 CHECK (points_a >= 0),
  points_b integer NOT NULL DEFAULT 0 CHECK (points_b >= 0),
  winner_side text CHECK (winner_side IN ('A', 'B')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_knockout_matches_category ON knockout_matches(category_name);
CREATE INDEX IF NOT EXISTS idx_knockout_matches_status ON knockout_matches(status);

ALTER TABLE knockout_matches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_knockout_matches" ON knockout_matches;
CREATE POLICY "public_read_knockout_matches"
  ON knockout_matches FOR SELECT USING (true);

DROP POLICY IF EXISTS "admin_write_knockout_matches" ON knockout_matches;
CREATE POLICY "admin_write_knockout_matches"
  ON knockout_matches FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- Realtime sync for live scoreboards on multiple devices
ALTER TABLE knockout_matches REPLICA IDENTITY FULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'knockout_matches'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE knockout_matches;
  END IF;
END $$;

-- Seed all knockout fixtures (idempotent)
INSERT INTO knockout_matches (id, category_name) VALUES
  -- Men's Singles
  ('ms-r1-GroupA-GroupB-1', 'Men''s Singles'),
  ('ms-r1-GroupC-GroupD-1', 'Men''s Singles'),
  ('ms-r1-GroupA-GroupB-2', 'Men''s Singles'),
  ('ms-r1-GroupC-GroupD-2', 'Men''s Singles'),
  ('ms-r1-GroupE-GroupF-1', 'Men''s Singles'),
  ('ms-r1-GroupG-GroupH-1', 'Men''s Singles'),
  ('ms-r1-GroupE-GroupF-2', 'Men''s Singles'),
  ('ms-r1-GroupG-GroupH-2', 'Men''s Singles'),
  ('ms-r2-ab-cd-1', 'Men''s Singles'),
  ('ms-r2-ab-cd-2', 'Men''s Singles'),
  ('ms-r2-ef-gh-1', 'Men''s Singles'),
  ('ms-r2-ef-gh-2', 'Men''s Singles'),
  ('ms-sf-1', 'Men''s Singles'),
  ('ms-sf-2', 'Men''s Singles'),
  ('ms-final', 'Men''s Singles'),
  -- Men's Doubles
  ('md-r1-GroupA-GroupB-1', 'Men''s Doubles'),
  ('md-r1-GroupC-GroupD-1', 'Men''s Doubles'),
  ('md-r1-GroupA-GroupB-2', 'Men''s Doubles'),
  ('md-r1-GroupC-GroupD-2', 'Men''s Doubles'),
  ('md-r2-ab-cd-1', 'Men''s Doubles'),
  ('md-r2-ab-cd-2', 'Men''s Doubles'),
  ('md-final', 'Men''s Doubles'),
  -- Women's Singles
  ('ws-q1', 'Women''s Singles'),
  ('ws-elim', 'Women''s Singles'),
  ('ws-q2', 'Women''s Singles'),
  ('ws-final', 'Women''s Singles')
ON CONFLICT (id) DO NOTHING;

-- Realtime for group-stage matches (standings sync across devices)
ALTER TABLE matches REPLICA IDENTITY FULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'matches'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE matches;
  END IF;
END $$;
