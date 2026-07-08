-- Allow completed matches with no winner when scores are tied (draw).
-- Superseded by mens-singles-group-a-pavan-sudhir-draw.sql (all-in-one).
-- Or run this alone if you only need draw support without that match update.

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
    IF NEW.winner_participant_id IS NULL THEN
      IF NEW.winner_score IS NULL
         OR NEW.loser_score IS NULL
         OR NEW.winner_score <> NEW.loser_score THEN
        RAISE EXCEPTION 'Draw requires equal scores and no winner';
      END IF;
    ELSE
      IF NEW.winner_score IS NULL THEN
        RAISE EXCEPTION 'winner_score is required for completed matches with a winner';
      END IF;

      IF NEW.winner_participant_id NOT IN (NEW.participant1_id, NEW.participant2_id) THEN
        RAISE EXCEPTION 'winner_participant_id must be one of the match participants';
      END IF;
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
