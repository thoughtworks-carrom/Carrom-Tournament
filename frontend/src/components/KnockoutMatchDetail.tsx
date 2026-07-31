import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  Calendar,
  CheckCircle2,
  Radio,
  Trophy,
  X,
} from "lucide-react";
import type {
  KnockoutMatchState,
  ResolvedKnockoutMatch,
} from "../lib/knockout-state";
import {
  boardsToWin,
  isPointsOrBoardsFormat,
  maxBoardCount,
} from "../lib/knockout-state";
import { formatLabel, type KnockoutMatchFormat } from "../lib/knockouts";
import { KnockoutPlayerName } from "./KnockoutBracket";

function isKnockoutTbd(name: string): boolean {
  return (
    name === "TBD" ||
    name.startsWith("Winner —") ||
    name.startsWith("Loser —")
  );
}

function StatusBadge({ status }: { status: KnockoutMatchState["status"] }) {
  if (status === "Completed") {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-tw-teal/20 text-tw-purple dark:text-tw-teal border border-tw-teal/40">
        <CheckCircle2 className="w-3.5 h-3.5" />
        Qualified
      </span>
    );
  }
  if (status === "Live") {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-tw-coral text-white animate-pulse-soft shadow-sm shadow-tw-coral/30">
        <Radio className="w-3.5 h-3.5" />
        Live
      </span>
    );
  }
  return null;
}

