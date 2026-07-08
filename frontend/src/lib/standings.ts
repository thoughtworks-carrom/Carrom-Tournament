import type {
  ApiMatch,
  ApiPlayer,
  ApiStanding,
  ApiTeam,
  CategoryFormat,
  ParticipantType,
} from "./types";

const WIN_POINTS = 2;
const DRAW_POINTS = 1;

export function resolveParticipantName(
  participantId: string,
  participantType: ParticipantType,
  players: Map<string, ApiPlayer>,
  teams: Map<string, ApiTeam>,
): string {
  if (participantType === "PLAYER") {
    return players.get(participantId)?.name ?? "Unknown Player";
  }
  const team = teams.get(participantId);
  if (!team) return "Unknown Team";
  const p1 = players.get(team.player1_id);
  const p2 = players.get(team.player2_id);
  if (p1 && p2) return `${p1.name} / ${p2.name}`;
  return team.team_name;
}

export function enrichMatch(
  match: ApiMatch,
  players: Map<string, ApiPlayer>,
  teams: Map<string, ApiTeam>,
): ApiMatch {
  return {
    ...match,
    participant1_name: resolveParticipantName(
      match.participant1_id,
      match.participant_type,
      players,
      teams,
    ),
    participant2_name: resolveParticipantName(
      match.participant2_id,
      match.participant_type,
      players,
      teams,
    ),
  };
}

export function computeStandings(
  groupId: string,
  _format: CategoryFormat,
  participantIds: { id: string; type: ParticipantType }[],
  matches: ApiMatch[],
  players: Map<string, ApiPlayer>,
  teams: Map<string, ApiTeam>,
): ApiStanding[] {
  const stats = new Map<
    string,
    {
      participant_type: ParticipantType;
      matches_played: number;
      wins: number;
      losses: number;
      tournament_points: number;
      score: number;
    }
  >();

  for (const { id, type } of participantIds) {
    stats.set(id, {
      participant_type: type,
      matches_played: 0,
      wins: 0,
      losses: 0,
      tournament_points: 0,
      score: 0,
    });
  }

  const completed = matches.filter(
    (m) => m.group_id === groupId && m.status === "COMPLETED",
  );

  for (const match of completed) {
    const { participant1_id: p1, participant2_id: p2, winner_participant_id: winner } = match;

    for (const pid of [p1, p2]) {
      const row = stats.get(pid);
      if (row) row.matches_played += 1;
    }

    if (!winner) {
      const isDraw =
        match.winner_score == null && match.loser_score == null
          ? true
          : match.winner_score != null &&
            match.loser_score != null &&
            match.winner_score === match.loser_score;
      if (isDraw) {
        for (const pid of [p1, p2]) {
          const row = stats.get(pid);
          if (row) {
            row.tournament_points += DRAW_POINTS;
            if (match.winner_score != null) row.score += match.winner_score;
          }
        }
      }
      continue;
    }

    const loser = winner === p1 ? p2 : p1;
    const winnerRow = stats.get(winner);
    if (winnerRow) {
      winnerRow.wins += 1;
      winnerRow.tournament_points += WIN_POINTS;
      winnerRow.score += match.winner_score ?? 0;
    }

    const loserRow = stats.get(loser);
    if (loserRow) {
      loserRow.losses += 1;
      loserRow.score += match.loser_score ?? 0;
    }
  }

  const standings: ApiStanding[] = [...stats.entries()].map(([participant_id, data]) => ({
    participant_id,
    participant_type: data.participant_type,
    display_name: resolveParticipantName(
      participant_id,
      data.participant_type,
      players,
      teams,
    ),
    matches_played: data.matches_played,
    wins: data.wins,
    losses: data.losses,
    tournament_points: data.tournament_points,
    score: data.score,
  }));

  standings.sort((a, b) => {
    if (b.tournament_points !== a.tournament_points) {
      return b.tournament_points - a.tournament_points;
    }
    return b.wins - a.wins;
  });

  return standings;
}
