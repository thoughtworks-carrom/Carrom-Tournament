-- Remove team "Jaya Simha Reddy Nandyala / Bolem Poorna Rama Satya Chandu"
-- from Men's Doubles Group B.
-- Match policy: <2 completed → delete their matches; 3+ completed → walkover remaining.
-- Safe to re-run: no-op if team is not in Group B.
-- Run in Supabase SQL Editor (no other patches required).

-- Preview (optional)
SELECT gt.id AS assignment_id,
       g.name AS group_name,
       t.team_name,
       gt.group_position
FROM group_teams gt
JOIN groups g ON g.id = gt.group_id
JOIN categories c ON c.id = g.category_id
JOIN teams t ON t.id = gt.team_id
JOIN players p1 ON p1.id = t.player1_id
JOIN players p2 ON p2.id = t.player2_id
WHERE c.name = 'Men''s Doubles'
  AND g.name = 'Group B'
  AND (
    (p1.employee_id = '42390' AND p2.employee_id = '45062')
    OR (p1.employee_id = '45062' AND p2.employee_id = '42390')
  );

DO $$
DECLARE
  v_group_id uuid;
  v_team_id uuid;
  v_assignment_id uuid;
  v_p1_id uuid;
  v_p2_id uuid;
  v_played integer;
  v_match matches%ROWTYPE;
  v_opponent uuid;
BEGIN
  SELECT id INTO v_p1_id FROM players WHERE employee_id = '42390' LIMIT 1;
  SELECT id INTO v_p2_id FROM players WHERE employee_id = '45062' LIMIT 1;

  IF v_p1_id IS NULL OR v_p2_id IS NULL THEN
    RAISE EXCEPTION 'Players not found (employee_id 42390 / 45062)';
  END IF;

  SELECT g.id INTO v_group_id
  FROM groups g
  JOIN categories c ON c.id = g.category_id
  WHERE c.name = 'Men''s Doubles'
    AND g.name = 'Group B'
  LIMIT 1;

  IF v_group_id IS NULL THEN
    RAISE EXCEPTION 'Men''s Doubles Group B not found';
  END IF;

  SELECT t.id INTO v_team_id
  FROM teams t
  JOIN categories c ON c.id = t.category_id
  WHERE c.name = 'Men''s Doubles'
    AND (
      (t.player1_id = v_p1_id AND t.player2_id = v_p2_id)
      OR (t.player1_id = v_p2_id AND t.player2_id = v_p1_id)
    )
  LIMIT 1;

  IF v_team_id IS NULL THEN
    RAISE NOTICE 'Team not found — nothing to remove';
    RETURN;
  END IF;

  SELECT gt.id INTO v_assignment_id
  FROM group_teams gt
  WHERE gt.group_id = v_group_id
    AND gt.team_id = v_team_id;

  IF v_assignment_id IS NULL THEN
    RAISE NOTICE 'Team is not assigned to Group B — nothing to remove';
    RETURN;
  END IF;

  -- Inline match cleanup (same rules as prepare_participant_removal)
  SELECT count(*)::integer INTO v_played
  FROM matches m
  WHERE m.group_id = v_group_id
    AND m.status = 'COMPLETED'
    AND (m.participant1_id = v_team_id OR m.participant2_id = v_team_id);

  IF v_played < 2 OR v_played = 2 THEN
    DELETE FROM matches m
    WHERE m.group_id = v_group_id
      AND (m.participant1_id = v_team_id OR m.participant2_id = v_team_id);
  ELSE
    FOR v_match IN
      SELECT *
      FROM matches m
      WHERE m.group_id = v_group_id
        AND m.status IN ('SCHEDULED', 'LIVE')
        AND (m.participant1_id = v_team_id OR m.participant2_id = v_team_id)
    LOOP
      IF v_match.participant1_id = v_team_id THEN
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
  END IF;

  DELETE FROM group_teams
  WHERE id = v_assignment_id;

  RAISE NOTICE 'Removed Jaya Simha / Bolem from Men''s Doubles Group B';
END;
$$;
