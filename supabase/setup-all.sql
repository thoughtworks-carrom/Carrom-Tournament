-- Carrom Tournament — FULL SETUP (schema + seed functions + tournament data)
-- Run this ONE file in Supabase SQL Editor, or: psql "$SUPABASE_DB_URL" -f supabase/setup-all.sql
--
-- After this: create Auth user + run admin-setup.sql
-- See GO_LIVE.md for the complete checklist.

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

CREATE TABLE IF NOT EXISTS finals_settings (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  youtube_url text,
  live_match_id text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO finals_settings (id, youtube_url, live_match_id)
VALUES (1, NULL, NULL)
ON CONFLICT (id) DO NOTHING;

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
ALTER TABLE finals_settings ENABLE ROW LEVEL SECURITY;

-- Public read
CREATE POLICY "public_read_categories" ON categories FOR SELECT USING (true);
CREATE POLICY "public_read_players" ON players FOR SELECT USING (true);
CREATE POLICY "public_read_groups" ON groups FOR SELECT USING (true);
CREATE POLICY "public_read_group_players" ON group_players FOR SELECT USING (true);
CREATE POLICY "public_read_teams" ON teams FOR SELECT USING (true);
CREATE POLICY "public_read_group_teams" ON group_teams FOR SELECT USING (true);
CREATE POLICY "public_read_matches" ON matches FOR SELECT USING (true);
CREATE POLICY "public_read_gallery" ON gallery_images FOR SELECT USING (true);
CREATE POLICY "public_read_finals_settings" ON finals_settings FOR SELECT USING (true);

-- Admin write
CREATE POLICY "admin_write_categories" ON categories FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "admin_write_players" ON players FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "admin_write_groups" ON groups FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "admin_write_group_players" ON group_players FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "admin_write_teams" ON teams FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "admin_write_group_teams" ON group_teams FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "admin_write_matches" ON matches FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "admin_write_gallery" ON gallery_images FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "admin_insert_finals_settings" ON finals_settings FOR INSERT WITH CHECK (is_admin());
CREATE POLICY "admin_update_finals_settings" ON finals_settings FOR UPDATE USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "admin_delete_finals_settings" ON finals_settings FOR DELETE USING (is_admin());

-- Admins table: only admins can read (to verify membership)
CREATE POLICY "admin_read_admins" ON admins FOR SELECT USING (is_admin());

-- ---------------------------------------------------------------------------
-- Storage bucket for gallery
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('gallery', 'gallery', true)
ON CONFLICT (id) DO UPDATE SET public = true;

CREATE POLICY "gallery_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'gallery');

CREATE POLICY "gallery_admin_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'gallery' AND is_admin());

CREATE POLICY "gallery_admin_delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'gallery' AND is_admin());

CREATE POLICY "gallery_admin_update"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'gallery' AND is_admin());
-- Seed helpers — run AFTER schema.sql
-- Provides the same behaviour as POST /admin/seed-tournament-data on FastAPI

