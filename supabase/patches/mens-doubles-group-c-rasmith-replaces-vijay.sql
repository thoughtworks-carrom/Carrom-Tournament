-- Men's Doubles Group C: replace Vijay Palaki with Rasmith Patnaik Arasada
-- on Vallabhi Murali's team (partner unchanged).
-- Updates team record in place so existing matches keep the same team_id.
-- Safe to re-run: no-op if swap already applied.
-- Run in Supabase SQL Editor.

-- Preview current team
SELECT gt.group_position,
       t.team_name,
       p1.name AS player1,
       p2.name AS player2,
       g.name AS group_name
FROM group_teams gt
JOIN groups g ON g.id = gt.group_id
JOIN categories c ON c.id = g.category_id
JOIN teams t ON t.id = gt.team_id
JOIN players p1 ON p1.id = t.player1_id
JOIN players p2 ON p2.id = t.player2_id
WHERE c.name = 'Men''s Doubles'
  AND g.name = 'Group C'
  AND (
    lower(p1.name) LIKE '%vallabhi%'
    OR lower(p2.name) LIKE '%vallabhi%'
  );

DO $$
DECLARE
  v_group_id uuid;
  v_team_id uuid;
  v_vallabhi_id uuid;
  v_vijay_id uuid;
  v_rasmith_id uuid;
  v_new_p1_id uuid;
  v_new_p2_id uuid;
  v_team_name text;
BEGIN
  SELECT id INTO v_rasmith_id
  FROM players
  WHERE employee_id = '44501'
  LIMIT 1;

  IF v_rasmith_id IS NULL THEN
    SELECT id INTO v_rasmith_id
    FROM players
    WHERE lower(trim(name)) LIKE '%rasmith%patnaik%'
    LIMIT 1;
  END IF;

  SELECT id INTO v_vijay_id
  FROM players
  WHERE employee_id = '19073'
  LIMIT 1;

  IF v_vijay_id IS NULL THEN
    SELECT id INTO v_vijay_id
    FROM players
    WHERE lower(trim(name)) LIKE '%vijay%palaki%'
    LIMIT 1;
  END IF;

  SELECT id INTO v_vallabhi_id
  FROM players
  WHERE lower(trim(name)) LIKE '%vallabhi%murali%'
  LIMIT 1;

  IF v_vallabhi_id IS NULL THEN
    SELECT id INTO v_vallabhi_id
    FROM players
    WHERE employee_id = 'MD002'
    LIMIT 1;
  END IF;

  IF v_rasmith_id IS NULL THEN
    RAISE EXCEPTION 'Player not found: Rasmith Patnaik Arasada (44501)';
  END IF;

  IF v_vallabhi_id IS NULL THEN
    RAISE EXCEPTION 'Player not found: Vallabhi Murali';
  END IF;

  SELECT g.id INTO v_group_id
  FROM groups g
  JOIN categories c ON c.id = g.category_id
  WHERE c.name = 'Men''s Doubles'
    AND g.name = 'Group C'
  LIMIT 1;

  IF v_group_id IS NULL THEN
    RAISE EXCEPTION 'Men''s Doubles Group C not found';
  END IF;

  -- Team with Vallabhi + Vijay (before swap)
  IF v_vijay_id IS NOT NULL THEN
    SELECT t.id INTO v_team_id
    FROM teams t
    JOIN group_teams gt ON gt.team_id = t.id AND gt.group_id = v_group_id
    WHERE (
      (t.player1_id = v_vallabhi_id AND t.player2_id = v_vijay_id)
      OR (t.player1_id = v_vijay_id AND t.player2_id = v_vallabhi_id)
    )
    LIMIT 1;
  END IF;

  -- Already swapped: Vallabhi + Rasmith
  IF v_team_id IS NULL THEN
    SELECT t.id INTO v_team_id
    FROM teams t
    JOIN group_teams gt ON gt.team_id = t.id AND gt.group_id = v_group_id
    WHERE (
      (t.player1_id = v_vallabhi_id AND t.player2_id = v_rasmith_id)
      OR (t.player1_id = v_rasmith_id AND t.player2_id = v_vallabhi_id)
    )
    LIMIT 1;

    IF v_team_id IS NOT NULL THEN
      RAISE NOTICE 'Already updated: Vallabhi Murali / Rasmith Patnaik Arasada in Group C';
      RETURN;
    END IF;

    RAISE EXCEPTION 'Team Vallabhi Murali / Vijay Palaki not found in Group C';
  END IF;

  SELECT
    CASE WHEN t.player1_id = v_vijay_id THEN v_rasmith_id ELSE t.player1_id END,
    CASE WHEN t.player2_id = v_vijay_id THEN v_rasmith_id ELSE t.player2_id END
  INTO v_new_p1_id, v_new_p2_id
  FROM teams t
  WHERE t.id = v_team_id;

  SELECT p1.name || ' / ' || p2.name
  INTO v_team_name
  FROM players p1, players p2
  WHERE p1.id = v_new_p1_id AND p2.id = v_new_p2_id;

  UPDATE teams
  SET player1_id = v_new_p1_id,
      player2_id = v_new_p2_id,
      team_name = v_team_name,
      updated_at = now()
  WHERE id = v_team_id;

  RAISE NOTICE 'Updated Group C team to: %', v_team_name;
END;
$$;

-- Verify
SELECT gt.group_position,
       t.team_name,
       p1.name AS player1,
       p2.name AS player2
FROM group_teams gt
JOIN groups g ON g.id = gt.group_id
JOIN categories c ON c.id = g.category_id
JOIN teams t ON t.id = gt.team_id
JOIN players p1 ON p1.id = t.player1_id
JOIN players p2 ON p2.id = t.player2_id
WHERE c.name = 'Men''s Doubles'
  AND g.name = 'Group C'
  AND (
    lower(p1.name) LIKE '%vallabhi%'
    OR lower(p2.name) LIKE '%vallabhi%'
  );
