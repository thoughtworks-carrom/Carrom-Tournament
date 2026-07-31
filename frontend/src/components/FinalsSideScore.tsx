import { BoardWinDots } from "./BoardWinDots";
import type { FinalsScoreDisplay } from "../lib/finals-scoring";

export function FinalsSideScore({
  display,
  side,
  variant = "page",
}: {
  display: FinalsScoreDisplay;
  side: "A" | "B";
  variant?: "page" | "overlay";
}) {
  const boardsWon = side === "A" ? display.boardsWonA : display.boardsWonB;
  const points = side === "A" ? display.pointsA : display.pointsB;

  if (variant === "overlay") {
    return (
      <div className={`overlay-bug__score-col ${side === "B" ? "items-end" : ""}`}>
        <div className={`flex flex-col ${side === "B" ? "items-end" : "items-start"}`}>
          <span className="overlay-bug__boards-won tabular-nums">{boardsWon}</span>
          <span className="overlay-bug__boards-won-label">boards won</span>
        </div>
        <div className={`flex flex-col ${side === "B" ? "items-end" : "items-start"} mt-1`}>
          <span className="overlay-bug__board-points tabular-nums">
            {points}
            <span className="overlay-bug__board-points-target">/{display.pointsToWin}</span>
          </span>
          <span className="overlay-bug__board-points-label">
            board {display.currentBoard} pts
          </span>
        </div>
        <BoardWinDots won={boardsWon} side={side} size="sm" />
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <p className="font-display text-5xl font-extrabold tabular-nums text-tw-purple dark:text-tw-teal">
        {boardsWon}
      </p>
      <p className="text-xs uppercase tracking-wider text-slate-500">boards won</p>

      <div className="pt-3 mt-3 border-t border-slate-200/70 dark:border-slate-700/70">
        <p className="font-display text-3xl font-bold tabular-nums text-tw-ink dark:text-white">
          {points}
          <span className="text-xl font-semibold text-slate-400">/{display.pointsToWin}</span>
        </p>
        <p className="text-xs uppercase tracking-wider text-slate-500 mt-1">
          board {display.currentBoard} points
        </p>
      </div>

      <BoardWinDots won={boardsWon} side={side} />
    </div>
  );
}
