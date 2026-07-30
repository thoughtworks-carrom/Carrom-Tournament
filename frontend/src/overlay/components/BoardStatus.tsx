import type { OverlayBoardInfo, OverlayScoringDisplay } from "../overlay-utils";
import {
  FINALS_POINTS_TO_WIN,
  boardStatusLabel,
  resolveFinalsScoreDisplay,
  type FinalsScoreDisplay,
} from "../../lib/finals-scoring";

export function BoardProgress({
  display,
  side,
}: {
  display: FinalsScoreDisplay;
  side: "A" | "B";
}) {
  const won = side === "A" ? display.boardsWonA : display.boardsWonB;

  return (
    <div className="overlay-board-dots" aria-label={`${side} boards won: ${won}`}>
      {Array.from({ length: display.maxBoards }, (_, i) => {
        const isWon = i < won;
        let className = "overlay-board-dot";
        if (isWon) {
          className +=
            side === "A" ? " overlay-board-dot--won-a" : " overlay-board-dot--won-b";
        }
        return <span key={i} className={className} />;
      })}
    </div>
  );
}

export function BoardStatusBar({ display }: { display: FinalsScoreDisplay }) {
  return (
    <div className="overlay-bug__footer">
      <span className="overlay-bug__footer-item overlay-bug__footer-item--highlight">
        {boardStatusLabel(display)}
      </span>
      <span className="overlay-bug__footer-divider">|</span>
      <span className="overlay-bug__footer-item">
        Boards won{" "}
        <strong className="text-teal-300">{display.boardsWonA}</strong>
        <span className="text-white/40 mx-1">–</span>
        <strong className="text-red-300">{display.boardsWonB}</strong>
      </span>
      <span className="overlay-bug__footer-divider">|</span>
      <span className="overlay-bug__footer-item">
        First to <strong>{FINALS_POINTS_TO_WIN}</strong> points
      </span>
    </div>
  );
}

/** @deprecated use resolveFinalsScoreDisplay from finals-scoring */
export function boardInfoFromDisplay(display: FinalsScoreDisplay): OverlayBoardInfo {
  return {
    boardsA: display.boardsWonA,
    boardsB: display.boardsWonB,
    totalCompleted: display.boardsCompleted,
    currentBoard: display.currentBoard,
    maxBoards: display.maxBoards,
    boardsToWin: FINALS_POINTS_TO_WIN,
    isLive: display.isLive,
    isCompleted: display.isCompleted,
  };
}

/** @deprecated use resolveFinalsScoreDisplay */
export function scoringFromDisplay(display: FinalsScoreDisplay): OverlayScoringDisplay {
  return {
    mode: "points",
    targetLabel: `${FINALS_POINTS_TO_WIN} Points`,
    scoreUnit: "Points",
    scoreA: display.pointsA,
    scoreB: display.pointsB,
  };
}

export { resolveFinalsScoreDisplay };
