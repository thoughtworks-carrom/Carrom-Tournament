-- Admin-controlled break indicator for championship finals (visible to all viewers + OBS overlay).

ALTER TABLE finals_settings
  ADD COLUMN IF NOT EXISTS break_match_id text;
