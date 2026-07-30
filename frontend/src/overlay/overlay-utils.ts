import type { CategoryData } from "../lib/tournament";
import { resolveFinalsScoreDisplay } from "../lib/finals-scoring";
import {
  resolveKnockoutBracket,
  type KnockoutStateMap,
  type ResolvedKnockoutMatch,
} from "../lib/knockout-state";
import {
  buildMensDoublesKnockout,
  buildMensSinglesKnockout,
  buildWomensSinglesKnockout,
} from "../lib/knockouts";

export type OverlayCategorySlug =
  | "mens-singles"
  | "mens-doubles"
  | "womens-singles";

export function parseOverlayCategory(
  raw: string | null,
): OverlayCategorySlug | null {
  if (!raw) return null;
  const normalized = raw.toLowerCase().trim();
  if (normalized === "mens-singles" || normalized === "men's singles") {
    return "mens-singles";
  }
  if (normalized === "mens-doubles" || normalized === "men's doubles") {
    return "mens-doubles";
  }
  if (
    normalized === "womens-singles" ||
    normalized === "womens" ||
    normalized === "women's singles"
  ) {
    return "womens-singles";
  }
  return null;
}

export function categoryLabelFromSlug(slug: OverlayCategorySlug): string {
  switch (slug) {
    case "mens-singles":
      return "Men's Singles";
    case "mens-doubles":
      return "Men's Doubles";
    case "womens-singles":
      return "Women's Singles";
  }
}

export function finalMatchIdFromSlug(slug: OverlayCategorySlug): string {
  switch (slug) {
    case "mens-singles":
      return "ms-final";
    case "mens-doubles":
      return "md-final";
    case "womens-singles":
      return "ws-final";
  }
}

export function isDoublesCategory(slug: OverlayCategorySlug): boolean {
  return slug === "mens-doubles";
}

export function splitTeamNames(name: string): string[] {
  if (name.includes(" / ")) {
    return name.split(" / ").map((part) => part.trim()).filter(Boolean);
  }
  if (name.includes("/")) {
    return name.split("/").map((part) => part.trim()).filter(Boolean);
  }
  return [name];
}

export function isActiveFinalMatch(match: ResolvedKnockoutMatch): boolean {
  if (!match.ready) return false;
  return match.state.status === "Live" || match.state.status === "Completed";
}

export function resolveFinalMatch(
  slug: OverlayCategorySlug,
  tournament: CategoryData[],
  knockoutState: KnockoutStateMap,
): ResolvedKnockoutMatch | null {
  const categoryLabel = categoryLabelFromSlug(slug);
  const categoryData = tournament.find((c) => c.category === categoryLabel);
  const bracket =
    slug === "mens-singles"
      ? buildMensSinglesKnockout(categoryData)
      : slug === "mens-doubles"
        ? buildMensDoublesKnockout(categoryData)
        : buildWomensSinglesKnockout(categoryData);

  const finalId = finalMatchIdFromSlug(slug);
  return (
    resolveKnockoutBracket(bracket, knockoutState).find((m) => m.id === finalId) ??
    null
  );
}

export type OverlayScoringMode = "points" | "boards" | "best-of-boards";

export interface OverlayScoringDisplay {
  mode: OverlayScoringMode;
  targetLabel: string;
  scoreUnit: string;
  scoreA: number;
  scoreB: number;
}

export interface OverlayBoardInfo {
  boardsA: number;
  boardsB: number;
  totalCompleted: number;
  currentBoard: number;
  maxBoards: number;
  boardsToWin: number;
  isLive: boolean;
  isCompleted: boolean;
}

export function resolveOverlayBoardInfo(
  match: ResolvedKnockoutMatch,
): OverlayBoardInfo {
  const display = resolveFinalsScoreDisplay(match);
  return {
    boardsA: display.boardsWonA,
    boardsB: display.boardsWonB,
    totalCompleted: display.boardsCompleted,
    currentBoard: display.currentBoard,
    maxBoards: display.maxBoards,
    boardsToWin: display.pointsToWin,
    isLive: display.isLive,
    isCompleted: display.isCompleted,
  };
}

export function resolveOverlayScoring(
  match: ResolvedKnockoutMatch,
): OverlayScoringDisplay {
  const display = resolveFinalsScoreDisplay(match);
  return {
    mode: "points",
    targetLabel: `${display.pointsToWin} Points`,
    scoreUnit: "Points",
    scoreA: display.pointsA,
    scoreB: display.pointsB,
  };
}

export function formatBoardCount(count: number): string {
  return count === 1 ? "1 Board" : `${count} Boards`;
}
