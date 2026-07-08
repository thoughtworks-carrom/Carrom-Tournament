import type {
  BracketMatch,
  BracketSlot,
  KnockoutBracket,
  KnockoutMatchFormat,
} from "./knockouts";

export type KnockoutStatus = "Scheduled" | "Live" | "Completed";

export interface KnockoutMatchState {
  status: KnockoutStatus;
  boardsA: number;
  boardsB: number;
  pointsA?: number;
  pointsB?: number;
  winnerSide?: "A" | "B";
  notes?: string;
}

export type KnockoutStateMap = Record<string, KnockoutMatchState>;

const STORAGE_KEY = "carrom-knockout-state-v1";

export type ApiKnockoutRow = {
  id: string;
  category_name: string;
  status: "SCHEDULED" | "LIVE" | "COMPLETED";
  boards_a: number;
  boards_b: number;
  points_a: number;
  points_b: number;
  winner_side: "A" | "B" | null;
  notes: string | null;
};

export function categoryForKnockoutMatchId(matchId: string): string {
  if (matchId.startsWith("ms-")) return "Men's Singles";
  if (matchId.startsWith("md-")) return "Men's Doubles";
  if (matchId.startsWith("ws-")) return "Women's Singles";
  return "Knockout";
}

function fromDbKnockoutStatus(status: ApiKnockoutRow["status"]): KnockoutStatus {
  if (status === "LIVE") return "Live";
  if (status === "COMPLETED") return "Completed";
  return "Scheduled";
}

function toDbKnockoutStatus(status: KnockoutStatus): ApiKnockoutRow["status"] {
  if (status === "Live") return "LIVE";
  if (status === "Completed") return "COMPLETED";
  return "SCHEDULED";
}

export function mapRowToKnockoutState(row: ApiKnockoutRow): KnockoutMatchState {
  return {
    status: fromDbKnockoutStatus(row.status),
    boardsA: row.boards_a,
    boardsB: row.boards_b,
    pointsA: row.points_a,
    pointsB: row.points_b,
    winnerSide: row.winner_side ?? undefined,
    notes: row.notes ?? undefined,
  };
}

export function mapKnockoutStateToRow(
  matchId: string,
  category: string,
  state: KnockoutMatchState,
): Omit<ApiKnockoutRow, "id"> & { id: string } {
  return {
    id: matchId,
    category_name: category,
    status: toDbKnockoutStatus(state.status),
    boards_a: state.boardsA,
    boards_b: state.boardsB,
    points_a: state.pointsA ?? 0,
    points_b: state.pointsB ?? 0,
    winner_side: state.winnerSide ?? null,
    notes: state.notes ?? null,
  };
}

export function rowsToKnockoutStateMap(rows: ApiKnockoutRow[]): KnockoutStateMap {
  const map: KnockoutStateMap = {};
  for (const row of rows) {
    map[row.id] = mapRowToKnockoutState(row);
  }
  return map;
}

export function boardsToWin(format: KnockoutMatchFormat): number {
  if (format.type === "best-of") return format.boards === 5 ? 3 : 2;
  return format.maxBoards;
}

export function maxBoardCount(format: KnockoutMatchFormat): number {
  if (format.type === "best-of") return format.boards;
  return format.maxBoards;
}

export function isPointsOrBoardsFormat(format: KnockoutMatchFormat): boolean {
  return format.type === "points-or-boards";
}

export function isMensDoublesOrWomensKnockoutMatch(matchId: string): boolean {
  return matchId.startsWith("md-") || matchId.startsWith("ws-");
}

export function defaultKnockoutState(): KnockoutMatchState {
  return { status: "Scheduled", boardsA: 0, boardsB: 0, pointsA: 0, pointsB: 0 };
}

export function loadKnockoutState(): KnockoutStateMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as KnockoutStateMap;
  } catch {
    return {};
  }
}

export function saveKnockoutState(state: KnockoutStateMap): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export interface ResolvedKnockoutMatch extends BracketMatch {
  resolvedA: BracketSlot;
  resolvedB: BracketSlot;
  state: KnockoutMatchState;
  ready: boolean;
}

function isPlaceholder(name: string): boolean {
  return (
    name === "TBD" ||
    name.startsWith("Winner —") ||
    name.startsWith("Loser —")
  );
}

function pickSide(
  parent: ResolvedKnockoutMatch,
  side: "winner" | "loser",
): BracketSlot {
  const w = parent.state.winnerSide;
  if (!w) {
    return {
      label: side === "winner" ? "Winner" : "Loser",
      name: `${side === "winner" ? "Winner" : "Loser"} — ${parent.label}`,
    };
  }
  return side === "winner"
    ? w === "A"
      ? parent.resolvedA
      : parent.resolvedB
    : w === "A"
      ? parent.resolvedB
      : parent.resolvedA;
}