CREATE OR REPLACE FUNCTION public.clear_tournament_data()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM matches;
  DELETE FROM group_players;
  DELETE FROM group_teams;
  DELETE FROM groups;
  DELETE FROM teams;
  DELETE FROM players;
  DELETE FROM categories;
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_tournament_seed()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO categories (name, gender, format) VALUES
    ('Men''s Singles', 'MALE', 'SINGLES'),
    ('Women''s Singles', 'FEMALE', 'SINGLES'),
    ('Men''s Doubles', 'MALE', 'DOUBLES'),
    ('Mixed Doubles', 'MIXED', 'DOUBLES')
  ON CONFLICT (gender, format) DO NOTHING;

  INSERT INTO players (name, employee_id, gender) VALUES
    ('Raju Reddy', '19024', 'MALE'),
    ('Medida Teja', '24425', 'MALE'),
    ('Chakravarthi', '25926', 'MALE'),
    ('Surya Borusu', '28548', 'MALE'),
    ('Pavan Posannapeta', '29143', 'MALE'),
    ('Pavan Andhukuri', '30916', 'MALE'),
    ('Srikanth Nelluri', '31133', 'MALE'),
    ('K Raghavendra', '31649', 'MALE'),
    ('Sree Lekha', '33566', 'FEMALE'),
    ('Bharath Balla', '35810', 'MALE'),
    ('Vivek Alladi', '38312', 'MALE'),
    ('Amrutha M', '38302', 'FEMALE'),
    ('Anusha Palle', '39130', 'FEMALE'),
    ('Mani Kumar Reddy Kancharla', '39592', 'MALE'),
    ('Lakshmi Prasanna', '40885', 'FEMALE'),
    ('SVS Maruthi', '41018', 'MALE'),
    ('Akhil Charugondla', '41213', 'MALE'),
    ('Yamuna Kadava', '41443', 'FEMALE'),
    ('Gopichand G', '42190', 'MALE'),
    ('Eshwar Baddam', '42193', 'MALE'),
    ('Jaya Simha Reddy Nandyala', '42390', 'MALE'),
    ('Sai Srinivas Marem', '42543', 'MALE'),
    ('Prateek Gupta', '42558', 'MALE'),
    ('Sudhir Batham', '42728', 'MALE'),
    ('Pulkit Kumar', '42746', 'MALE'),
    ('Maheshkumar Boga', '42906', 'MALE'),
    ('Hemanth Sri Sai Boodi', '43290', 'MALE'),
    ('Narendra Simha Mekala', '43310', 'MALE'),
    ('Sasidhar Challa', '43702', 'MALE'),
    ('Krishna Teja', '43858', 'MALE'),
    ('Divakar Rayapudi', '43871', 'MALE'),
    ('Sita Sowmya Paluri', '43876', 'FEMALE'),
    ('Janardhan P', '43883', 'MALE'),
    ('Rohan Mogadampally', '44026', 'MALE'),
    ('Sagar Babu', '44220', 'MALE'),
    ('Ashay Kumar', '44290', 'MALE'),
    ('Huzaifa', '44320', 'MALE'),
    ('Naveen Gudla', '44480', 'MALE'),
    ('Rasmith Patnaik Arasada', '44501', 'MALE'),
    ('Gadikoya Chandra Reddy', '44526', 'MALE'),
    ('Mohd Aquib Shakeel', '44528', 'MALE'),
    ('Chandrasekhar Raju', '44854', 'MALE'),
    ('Sai Akhil Allam', '44963', 'MALE'),
    ('Bolem Poorna Rama Satya Chandu', '45062', 'MALE'),
    ('Sharan Reddi', '45142', 'MALE'),
    ('Lochan Sindunoori', '45246', 'MALE'),
    ('Ravi Kiran Yasa', '45274', 'MALE'),
    ('Praneeth Andukuri', '45389', 'MALE'),
    ('Rohini Priyamvada K', '45390', 'FEMALE'),
    ('Batta Malleswari', '45400', 'FEMALE'),
    ('Prashanth Charla', '45845', 'MALE'),
    ('Bhargav Potnuri', '45988', 'MALE'),
    ('Varun Manireddy', '46235', 'MALE'),
    ('Shiva Chaudhari', '46774', 'MALE'),
    ('Vishnu M', '46805', 'MALE'),
    ('Sai Mohan Reddy', '46882', 'MALE'),
    ('Supriya Karindi', '47492', 'FEMALE'),
    ('Suresh Kolla', '48370', 'MALE'),
    ('Dinesh Jampani', '48384', 'MALE'),
    ('Swetha SS', '48474', 'FEMALE'),
    ('Nagendra Babu Marasu', '42490', 'MALE'),
    ('Garlapati Praveen', '44606', 'MALE');

  INSERT INTO groups (category_id, name)
  SELECT c.id, g.name
  FROM categories c
  CROSS JOIN (VALUES
    ('Group A'), ('Group B'), ('Group C'), ('Group D'),
    ('Group E'), ('Group F'), ('Group G'), ('Group H')
  ) AS g(name)
  WHERE c.name = 'Men''s Singles'
  ON CONFLICT (category_id, name) DO NOTHING;

  INSERT INTO groups (category_id, name)
  SELECT c.id, g.name
  FROM categories c
  CROSS JOIN (VALUES ('Group W-A'), ('Group W-B')) AS g(name)
  WHERE c.name = 'Women''s Singles'
  ON CONFLICT (category_id, name) DO NOTHING;

  INSERT INTO group_players (group_id, player_id, group_position)
  SELECT g.id, p.id, x.pos
  FROM (VALUES
    ('Group A', '29143', 1), ('Group A', '42728', 2), ('Group A', '35810', 3),
    ('Group A', '46235', 4), ('Group A', '43883', 5), ('Group A', '43871', 6), ('Group A', '43290', 7),
    ('Group B', '46882', 1), ('Group B', '19024', 2), ('Group B', '31649', 3),
    ('Group B', '48384', 4), ('Group B', '42193', 5), ('Group B', '45062', 6), ('Group B', '45274', 7),
    ('Group C', '44480', 1), ('Group C', '24425', 2), ('Group C', '45845', 3),
    ('Group C', '43702', 4), ('Group C', '44526', 5), ('Group C', '44320', 6), ('Group C', '42490', 7),
    ('Group D', '44963', 1), ('Group D', '28548', 2), ('Group D', '44290', 3),
    ('Group D', '42190', 4), ('Group D', '42558', 5), ('Group D', '39592', 6), ('Group D', '44854', 7),
    ('Group E', '45988', 1), ('Group E', '43310', 2),
    ('Group E', '45389', 3), ('Group E', '48370', 4), ('Group E', '45142', 5), ('Group E', '42390', 6),
    ('Group F', '44606', 1), ('Group F', '44501', 2), ('Group F', '42746', 3),
    ('Group F', '45246', 4), ('Group F', '41018', 5), ('Group F', '42543', 6),
    ('Group G', '44026', 1), ('Group G', '25926', 2), ('Group G', '31133', 3),
    ('Group G', '41213', 4), ('Group G', '44528', 5), ('Group G', '44220', 6),
    ('Group H', '42906', 1), ('Group H', '30916', 2), ('Group H', '46805', 3),
    ('Group H', '43858', 4), ('Group H', '38312', 5), ('Group H', '46774', 6)
  ) AS x(group_name, emp_id, pos)
  JOIN groups g ON g.name = x.group_name
  JOIN categories c ON c.id = g.category_id AND c.name = 'Men''s Singles'
  JOIN players p ON p.employee_id = x.emp_id
  ON CONFLICT (group_id, player_id) DO NOTHING;

  INSERT INTO group_players (group_id, player_id, group_position)
  SELECT g.id, p.id, x.pos
  FROM (VALUES
    ('Group W-A', '33566', 1), ('Group W-A', '38302', 2), ('Group W-A', '39130', 3),
    ('Group W-A', '47492', 4), ('Group W-A', '48474', 5),
    ('Group W-B', '40885', 1), ('Group W-B', '41443', 2), ('Group W-B', '43876', 3),
    ('Group W-B', '45390', 4), ('Group W-B', '45400', 5)
  ) AS x(group_name, emp_id, pos)
  JOIN groups g ON g.name = x.group_name
  JOIN categories c ON c.id = g.category_id AND c.name = 'Women''s Singles'
  JOIN players p ON p.employee_id = x.emp_id
  ON CONFLICT (group_id, player_id) DO NOTHING;
