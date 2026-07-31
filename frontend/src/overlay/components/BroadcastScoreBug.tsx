import type { ResolvedKnockoutMatch } from "../../lib/knockout-state";
import {
  resolveFinalsScoreDisplay,
  boardStatusLabel,
  finalsScoreSummary,
} from "../../lib/finals-scoring";
import { splitTeamNames } from "../overlay-utils";
import {
  finalsPhotoUrl,
  finalsScoreboardPhotos,
  sectionForOverlayCategory,
} from "../../lib/finals-content";
import type { OverlayCategorySlug } from "../overlay-utils";
import { FinalsSideScore } from "../../components/FinalsSideScore";
import { LiveBadge } from "./LiveBadge";
import { BreakBadge } from "./BreakBadge";
import { WinnerBanner } from "./WinnerBanner";

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
  const names = isDoubles ? splitTeamNames(slot.name) : [slot.name];

  return (
    <div
      className={`overlay-bug__participant ${
        side === "B" ? "overlay-bug__participant--right" : ""
      } ${isWinner ? "overlay-winner-reveal" : ""}`}
    >
      <div
        className={`overlay-bug__side ${
          side === "B" ? "overlay-bug__side--right" : ""
        }`}
      >
        {photoFiles.length > 0 ? (
          <div className="overlay-bug__photo-row">
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

        <div className={`overlay-bug__names ${side === "B" ? "text-right" : ""}`}>
          {names.map((name) => (
            <p
              key={name}
              className={`overlay-bug__name ${isWinner ? "overlay-bug__name--winner" : ""}`}
            >
              {name}
            </p>
          ))}
        </div>

        <FinalsSideScore display={display} side={side} variant="overlay" />
      </div>
    </div>
  );
}

export function BroadcastScoreBug({
  match,
  categoryLabel,
  isDoubles,
  categorySlug,
  isOnBreak = false,
}: {
  match: ResolvedKnockoutMatch;
  categoryLabel: string;
  isDoubles: boolean;
  categorySlug: OverlayCategorySlug;
  isOnBreak?: boolean;
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
    <div className={`overlay-bug overlay-fade-in${isDoubles ? " overlay-bug--doubles" : ""}`}>
      <div className="overlay-bug__top">
        <p className="overlay-bug__top-title">TW Hyderabad Carrom 2026</p>

        <div className="overlay-bug__top-center">
          <span className="overlay-bug__top-final">FINAL</span>
          <span className="overlay-bug__top-dot">·</span>
          <span className="overlay-bug__top-category">{categoryLabel}</span>
        </div>

        <div className="overlay-bug__top-right">
          {isOnBreak ? (
            <BreakBadge />
          ) : status === "Live" ? (
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
            <span className="overlay-bug__center-board">
              {isOnBreak ? "Match on break" : boardStatusLabel(display)}
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

        <p className="overlay-bug__footer-line">
          {finalsScoreSummary(display)} · First to <strong>25</strong> points wins each board
        </p>
      </div>
    </div>
  );
}
