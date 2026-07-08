-- Men's Singles Group A: Pavan Posannapeta vs Sudhir Batham
-- Draw — 1 tournament point each, no winner, no game score.
-- Run once in Supabase SQL Editor.

BEGIN;

ALTER TABLE matches DISABLE TRIGGER validate_match;

UPDATE matches m
SET status = 'COMPLETED',
    winner_participant_id = NULL,
    winner_score = NULL,
    loser_score = NULL,
    updated_at = now()
FROM groups g,
     categories c,
     players p1,
     players p2
WHERE m.group_id = g.id
  AND g.category_id = c.id
  AND p1.id = m.participant1_id
  AND p2.id = m.participant2_id
  AND c.name = 'Men''s Singles'
  AND g.name = 'Group A'
  AND p1.employee_id IN ('29143', '42728')
  AND p2.employee_id IN ('29143', '42728')
  AND p1.employee_id <> p2.employee_id;

ALTER TABLE matches ENABLE TRIGGER validate_match;

COMMIT;
