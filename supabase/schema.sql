-- Carrom Tournament — Supabase schema
-- Run in Supabase SQL Editor (Dashboard → SQL → New query)

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE gender AS ENUM ('MALE', 'FEMALE', 'MIXED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE category_format AS ENUM ('SINGLES', 'DOUBLES');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE participant_type AS ENUM ('PLAYER', 'TEAM');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE match_status AS ENUM ('SCHEDULED', 'LIVE', 'COMPLETED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  gender gender NOT NULL,
  format category_format NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (gender, format)
);

CREATE TABLE IF NOT EXISTS players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  employee_id text,
  gender gender NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (category_id, name)
);

CREATE TABLE IF NOT EXISTS group_players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES players(id),
  group_position integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (group_id, player_id)
);

CREATE TABLE IF NOT EXISTS teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_name text NOT NULL,
  player1_id uuid NOT NULL REFERENCES players(id),
  player2_id uuid NOT NULL REFERENCES players(id),
  category_id uuid NOT NULL REFERENCES categories(id),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS group_teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES teams(id),
  group_position integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (group_id, team_id)
);

CREATE TABLE IF NOT EXISTS matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES categories(id),
  group_id uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  participant1_id uuid NOT NULL,
  participant2_id uuid NOT NULL,
  participant_type participant_type NOT NULL,
  status match_status NOT NULL DEFAULT 'SCHEDULED',
  winner_participant_id uuid,
  winner_score integer,
  loser_score integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (participant1_id < participant2_id)
);

CREATE TABLE IF NOT EXISTS gallery_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  filename text NOT NULL,
  content_type text NOT NULL,
  storage_path text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_groups_category ON groups(category_id);
CREATE INDEX IF NOT EXISTS idx_matches_group ON matches(group_id);
CREATE INDEX IF NOT EXISTS idx_matches_status ON matches(status);
CREATE INDEX IF NOT EXISTS idx_group_players_group ON group_players(group_id);
CREATE INDEX IF NOT EXISTS idx_group_teams_group ON group_teams(group_id);

-- ---------------------------------------------------------------------------
-- Admin helper (RLS)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM admins
    WHERE lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

-- Callable before RLS grants admin read — used by frontend after sign-in
CREATE OR REPLACE FUNCTION public.check_admin_email(check_email text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM admins
    WHERE lower(email) = lower(check_email)
  );
$$;

