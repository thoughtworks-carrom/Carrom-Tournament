import type { ResolvedKnockoutMatch } from "./knockout-state";

/** Unified championship final scoring — all categories */
export const FINALS_POINTS_TO_WIN = 25;
export const FINALS_MAX_BOARDS = 8;

export interface FinalsScoreDisplay {
  pointsA: number;
  pointsB: number;
  boardsWonA: number;
  boardsWonB: number;
  boardsCompleted: number;
  currentBoard: number;
  maxBoards: number;
  pointsToWin: number;
  isLive: boolean;
  isCompleted: boolean;
}

export function isFinalMatchId(matchId: string): boolean {
  return matchId.endsWith("-final");
}

export function resolveFinalsScoreDisplay(
  match: ResolvedKnockoutMatch,
): FinalsScoreDisplay {
  const { state } = match;
  const pointsA = state.pointsA ?? 0;
  const pointsB = state.pointsB ?? 0;
  const boardsWonA = state.boardsA;
  const boardsWonB = state.boardsB;
  const boardsCompleted = boardsWonA + boardsWonB;
  const isLive = state.status === "Live";
  const isCompleted = state.status === "Completed";

  let currentBoard = 1;
  if (isCompleted) {
    currentBoard = Math.max(1, boardsCompleted);
  } else if (boardsCompleted >= FINALS_MAX_BOARDS) {
    currentBoard = FINALS_MAX_BOARDS;
  } else {
    currentBoard = boardsCompleted + 1;
  }

  return {
    pointsA,
    pointsB,
    boardsWonA,
    boardsWonB,
    boardsCompleted,
    currentBoard: Math.min(currentBoard, FINALS_MAX_BOARDS),
    maxBoards: FINALS_MAX_BOARDS,
    pointsToWin: FINALS_POINTS_TO_WIN,
    isLive,
    isCompleted,
  };
}

export function finalsFormatLabel(): string {
  return `First to ${FINALS_POINTS_TO_WIN} points per board · up to ${FINALS_MAX_BOARDS} boards`;
}

export function finalsScoreSummary(display: FinalsScoreDisplay): string {
  return `Board ${display.currentBoard} · ${display.pointsA}–${display.pointsB} pts · Boards won ${display.boardsWonA}–${display.boardsWonB}`;
}

export function boardStatusLabel(display: FinalsScoreDisplay): string {
  if (display.isCompleted) {
    return `${display.boardsCompleted} board${display.boardsCompleted === 1 ? "" : "s"} completed`;
  }
  if (display.boardsCompleted === 0) {
    return `Board 1 of ${display.maxBoards}`;
  }
  if (display.isLive) {
    return `Board ${display.currentBoard} of ${display.maxBoards}`;
  }
  return `Board ${display.currentBoard} of ${display.maxBoards}`;
}