function BoardProgress({
  boardsA,
  boardsB,
  format,
}: {
  boardsA: number;
  boardsB: number;
  format: KnockoutMatchFormat;
}) {
  const needed = boardsToWin(format);
  const dots = maxBoardCount(format);

  return (
    <div className="flex items-center justify-center gap-6 mt-3">
      {(["A", "B"] as const).map((side) => {
        const won = side === "A" ? boardsA : boardsB;
        return (
          <div key={side} className="flex gap-1.5">
            {Array.from({ length: dots }, (_, i) => (
              <div
                key={i}
                className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${
                  i < won
                    ? side === "A"
                      ? "bg-tw-teal shadow-sm shadow-tw-teal/40"
                      : "bg-tw-magenta shadow-sm shadow-tw-magenta/40"
                    : "bg-tw-mist dark:bg-slate-700"
                }`}
              />
            ))}
            <span className="sr-only">
              {side}: {won} of {needed} needed
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function KnockoutMatchDetailPanel({
  match,
  adminMode,
  onUpdate,
  onBoards,
  onPoints,
  onComplete,
  onClose,
  renderPlayer,
}: {
  match: ResolvedKnockoutMatch;
  adminMode: boolean;
  onUpdate: (patch: Partial<KnockoutMatchState>) => void;
  onBoards: (side: "A" | "B", delta: number) => void;
  onPoints?: (side: "A" | "B", delta: number) => void;
  onComplete: (winnerSide: "A" | "B") => void;
  onClose?: () => void;
  renderPlayer?: (
    name: string,
    employeeId: string | null | undefined,
    className?: string,
  ) => React.ReactNode;
}) {
  const { state } = match;
  const isCompleted = state.status === "Completed";
  const isFinal = match.id.endsWith("-final") || match.id === "ws-final";
  const pointsMatch = isFinal || isPointsOrBoardsFormat(match.format);
  const [winnerSide, setWinnerSide] = useState<"A" | "B">(
    state.winnerSide ?? "A",
  );
  const [notes, setNotes] = useState(state.notes ?? "");

  useEffect(() => {
    setWinnerSide(state.winnerSide ?? "A");
    setNotes(state.notes ?? "");
  }, [match.id, state.winnerSide, state.notes]);

  const player = (name: string, employeeId?: string | null, className = "") => {
    if (isKnockoutTbd(name)) {
      return <span className={`text-slate-400 italic ${className}`}>{name}</span>;
    }
    if (renderPlayer) return renderPlayer(name, employeeId, className);
    return <KnockoutPlayerName slot={{ name, employeeId }} className={className} />;
  };

  const winner =
    state.winnerSide === "A"
      ? match.resolvedA
      : state.winnerSide === "B"
        ? match.resolvedB
        : null;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span
              className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                isFinal
                  ? "bg-tw-magenta/15 text-tw-magenta dark:text-tw-coral border border-tw-magenta/25"
                  : "bg-tw-teal/10 text-tw-purple dark:text-tw-teal border border-tw-teal/25"
              }`}
            >
              {match.round}
            </span>
            <StatusBadge status={state.status} />
            <span className="text-xs text-slate-400">
              {isFinal ? "25 points · up to 8 boards" : formatLabel(match.format)}
            </span>
          </div>
          <h4 className="font-display text-xl font-bold flex items-center gap-2">
            {isFinal && <Trophy className="w-5 h-5 text-tw-magenta shrink-0" />}
            {match.label}
          </h4>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-slate-200/80 dark:hover:bg-slate-700/80 transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        {(["A", "B"] as const).map((side) => {
          const slot = side === "A" ? match.resolvedA : match.resolvedB;
          const boards = side === "A" ? state.boardsA : state.boardsB;
          const points = side === "A" ? (state.pointsA ?? 0) : (state.pointsB ?? 0);
          const won = state.winnerSide === side;
          return (
            <div
              key={side}
              className={`relative p-5 rounded-2xl border-2 transition-all duration-300 ${
                won
                  ? "border-tw-teal/60 bg-gradient-to-br from-tw-teal/15 to-tw-purple/5 shadow-md shadow-tw-teal/10"
                  : side === "A"
                    ? "border-tw-teal/25 bg-tw-teal/5"
                    : "border-tw-magenta/25 bg-tw-magenta/5"
              }`}
            >
              {won && (
                <span className="absolute top-3 right-3 text-[10px] font-bold uppercase tracking-wide text-tw-teal dark:text-tw-teal">
                  Winner
                </span>
              )}
              <p className="text-xs text-slate-500 mb-1">{slot.label}</p>
              <div className="font-semibold text-lg">
                {player(slot.name, slot.employeeId)}
              </div>
              <p className="text-4xl font-bold text-tw-teal mt-3 tabular-nums">
                {isFinal ? boards : pointsMatch ? points : boards}
              </p>
              <p className="text-xs text-slate-400">
                {isFinal
                  ? "boards won"
                  : pointsMatch
                    ? "points"
                    : "boards won"}
              </p>
              {isFinal ? (
                <>
                  <p className="text-2xl font-bold text-slate-700 dark:text-slate-200 mt-3 tabular-nums">
                    {points}
                    <span className="text-lg font-semibold text-slate-400">/25</span>
                  </p>
                  <p className="text-xs text-slate-400">current board points</p>
                </>
              ) : pointsMatch ? (
                <p className="text-sm font-semibold text-slate-500 mt-1 tabular-nums">
                  Boards won: {boards}
                </p>
              ) : null}
              {adminMode && match.ready && !isCompleted && (
                <div className="flex flex-wrap items-center gap-2 mt-4">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onBoards(side, -1)}
                      className="w-8 h-8 rounded-lg bg-slate-200 dark:bg-slate-700 font-bold hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors"
                    >
                      −
                    </button>
                    <button
                      type="button"
                      onClick={() => onBoards(side, 1)}
                      className="w-8 h-8 rounded-lg bg-gradient-to-br from-tw-teal to-tw-purple text-white font-bold hover:opacity-90 transition-all"
                    >
                      +
                    </button>
                    <span className="text-xs text-slate-400">boards</span>
                  </div>
                  {pointsMatch && onPoints ? (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onPoints(side, -1)}
                        className="w-8 h-8 rounded-lg bg-slate-200 dark:bg-slate-700 font-bold hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors"
                      >
                        −
                      </button>
                      <button
                        type="button"
                        onClick={() => onPoints(side, 1)}
                        className="w-8 h-8 rounded-lg bg-gradient-to-br from-tw-magenta to-tw-purple text-white font-bold hover:opacity-90 transition-all"
                      >
                        +
                      </button>
                      <span className="text-xs text-slate-400">points</span>
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <BoardProgress boardsA={state.boardsA} boardsB={state.boardsB} format={match.format} />

      {!match.ready && (
        <p className="text-sm text-amber-600 dark:text-amber-400 bg-amber-500/10 rounded-xl px-4 py-3">
          Waiting for previous round results before this match can begin.
        </p>
      )}

      <div className="rounded-2xl border border-slate-200/60 dark:border-slate-700/60 p-4 space-y-3">
        <h5 className="text-sm font-bold text-slate-700 dark:text-slate-200 flex items-center gap-2">
          <Calendar className="w-4 h-4 text-tw-teal" />
          Match details
        </h5>
        <dl className="grid sm:grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-slate-400 text-xs">Format</dt>
            <dd className="font-medium">{formatLabel(match.format)}</dd>
          </div>
          <div>
            <dt className="text-slate-400 text-xs">Stage</dt>
            <dd className="font-medium">{match.round}</dd>
          </div>
          {match.slotASource && (
            <div>
              <dt className="text-slate-400 text-xs">Player A from</dt>
              <dd className="font-medium text-slate-600 dark:text-slate-300">
                {match.slotASourceSide === "loser" ? "Loser" : "Winner"} of prior match
              </dd>
            </div>
          )}
          {match.slotBSource && (
            <div>
              <dt className="text-slate-400 text-xs">Player B from</dt>
              <dd className="font-medium text-slate-600 dark:text-slate-300">
                {match.slotBSourceSide === "loser" ? "Loser" : "Winner"} of prior match
              </dd>
            </div>
          )}
        </dl>
        {(adminMode || state.notes) && (
          <div className="pt-2 border-t border-slate-200/50 dark:border-slate-700/50">
            <label className="text-xs text-slate-400 block mb-1">Notes</label>
            {adminMode ? (
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                onBlur={() => {
                  if (notes !== (state.notes ?? "")) onUpdate({ notes });
                }}
                rows={2}
                placeholder="Add match notes (visible to all)…"
                className="w-full px-3 py-2 rounded-xl glass text-sm resize-none"
              />
            ) : (
              <p className="text-sm text-slate-600 dark:text-slate-300">{state.notes}</p>
            )}
          </div>
        )}
      </div>

      {adminMode && match.ready && (
        <div className="rounded-2xl border border-tw-purple/15 bg-tw-mist/30 dark:bg-slate-800/40 p-4 space-y-4">
          <h5 className="text-sm font-bold text-tw-purple dark:text-tw-teal flex items-center gap-2">
            Admin controls
          </h5>

          {!isCompleted && (
            <label className="flex flex-col gap-1.5 text-xs text-slate-500">
              Match status
              <select
                value={state.status}
                onChange={(e) => {
                  const status = e.target.value as KnockoutMatchState["status"];
                  if (status === "Scheduled" && state.status !== "Scheduled") {
                    if (window.confirm("Reset this knockout match?")) {
                      onUpdate({ status: "Scheduled" });
                    }
                    return;
                  }
                  onUpdate({ status });
                }}
                className="px-3 py-2.5 rounded-xl glass text-sm w-full sm:w-fit"
              >
                <option value="Scheduled">Scheduled</option>
                <option value="Live">Live</option>
              </select>
            </label>
          )}

          {!isCompleted && (
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1.5 text-xs text-slate-500 flex-1 min-w-[10rem]">
                Set winner
                <select
                  value={winnerSide}
                  onChange={(e) => setWinnerSide(e.target.value as "A" | "B")}
                  className="px-3 py-2.5 rounded-xl glass text-sm"
                >
                  <option value="A">{match.resolvedA.name}</option>
                  <option value="B">{match.resolvedB.name}</option>
                </select>
              </label>
              <button
                type="button"
                onClick={() => onComplete(winnerSide)}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-tw-teal to-tw-purple text-white text-sm font-semibold hover:opacity-95 shadow-lg shadow-tw-teal/25 transition-all"
              >
                Complete match
              </button>
            </div>
          )}

          {isCompleted && winner && (
            <p className="text-sm text-tw-teal dark:text-tw-teal font-semibold flex items-center gap-2">
              <Trophy className="w-4 h-4" />
              Champion: {winner.name}
            </p>
          )}

          {isCompleted && (
            <button
              type="button"
              onClick={() => {
                if (window.confirm("Reset this knockout match?")) {
                  onUpdate({ status: "Scheduled" });
                }
              }}
              className="text-red-600 dark:text-red-400 text-sm font-semibold hover:underline"
            >
              Reset to scheduled
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function KnockoutMatchModal({
  match,
  adminMode,
  onUpdate,
  onBoards,
  onPoints,
  onComplete,
  onClose,
  renderPlayer,
}: {
  match: ResolvedKnockoutMatch | null;
  adminMode: boolean;
  onUpdate: (patch: Partial<KnockoutMatchState>) => void;
  onBoards: (side: "A" | "B", delta: number) => void;
  onPoints?: (side: "A" | "B", delta: number) => void;
  onComplete: (winnerSide: "A" | "B") => void;
  onClose: () => void;
  renderPlayer?: (
    name: string,
    employeeId: string | null | undefined,
    className?: string,
  ) => React.ReactNode;
}) {
  useEffect(() => {
    if (!match) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [match, onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {match && (
        <motion.div
          key={match.id}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4"
        >
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            onClick={onClose}
            aria-label="Close match details"
          />
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            transition={{ type: "spring", damping: 28, stiffness: 320 }}
            className="relative w-full sm:max-w-2xl max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-white dark:bg-slate-900 border border-tw-purple/15 dark:border-tw-teal/20 shadow-2xl shadow-tw-purple/10 p-6 sm:p-8"
            onClick={(e) => e.stopPropagation()}
          >
            <KnockoutMatchDetailPanel
              match={match}
              adminMode={adminMode}
              onUpdate={onUpdate}
              onBoards={onBoards}
              onPoints={onPoints}
              onComplete={onComplete}
              onClose={onClose}
              renderPlayer={renderPlayer}
            />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