GRANT EXECUTE ON FUNCTION public.check_admin_email(text) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Fixture generation
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.matches_per_pair_for_category(cat_id uuid)
RETURNS integer
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_fixtures_for_participant(
  p_group_id uuid,
  p_participant_id uuid,
  p_participant_type participant_type
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_category_id uuid;
  v_matches_per_pair integer;
  v_other_id uuid;
  v_pair_count integer;
  v_p1 uuid;
  v_p2 uuid;
BEGIN
  SELECT category_id INTO v_category_id FROM groups WHERE id = p_group_id;
  IF v_category_id IS NULL THEN
    RETURN;
  END IF;

  v_matches_per_pair := matches_per_pair_for_category(v_category_id);

  IF p_participant_type = 'PLAYER' THEN
    FOR v_other_id IN
      SELECT gp.player_id
      FROM group_players gp
      WHERE gp.group_id = p_group_id AND gp.player_id <> p_participant_id
    LOOP
      IF p_participant_id < v_other_id THEN
        v_p1 := p_participant_id;
        v_p2 := v_other_id;
      ELSE
        v_p1 := v_other_id;
        v_p2 := p_participant_id;
      END IF;

      SELECT count(*)::integer INTO v_pair_count
      FROM matches m
      WHERE m.group_id = p_group_id
        AND m.participant1_id = v_p1
        AND m.participant2_id = v_p2;

      WHILE v_pair_count < v_matches_per_pair LOOP
        INSERT INTO matches (
          category_id, group_id, participant1_id, participant2_id,
          participant_type, status
        ) VALUES (
          v_category_id, p_group_id, v_p1, v_p2, 'PLAYER', 'SCHEDULED'
        );
        v_pair_count := v_pair_count + 1;
      END LOOP;
    END LOOP;
  ELSE
    FOR v_other_id IN
      SELECT gt.team_id
      FROM group_teams gt
      WHERE gt.group_id = p_group_id AND gt.team_id <> p_participant_id
    LOOP
      IF p_participant_id < v_other_id THEN
        v_p1 := p_participant_id;
        v_p2 := v_other_id;
      ELSE
        v_p1 := v_other_id;
        v_p2 := p_participant_id;
      END IF;

      SELECT count(*)::integer INTO v_pair_count
      FROM matches m
      WHERE m.group_id = p_group_id
        AND m.participant1_id = v_p1
        AND m.participant2_id = v_p2;

      WHILE v_pair_count < v_matches_per_pair LOOP
        INSERT INTO matches (
          category_id, group_id, participant1_id, participant2_id,
          participant_type, status
        ) VALUES (
          v_category_id, p_group_id, v_p1, v_p2, 'TEAM', 'SCHEDULED'
        );
        v_pair_count := v_pair_count + 1;
      END LOOP;
    END LOOP;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_group_player_fixtures()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM generate_fixtures_for_participant(NEW.group_id, NEW.player_id, 'PLAYER');
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_group_team_fixtures()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM generate_fixtures_for_participant(NEW.group_id, NEW.team_id, 'TEAM');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS group_player_fixtures ON group_players;
CREATE TRIGGER group_player_fixtures
  AFTER INSERT ON group_players
  FOR EACH ROW
  EXECUTE FUNCTION trg_group_player_fixtures();

DROP TRIGGER IF EXISTS group_team_fixtures ON group_teams;
CREATE TRIGGER group_team_fixtures
  AFTER INSERT ON group_teams
  FOR EACH ROW
  EXECUTE FUNCTION trg_group_team_fixtures();

-- ---------------------------------------------------------------------------
-- Group player validation
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_group_player_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_category categories%ROWTYPE;
  v_player players%ROWTYPE;
  v_other_group uuid;
BEGIN
  SELECT c.* INTO v_category
  FROM categories c
  JOIN groups g ON g.category_id = c.id
  WHERE g.id = NEW.group_id;

  IF v_category.format <> 'SINGLES' THEN
    RAISE EXCEPTION 'Players can only be assigned to singles category groups';
  END IF;

  IF v_category.gender NOT IN ('MALE', 'FEMALE') THEN
    RAISE EXCEPTION 'Invalid category for singles player assignment';
  END IF;

  SELECT * INTO v_player FROM players WHERE id = NEW.player_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Player not found';
  END IF;

  IF NOT v_player.is_active THEN
    RAISE EXCEPTION 'Player is not active';
  END IF;

  IF v_player.gender::text <> v_category.gender::text THEN
    RAISE EXCEPTION 'Player gender does not match category';
  END IF;

  SELECT gp.group_id INTO v_other_group
  FROM group_players gp
  JOIN groups g ON g.id = gp.group_id
  WHERE gp.player_id = NEW.player_id
    AND g.category_id = v_category.id
    AND gp.group_id <> NEW.group_id
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'Player already assigned to a group in this category';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_group_player ON group_players;
CREATE TRIGGER validate_group_player
  BEFORE INSERT ON group_players
  FOR EACH ROW
  EXECUTE FUNCTION validate_group_player_insert();

-- ---------------------------------------------------------------------------
-- Match update validation
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_match_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_new_status match_status;
BEGIN
  IF NEW.status = 'SCHEDULED'
     AND NEW.winner_participant_id IS NULL
     AND NEW.winner_score IS NULL
     AND NEW.loser_score IS NULL THEN
    NEW.updated_at := now();
    RETURN NEW;
  END IF;

  v_new_status := COALESCE(NEW.status, OLD.status);

  IF (NEW.winner_participant_id IS DISTINCT FROM OLD.winner_participant_id
      OR NEW.winner_score IS DISTINCT FROM OLD.winner_score)
     AND v_new_status <> 'COMPLETED' THEN
    RAISE EXCEPTION 'Winner information can only be set when status is COMPLETED';
  END IF;

  IF NEW.loser_score IS DISTINCT FROM OLD.loser_score
     AND v_new_status <> 'COMPLETED' THEN
    RAISE EXCEPTION 'loser_score can only be set when status is COMPLETED';
  END IF;

  IF v_new_status = 'COMPLETED' THEN
    IF NEW.winner_participant_id IS NULL OR NEW.winner_score IS NULL THEN
      RAISE EXCEPTION 'winner_participant_id and winner_score are required for COMPLETED matches';
    END IF;

    IF NEW.winner_participant_id NOT IN (NEW.participant1_id, NEW.participant2_id) THEN
      RAISE EXCEPTION 'winner_participant_id must be one of the match participants';
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_match ON matches;
CREATE TRIGGER validate_match
  BEFORE UPDATE ON matches
  FOR EACH ROW
  EXECUTE FUNCTION validate_match_update();

-- ---------------------------------------------------------------------------
-- Group member removal (match / standings policy)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prepare_participant_removal(
  p_group_id uuid,
  p_participant_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_played integer;
  v_match matches%ROWTYPE;
  v_opponent uuid;
BEGIN
  SELECT count(*)::integer INTO v_played
  FROM matches m
  WHERE m.group_id = p_group_id
    AND m.status = 'COMPLETED'
    AND (m.participant1_id = p_participant_id OR m.participant2_id = p_participant_id);

  IF v_played < 2 OR v_played = 2 THEN
    DELETE FROM matches m
    WHERE m.group_id = p_group_id
      AND (m.participant1_id = p_participant_id OR m.participant2_id = p_participant_id);
    RETURN;
  END IF;

  FOR v_match IN
    SELECT *
    FROM matches m
    WHERE m.group_id = p_group_id
      AND m.status IN ('SCHEDULED', 'LIVE')
      AND (m.participant1_id = p_participant_id OR m.participant2_id = p_participant_id)
  LOOP
    IF v_match.participant1_id = p_participant_id THEN
      v_opponent := v_match.participant2_id;
    ELSE
      v_opponent := v_match.participant1_id;
    END IF;

    UPDATE matches
    SET status = 'COMPLETED',
        winner_participant_id = v_opponent,
        winner_score = 0,
        loser_score = 0,
        updated_at = now()
    WHERE id = v_match.id;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_group_player(
  p_group_id uuid,
  p_assignment_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_player_id uuid;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  SELECT player_id INTO v_player_id
  FROM group_players
  WHERE id = p_assignment_id AND group_id = p_group_id;

  IF v_player_id IS NULL THEN
    RAISE EXCEPTION 'Player assignment not found';
  END IF;

  PERFORM prepare_participant_removal(p_group_id, v_player_id);

  DELETE FROM group_players
  WHERE id = p_assignment_id AND group_id = p_group_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_group_team(
  p_group_id uuid,
  p_assignment_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_team_id uuid;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  SELECT team_id INTO v_team_id
  FROM group_teams
  WHERE id = p_assignment_id AND group_id = p_group_id;

  IF v_team_id IS NULL THEN
    RAISE EXCEPTION 'Team assignment not found';
  END IF;

  PERFORM prepare_participant_removal(p_group_id, v_team_id);

  DELETE FROM group_teams
  WHERE id = p_assignment_id AND group_id = p_group_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.prepare_participant_removal(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_group_player(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_group_team(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.reset_all_match_results()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n integer;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  UPDATE matches
  SET status = 'SCHEDULED',
      winner_participant_id = NULL,
      winner_score = NULL,
      loser_score = NULL,
      updated_at = now()
  WHERE status IN ('COMPLETED', 'LIVE')
     OR winner_participant_id IS NOT NULL
     OR winner_score IS NOT NULL
     OR loser_score IS NOT NULL;

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reset_all_match_results() TO authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
ALTER TABLE admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE gallery_images ENABLE ROW LEVEL SECURITY;

-- Public read
CREATE POLICY "public_read_categories" ON categories FOR SELECT USING (true);
CREATE POLICY "public_read_players" ON players FOR SELECT USING (true);
CREATE POLICY "public_read_groups" ON groups FOR SELECT USING (true);
CREATE POLICY "public_read_group_players" ON group_players FOR SELECT USING (true);
CREATE POLICY "public_read_teams" ON teams FOR SELECT USING (true);
CREATE POLICY "public_read_group_teams" ON group_teams FOR SELECT USING (true);
CREATE POLICY "public_read_matches" ON matches FOR SELECT USING (true);
CREATE POLICY "public_read_gallery" ON gallery_images FOR SELECT USING (true);

-- Admin write
CREATE POLICY "admin_write_categories" ON categories FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "admin_write_players" ON players FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "admin_write_groups" ON groups FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "admin_write_group_players" ON group_players FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "admin_write_teams" ON teams FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "admin_write_group_teams" ON group_teams FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "admin_write_matches" ON matches FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "admin_write_gallery" ON gallery_images FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- Admins table: only admins can read (to verify membership)
CREATE POLICY "admin_read_admins" ON admins FOR SELECT USING (is_admin());

-- ---------------------------------------------------------------------------
-- Storage bucket for gallery
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'gallery',
  'gallery',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[];

DROP POLICY IF EXISTS "gallery_public_read" ON storage.objects;
DROP POLICY IF EXISTS "gallery_admin_insert" ON storage.objects;
DROP POLICY IF EXISTS "gallery_admin_delete" ON storage.objects;
DROP POLICY IF EXISTS "gallery_admin_update" ON storage.objects;

CREATE POLICY "gallery_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'gallery');

CREATE POLICY "gallery_admin_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'gallery' AND is_admin());

CREATE POLICY "gallery_admin_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'gallery' AND is_admin());

CREATE POLICY "gallery_admin_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'gallery' AND is_admin());
