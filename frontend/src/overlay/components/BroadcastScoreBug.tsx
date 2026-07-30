import { useEffect, useState } from "react";
import type { ResolvedKnockoutMatch } from "../../lib/knockout-state";
import { resolveFinalsScoreDisplay, boardStatusLabel } from "../../lib/finals-scoring";
import { splitTeamNames } from "../overlay-utils";
import {
  finalsPhotoUrl,
  finalsScoreboardPhotos,
  sectionForOverlayCategory,
} from "../../lib/finals-content";
import type { OverlayCategorySlug } from "../overlay-utils";
import { BoardProgress, BoardStatusBar } from "./BoardStatus";
import { LiveBadge } from "./LiveBadge";
import { WinnerBanner } from "./WinnerBanner";

function ScoreValue({
  value,
  isWinner,
}: {
  value: number;
  isWinner: boolean;
}) {
  const [key, setKey] = useState(value);

  useEffect(() => {
    if (value !== key) setKey(value);
  }, [value, key]);

  return (
    <span
      key={key}
      className={`overlay-bug__score overlay-score-bump ${
        isWinner ? "overlay-bug__score--winner" : ""
      }`}
    >
      {value}
    </span>
  );
}

function ParticipantBlock({
  side,
  match,
  isDoubles,
  isWinner,
  photoFiles,
}: {
  side: "A" | "B";
  match: ResolvedKnockoutMatch;
  isDoubles: boolean;
  isWinner: boolean;
  photoFiles: string[];
}) {
  const display = resolveFinalsScoreDisplay(match);
  const slot = side === "A" ? match.resolvedA : match.resolvedB;
  const points = side === "A" ? display.pointsA : display.pointsB;
  const boardsWon = side === "A" ? display.boardsWonA : display.boardsWonB;
  const names = isDoubles ? splitTeamNames(slot.name) : [slot.name];
  const align = side === "A" ? "left" : "right";
  const alignRight = side === "B";

  return (
    <div
      className={`overlay-bug__participant ${
        side === "B" ? "overlay-bug__participant--right" : ""
      } ${isWinner ? "overlay-winner-reveal" : ""}`}
    >
      <div className={`overlay-bug__names ${alignRight ? "items-end" : ""}`}>
        {photoFiles.length > 0 ? (
          <div
            className={`overlay-bug__photo-row ${
              alignRight ? "overlay-bug__photo-row--right" : ""
            }`}
          >
            {photoFiles.map((file) => (
              <img
                key={file}
                src={finalsPhotoUrl(file)}
                alt=""
                className="overlay-bug__player-photo"
              />
            ))}
          </div>
        ) : null}
        {names.map((name) => (
          <p
            key={name}
            className={`overlay-bug__name ${isWinner ? "overlay-bug__name--winner" : ""}`}
          >
            {name}
          </p>
        ))}
      </div>

      <div className={`overlay-bug__score-block overlay-bug__score-block--${align}`}>
        <ScoreValue value={points} isWinner={isWinner} />
        <p className="overlay-bug__score-label">Points</p>
        <p className="overlay-bug__meta mt-1">
          Boards won: <strong>{boardsWon}</strong>
        </p>
        <BoardProgress display={display} side={side} />
      </div>
    </div>
  );
}

export function BroadcastScoreBug({
  match,
  categoryLabel,
  isDoubles,
  categorySlug,
}: {
  match: ResolvedKnockoutMatch;
  categoryLabel: string;
  isDoubles: boolean;
  categorySlug: OverlayCategorySlug;
}) {
  const display = resolveFinalsScoreDisplay(match);
  const winnerSide = match.state.winnerSide;
  const status = match.state.status;
  const scoreboardPhotos = finalsScoreboardPhotos(
    sectionForOverlayCategory(categorySlug),
    match.resolvedA.name,
    match.resolvedB.name,
    isDoubles,
  );

  return (
    <div className="overlay-bug overlay-fade-in">
      <div className="overlay-bug__top">
        <p className="overlay-bug__top-title">
          <span aria-hidden>🎯 </span>
          Thoughtworks Hyderabad · Carrom Championship 2026
        </p>

        <div className="overlay-bug__top-center">
          <span className="overlay-bug__top-final">FINAL</span>
          <span className="text-white/35">·</span>
          <span className="overlay-bug__top-category">{categoryLabel}</span>
        </div>

        <div className="overlay-bug__top-right">
          {status === "Live" ? (
            <LiveBadge />
          ) : status === "Completed" ? (
            <WinnerBanner />
          ) : null}
        </div>
      </div>

      <div className="overlay-bug__body">
        <div className="overlay-bug__scores">
          <ParticipantBlock
            side="A"
            match={match}
            isDoubles={isDoubles}
            isWinner={winnerSide === "A"}
            photoFiles={scoreboardPhotos.sideA}
          />

          <div className="overlay-bug__center">
            <span className="overlay-bug__vs">VS</span>
            <span className="overlay-bug__center-board">{boardStatusLabel(display)}</span>
            <span className="overlay-bug__meta text-center">
              Boards won {display.boardsWonA}–{display.boardsWonB}
            </span>
          </div>

          <ParticipantBlock
            side="B"
            match={match}
            isDoubles={isDoubles}
            isWinner={winnerSide === "B"}
            photoFiles={scoreboardPhotos.sideB}
          />
        </div>

        <BoardStatusBar display={display} />
      </div>
    </div>
  );
}