function inferWinnerSide(
  match: ResolvedKnockoutMatch,
  state: KnockoutMatchState,
): "A" | "B" | undefined {
  if (state.winnerSide) return state.winnerSide;

  if (match.format.type === "points-or-boards") {
    const { pointsToWin, maxBoards } = match.format;
    const pointsA = state.pointsA ?? 0;
    const pointsB = state.pointsB ?? 0;
    const totalBoards = state.boardsA + state.boardsB;

    if (pointsA >= pointsToWin) return "A";
    if (pointsB >= pointsToWin) return "B";
    if (totalBoards >= maxBoards && totalBoards > 0) {
      if (pointsA > pointsB) return "A";
      if (pointsB > pointsA) return "B";
    }
    return undefined;
  }

  const needed = boardsToWin(match.format);
  if (state.boardsA >= needed) return "A";
  if (state.boardsB >= needed) return "B";
  return undefined;
}

export function resolveKnockoutBracket(
  bracket: KnockoutBracket,
  states: KnockoutStateMap,
): ResolvedKnockoutMatch[] {
  const byId = new Map<string, ResolvedKnockoutMatch>();
  const ordered: ResolvedKnockoutMatch[] = [];

  for (const round of bracket.rounds) {
    for (const match of round.matches) {
      let resolvedA = match.slotA;
      let resolvedB = match.slotB;

      if (match.slotASource) {
        const parent = byId.get(match.slotASource);
        resolvedA = parent
          ? pickSide(parent, match.slotASourceSide ?? "winner")
          : resolvedA;
      }
      if (match.slotBSource) {
        const parent = byId.get(match.slotBSource);
        resolvedB = parent
          ? pickSide(parent, match.slotBSourceSide ?? "winner")
          : resolvedB;
      }

      const base = states[match.id] ?? defaultKnockoutState();
      let state = { ...base };
      const winnerSide = inferWinnerSide(
        { ...match, resolvedA, resolvedB, state, ready: true },
        state,
      );
      if (state.status === "Completed" && !state.winnerSide && winnerSide) {
        state = { ...state, winnerSide };
      }

      const ready = !isPlaceholder(resolvedA.name) && !isPlaceholder(resolvedB.name);
      const resolved: ResolvedKnockoutMatch = {
        ...match,
        resolvedA,
        resolvedB,
        state,
        ready,
      };
      byId.set(match.id, resolved);
      ordered.push(resolved);
    }
  }

  return ordered;
}

export function updateKnockoutMatch(
  states: KnockoutStateMap,
  match: ResolvedKnockoutMatch,
  patch: Partial<KnockoutMatchState>,
): KnockoutStateMap {
  const prev = states[match.id] ?? defaultKnockoutState();
  let next: KnockoutMatchState = { ...prev, ...patch };

  if (patch.status === "Scheduled") {
    next = {
      status: "Scheduled",
      boardsA: 0,
      boardsB: 0,
      pointsA: 0,
      pointsB: 0,
      notes: prev.notes,
    };
  } else if (patch.winnerSide) {
    next = { ...next, status: "Completed", winnerSide: patch.winnerSide };
  } else {
    const winnerSide = inferWinnerSide(match, next);
    if (winnerSide) {
      next = { ...next, status: "Completed", winnerSide };
    }
  }

  return { ...states, [match.id]: next };
}

export function completeKnockoutMatch(
  states: KnockoutStateMap,
  match: ResolvedKnockoutMatch,
  winnerSide: "A" | "B",
): KnockoutStateMap {
  return {
    ...states,
    [match.id]: {
      ...(states[match.id] ?? defaultKnockoutState()),
      status: "Completed",
      winnerSide,
    },
  };
}

export function adjustBoards(
  states: KnockoutStateMap,
  match: ResolvedKnockoutMatch,
  side: "A" | "B",
  delta: number,
): KnockoutStateMap {
  const prev = states[match.id] ?? defaultKnockoutState();
  if (prev.status === "Completed") return states;

  const key = side === "A" ? "boardsA" : "boardsB";
  const cap =
    match.format.type === "points-or-boards"
      ? match.format.maxBoards
      : maxBoardCount(match.format);
  const totalBoards = prev.boardsA + prev.boardsB;
  const nextValue = prev[key] + delta;

  if (delta > 0 && match.format.type === "points-or-boards" && totalBoards >= cap) {
    return states;
  }

  const value = Math.max(0, Math.min(cap, nextValue));
  const patch: Partial<KnockoutMatchState> = { [key]: value };
  if (prev.status === "Scheduled" && delta !== 0) {
    patch.status = "Live";
  }
  return updateKnockoutMatch(states, match, patch);
}

export function adjustPoints(
  states: KnockoutStateMap,
  match: ResolvedKnockoutMatch,
  side: "A" | "B",
  delta: number,
): KnockoutStateMap {
  if (match.format.type !== "points-or-boards") return states;
  const prev = states[match.id] ?? defaultKnockoutState();
  if (prev.status === "Completed") return states;

  const key = side === "A" ? "pointsA" : "pointsB";
  const value = Math.max(0, (prev[key] ?? 0) + delta);
  const patch: Partial<KnockoutMatchState> = { [key]: value };
  if (prev.status === "Scheduled" && delta !== 0) {
    patch.status = "Live";
  }
  return updateKnockoutMatch(states, match, patch);
}

export function collectLiveKnockoutMatches(
  resolved: ResolvedKnockoutMatch[],
  categoryLabel: string,
): { match: ResolvedKnockoutMatch; category: string }[] {
  return resolved
    .filter((m) => m.state.status === "Live" && m.ready)
    .map((match) => ({ match, category: categoryLabel }));
}
