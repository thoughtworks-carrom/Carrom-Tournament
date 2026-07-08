// Integration: maps FastAPI responses into the UI shapes used by App.tsx
import {
  api,
  ApiCategory,
  ApiMatch,
  ApiPlayer,
  ApiTeam,
  MatchStatus as ApiMatchStatus,
} from "./api";

export type UiMatchStatus = "Scheduled" | "Live" | "Completed";

export interface PlayerStanding {
  id: string;
  name: string;
  matchesPlayed: number;
  wins: number;
  losses: number;
  points: number;
  score: number;
  participantType: "PLAYER" | "TEAM";
  employeeId?: string | null;
}

export interface GroupMatch {
  id: string;
  playerA: string;
  playerB: string;
  participant1Id: string;
  participant2Id: string;
  participant1Type: "PLAYER" | "TEAM";
  participant2Type: "PLAYER" | "TEAM";
  participant1EmployeeId?: string | null;
  participant2EmployeeId?: string | null;
  winnerParticipantId: string | null;
  winnerScore: number | null;
  loserScore: number | null;
  status: UiMatchStatus;
}

export interface TournamentGroup {
  id: string;
  name: string;
  standings: PlayerStanding[];
  matches: GroupMatch[];
}

export interface CategoryData {
  category: string;
  categoryId: string;
  groups: TournamentGroup[];
}

export function categoryDisplayName(category: ApiCategory): string {
  return category.name;
}

export function toUiStatus(status: ApiMatchStatus): UiMatchStatus {
  if (status === "LIVE") return "Live";
  if (status === "COMPLETED") return "Completed";
  return "Scheduled";
}

export function toApiStatus(status: UiMatchStatus): ApiMatchStatus {
  if (status === "Live") return "LIVE";
  if (status === "Completed") return "COMPLETED";
  return "SCHEDULED";
}

export function playerScoresForMatch(match: GroupMatch): {
  playerAScore: number | null;
  playerBScore: number | null;
} {
  if (!match.winnerParticipantId) {
    if (
      (match.winnerScore == null && match.loserScore == null) ||
      (match.winnerScore != null &&
        match.loserScore != null &&
        match.winnerScore === match.loserScore)
    ) {
      return {
        playerAScore:
          match.winnerScore != null && match.loserScore != null
            ? match.winnerScore
            : null,
        playerBScore:
          match.winnerScore != null && match.loserScore != null
            ? match.loserScore
            : null,
      };
    }
    return { playerAScore: null, playerBScore: null };
  }
  const winnerIsA = match.winnerParticipantId === match.participant1Id;
  return {
    playerAScore: winnerIsA ? match.winnerScore : match.loserScore,
    playerBScore: winnerIsA ? match.loserScore : match.winnerScore,
  };
}

function mapMatch(
  match: ApiMatch,
  playerById: Map<string, ApiPlayer>,
): GroupMatch {
  const getEmployeeId = (participantId: string, participantType: "PLAYER" | "TEAM") => {
    if (participantType === "PLAYER") {
      return playerById.get(participantId)?.employee_id;
    }
    return undefined;
  };

  return {
    id: match.id,
    playerA: match.participant1_name || "TBD",
    playerB: match.participant2_name || "TBD",
    participant1Id: match.participant1_id,
    participant2Id: match.participant2_id,
    participant1Type: match.participant_type,
    participant2Type: match.participant_type,
    participant1EmployeeId: getEmployeeId(match.participant1_id, match.participant_type),
    participant2EmployeeId: getEmployeeId(match.participant2_id, match.participant_type),
    winnerParticipantId: match.winner_participant_id,
    winnerScore: match.winner_score,
    loserScore: match.loser_score,
    status: toUiStatus(match.status),
  };
}

export async function fetchTournamentData(): Promise<{
  tournament: CategoryData[];
  categories: ApiCategory[];
  players: ApiPlayer[];
  teams: ApiTeam[];
}> {
  const [categories, players, teams] = await Promise.all([
    api.getCategories(),
    api.getPlayers(),
    api.getTeams(),
  ]);
  const playerById = new Map(players.map((player) => [player.id, player]));

  const tournament = await Promise.all(
    categories.map(async (category) => {
      const groups = await api.getGroups(category.id);
      const groupData = await Promise.all(
        groups.map(async (group) => {
          const [standingsData, matches] = await Promise.all([
            api.getStandings(group.id),
            api.getGroupMatches(group.id),
          ]);

          const standings = standingsData.map((s) => ({
            id: s.participant_id,
            name: s.display_name,
            matchesPlayed: s.matches_played,
            wins: s.wins,
            losses: s.losses,
            points: s.tournament_points,
            score: s.score,
            participantType: s.participant_type,
            employeeId:
              s.participant_type === "PLAYER"
                ? playerById.get(s.participant_id)?.employee_id
                : undefined,
          }));

          return {
            id: group.id,
            name: group.name,
            standings,
            matches: matches.map((m) => mapMatch(m, playerById)),
          };
        }),
      );

      return {
        category: categoryDisplayName(category),
        categoryId: category.id,
        groups: groupData,
      };
    }),
  );

  return { tournament, categories, players, teams };
}

export interface MatchProgress {
  completed: number;
  total: number;
}

export interface GroupMatchProgress extends MatchProgress {
  groupId: string;
  group: string;
}

export interface CategoryMatchProgress extends MatchProgress {
  category: string;
  groups: GroupMatchProgress[];
}

export interface TournamentMatchProgress {
  total: MatchProgress;
  byCategory: CategoryMatchProgress[];
}

export function matchProgressFromMatches(matches: GroupMatch[]): MatchProgress {
  const total = matches.length;
  const completed = matches.filter((m) => m.status === "Completed").length;
  return { completed, total };
}

export function formatMatchProgress(
  progress: MatchProgress,
  { suffix = " completed" }: { suffix?: string } = {},
): string {
  const { completed, total } = progress;
  return `${completed}/${total}${suffix}`;
}

export function computeTournamentMatchProgress(
  data: CategoryData[],
): TournamentMatchProgress {
  const byCategory = data.map((cat) => {
    const groups = cat.groups.map((group) => ({
      groupId: group.id,
      group: group.name,
      ...matchProgressFromMatches(group.matches),
    }));
    const categoryMatches = cat.groups.flatMap((g) => g.matches);
    return {
      category: cat.category,
      ...matchProgressFromMatches(categoryMatches),
      groups,
    };
  });

  const allMatches = data.flatMap((cat) =>
    cat.groups.flatMap((g) => g.matches),
  );

  return {
    total: matchProgressFromMatches(allMatches),
    byCategory,
  };
}
