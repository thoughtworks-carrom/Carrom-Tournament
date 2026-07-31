export type Gender = "MALE" | "FEMALE";
export type CategoryGender = Gender | "MIXED";
export type CategoryFormat = "SINGLES" | "DOUBLES";
export type MatchStatus = "SCHEDULED" | "LIVE" | "COMPLETED";
export type ParticipantType = "PLAYER" | "TEAM";

export interface ApiCategory {
  id: string;
  name: string;
  gender: CategoryGender;
  format: CategoryFormat;
}

export interface ApiGroup {
  id: string;
  category_id: string;
  name: string;
}

export interface ApiGroupPlayer {
  id: string;
  group_id: string;
  player_id: string;
  group_position: number | null;
}

export interface ApiGroupTeam {
  id: string;
  group_id: string;
  team_id: string;
  group_position: number | null;
}

export interface ApiPlayer {
  id: string;
  name: string;
  employee_id: string | null;
  gender: Gender;
  is_active: boolean;
}

export interface ApiTeam {
  id: string;
  team_name: string;
  player1_id: string;
  player2_id: string;
  category_id: string;
  is_active: boolean;
}

export interface ApiStanding {
  participant_id: string;
  participant_type: ParticipantType;
  display_name: string;
  matches_played: number;
  wins: number;
  losses: number;
  tournament_points: number;
  score: number;
}

export interface ApiGalleryImage {
  id: string;
  filename: string;
  content_type: string;
  url_path: string;
  created_at: string;
}

export interface ApiFinalsSettings {
  youtube_url: string | null;
  live_match_id: string | null;
  break_match_id: string | null;
  updated_at: string;
}

export interface ApiMatch {
  id: string;
  category_id: string;
  group_id: string;
  participant1_id: string;
  participant2_id: string;
  participant_type: ParticipantType;
  status: MatchStatus;
  winner_participant_id: string | null;
  winner_score: number | null;
  loser_score: number | null;
  participant1_name?: string | null;
  participant2_name?: string | null;
  created_at: string;
}