END;
$$;

-- Same as POST /admin/seed-tournament-data?force=true|false (admin JWT required)
CREATE OR REPLACE FUNCTION public.seed_tournament_data(force_reseed boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result_counts jsonb;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  IF EXISTS (SELECT 1 FROM categories LIMIT 1) THEN
    IF NOT force_reseed THEN
      RAISE EXCEPTION 'Database already has data. Pass force_reseed=true to clear and reseed.';
    END IF;
    PERFORM clear_tournament_data();
  END IF;

  PERFORM apply_tournament_seed();

  SELECT jsonb_build_object(
    'categories', (SELECT count(*)::int FROM categories),
    'groups', (SELECT count(*)::int FROM groups),
    'players', (SELECT count(*)::int FROM players),
    'teams', (SELECT count(*)::int FROM teams),
    'group_players', (SELECT count(*)::int FROM group_players),
    'group_teams', (SELECT count(*)::int FROM group_teams),
    'matches', (SELECT count(*)::int FROM matches)
  ) INTO result_counts;

  RETURN jsonb_build_object(
    'message', 'Tournament data loaded successfully.',
    'counts', result_counts
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_tournament_seed() TO postgres, service_role;
GRANT EXECUTE ON FUNCTION public.seed_tournament_data(boolean) TO authenticated;
-- Tournament seed data — run AFTER schema.sql + seed-functions.sql
-- Equivalent to POST /admin/seed-tournament-data on an empty FastAPI database.

SELECT apply_tournament_seed();

-- Register your admin email (create matching user in Supabase Auth → Users)
-- INSERT INTO admins (email, name) VALUES ('you@thoughtworks.com', 'Tournament Admin');
