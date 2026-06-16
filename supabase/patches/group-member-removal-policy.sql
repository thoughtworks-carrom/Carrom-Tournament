-- Group removal policy: void matches if <2 played; walkover rest if 3+ played.
-- Run in Supabase SQL Editor.

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
