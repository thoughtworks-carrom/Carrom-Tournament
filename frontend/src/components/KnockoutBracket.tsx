import { type ReactNode, useLayoutEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, Crown, Radio, Trophy } from "lucide-react";
import type { ResolvedKnockoutMatch } from "../lib/knockout-state";
import type { KnockoutMatchState } from "../lib/knockout-state";
import { formatLabel } from "../lib/knockouts";

function isKnockoutTbd(name: string): boolean {
  return (
    name === "TBD" ||
    name.startsWith("Winner —") ||
    name.startsWith("Loser —")
  );
}

export function knockoutStatusClass(status: KnockoutMatchState["status"]): string {
  if (status === "Completed")
    return "bg-tw-teal/20 text-tw-purple dark:text-tw-teal border-tw-teal/40";
  if (status === "Live") return "bg-tw-coral text-white border-tw-coral";
  return "bg-tw-mist text-tw-purple/70 dark:text-slate-400 border-tw-purple/20";
}

export function KnockoutPlayerName({
  slot,
  className = "",
  title,
}: {
  slot: { name: string; employeeId?: string | null };
  className?: string;
  title?: string;
}) {
  const tip = title ?? slot.name;
  if (isKnockoutTbd(slot.name)) {
    return (
      <span className={`text-slate-400 italic truncate ${className}`} title={tip}>
        {slot.name}
      </span>
    );
  }
  return (
    <span className={`truncate ${className}`} title={tip}>
      {slot.name}
    </span>
  );
}

/** Fixed dimensions — every match card is identical across rounds */
const CARD_W = 252;
const CARD_H = 124;
const SLOT_H = 156;
const CONNECTOR_W = 56;
const HEADER_H = 52;
const ROUND_GAP = 8;

type RoundTheme = {
  header: string;
  headerGlow: string;
  card: string;
  connector: string;
  connectorDone: string;
  column: string;
  stageNum: string;
};

const ROUND_THEMES: RoundTheme[] = [
  {
    header: "bg-gradient-to-r from-tw-teal/20 to-accent-teal/15 text-tw-purple dark:text-tw-teal border-tw-teal/40",
    headerGlow: "shadow-tw-teal/20",
    card: "hover:border-tw-teal/50",
    connector: "stroke-tw-teal/45 dark:stroke-tw-teal/30",
    connectorDone: "stroke-tw-teal dark:stroke-tw-teal",
    column: "from-tw-teal/8 via-white/50 to-transparent dark:from-tw-teal/10",
    stageNum: "text-tw-teal",
  },
  {
    header: "bg-gradient-to-r from-tw-purple/15 to-tw-violet/15 text-tw-purple dark:text-tw-violet border-tw-purple/35",
    headerGlow: "shadow-tw-purple/15",
    card: "hover:border-tw-purple/45",
    connector: "stroke-tw-purple/40 dark:stroke-tw-violet/30",
    connectorDone: "stroke-tw-teal dark:stroke-tw-teal",
    column: "from-tw-purple/8 via-white/50 to-transparent dark:from-tw-purple/10",
    stageNum: "text-tw-purple",
  },
  {
    header: "bg-gradient-to-r from-tw-magenta/15 to-tw-coral/10 text-tw-magenta dark:text-tw-coral border-tw-magenta/35",
    headerGlow: "shadow-tw-magenta/15",
    card: "hover:border-tw-magenta/45",
    connector: "stroke-tw-magenta/40 dark:stroke-tw-magenta/30",
    connectorDone: "stroke-tw-teal dark:stroke-tw-teal",
    column: "from-tw-magenta/8 via-white/50 to-transparent dark:from-tw-magenta/10",
    stageNum: "text-tw-magenta",
  },
  {
    header: "bg-gradient-to-r from-accent-gold/25 to-tw-coral/15 text-board-dark dark:text-accent-gold border-accent-gold/50",
    headerGlow: "shadow-accent-gold/25",
    card: "hover:border-accent-gold/55",
    connector: "stroke-accent-gold/45",
    connectorDone: "stroke-accent-gold",
    column: "from-accent-gold/12 via-white/50 to-transparent dark:from-accent-gold/10",
    stageNum: "text-accent-gold",
  },
];

const PLAYOFF_THEME: RoundTheme = {
  header: "bg-gradient-to-r from-tw-magenta/20 to-tw-purple/15 text-tw-magenta dark:text-tw-violet border-tw-magenta/35",
  headerGlow: "shadow-tw-magenta/15",
  card: "hover:border-tw-magenta/45",
  connector: "stroke-tw-magenta/45 dark:stroke-tw-violet/35",
  connectorDone: "stroke-tw-teal dark:stroke-tw-teal",
  column: "from-tw-magenta/8 via-white/50 to-transparent dark:from-tw-magenta/10",
  stageNum: "text-tw-magenta",
};

function matchCenterY(roundIdx: number, matchIdx: number): number {
  const step = Math.pow(2, roundIdx);
  const top = matchIdx * step * SLOT_H + (step * SLOT_H - CARD_H) / 2;
  return top + CARD_H / 2;
}

function StatusBadge({ status }: { status: KnockoutMatchState["status"] }) {
  if (status === "Completed") {
    return (
      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[8px] font-bold uppercase tracking-wide bg-tw-teal/20 text-tw-purple dark:text-tw-teal border border-tw-teal/40 shrink-0">
        <CheckCircle2 className="w-2.5 h-2.5" />
        Won
      </span>
    );
  }
  if (status === "Live") {
    return (
      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[8px] font-bold uppercase tracking-wide bg-tw-coral text-white shrink-0 animate-pulse-soft shadow-sm shadow-tw-coral/30">
        <Radio className="w-2.5 h-2.5" />
        Live
      </span>
    );
  }
  return null;
}

function PlayerRow({
  slot,
  boards,
  showScore,
  won,
  side,
}: {
  slot: { name: string; employeeId?: string | null };
  boards: number;
  showScore: boolean;
  won: boolean;
  side: "A" | "B";
}) {
  return (
    <div
      className={`flex items-center gap-1.5 rounded-md px-2 py-1 min-h-[26px] min-w-0 border transition-colors duration-300 ${
        won
          ? "bg-gradient-to-r from-tw-teal/25 to-tw-teal/10 border-tw-teal/50 text-tw-purple dark:text-tw-teal font-semibold shadow-sm shadow-tw-teal/10"
          : side === "A"
            ? "bg-tw-teal/5 border-transparent dark:bg-tw-teal/10"
            : "bg-tw-magenta/5 border-transparent dark:bg-tw-magenta/10"
      }`}
    >
      {won && <Crown className="w-3 h-3 text-accent-gold shrink-0" />}
      <KnockoutPlayerName
        slot={slot}
        className={`flex-1 min-w-0 text-[11px] leading-tight ${won ? "font-semibold" : "font-medium text-slate-800 dark:text-slate-100"}`}
      />
      {showScore && (
        <span className="text-[11px] font-bold text-tw-purple dark:text-tw-teal tabular-nums shrink-0 w-4 text-right">
          {boards}
        </span>
      )}
    </div>
  );
}

function KnockoutMatchChip({
  match,
  selected,
  onSelect,
  theme,
  showBestOf = true,
}: {
  match: ResolvedKnockoutMatch;
  selected: boolean;
  onSelect: () => void;
  theme: RoundTheme;
  showBestOf?: boolean;
}) {
  const { state } = match;
  const live = state.status === "Live";
  const done = state.status === "Completed";
  const isFinal =
    match.id.endsWith("-final") || match.id === "ws-final";

  return (
    <motion.button
      type="button"
      onClick={onSelect}
      layout
      initial={false}
      whileHover={{ y: -2, transition: { duration: 0.2 } }}
      whileTap={{ scale: 0.98 }}
      style={{ width: CARD_W, height: CARD_H }}
      className={`group tw-match-card flex flex-col overflow-hidden border-2 text-left px-2.5 py-2 ${
        selected
          ? "border-tw-teal shadow-lg shadow-tw-teal/25 bg-gradient-to-br from-tw-teal/15 to-tw-purple/5 ring-2 ring-tw-teal/25 z-10 relative"
          : live
            ? "border-tw-coral/70 bg-gradient-to-br from-tw-coral/10 to-transparent shadow-md shadow-tw-coral/15"
            : done
              ? "border-tw-teal/50 bg-gradient-to-br from-tw-teal/8 to-transparent"
              : isFinal
                ? "border-accent-gold/55 bg-gradient-to-br from-accent-gold/15 via-white to-tw-coral/5 dark:from-accent-gold/10"
                : `border-tw-purple/15 dark:border-tw-teal/20 ${theme.card}`
      } ${!match.ready ? "opacity-50" : ""}`}
    >
      {/* Header */}
      <div className="flex items-center gap-1.5 mb-1 min-h-[18px] shrink-0">
        {isFinal && <Trophy className="w-3 h-3 text-accent-gold shrink-0" />}
        <p
          className="flex-1 min-w-0 text-[9px] font-semibold uppercase tracking-wide text-tw-purple/60 dark:text-tw-teal/80 truncate"
          title={match.label}
        >
          {match.label}
        </p>
        <StatusBadge status={state.status} />
      </div>

      {/* Players */}
      <div className="flex-1 flex flex-col justify-center gap-0.5 min-h-0 overflow-hidden">
        <PlayerRow
          slot={match.resolvedA}
          boards={state.boardsA}
          showScore={state.boardsA > 0 || done}
          won={state.winnerSide === "A"}
          side="A"
        />
        <p className="text-center text-[9px] font-bold text-tw-magenta/70 dark:text-tw-teal/80 leading-none py-0.5 shrink-0">
          vs
        </p>
        <PlayerRow
          slot={match.resolvedB}
          boards={state.boardsB}
          showScore={state.boardsB > 0 || done}
          won={state.winnerSide === "B"}
          side="B"
        />
      </div>

      {/* Footer */}
      {showBestOf ? (
        <p className="text-[8px] text-tw-purple/40 dark:text-slate-500 text-center mt-1 shrink-0 truncate px-1">
          {formatLabel(match.format)}
        </p>
      ) : null}
    </motion.button>
  );
}

function RoundHeader({
  label,
  theme,
  highlight,
  stage,
  formatHint,
}: {
  label: string;
  theme: RoundTheme;
  highlight?: boolean;
  stage?: number;
  formatHint?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center shrink-0 gap-0.5 px-1" style={{ minHeight: HEADER_H }}>
      {stage !== undefined && (
        <span className={`text-[8px] font-bold uppercase tracking-widest ${theme.stageNum}`}>
          Stage {stage}
        </span>
      )}
      <span
        className={`px-3.5 py-1.5 rounded-full text-[9px] font-bold uppercase tracking-wider whitespace-nowrap border shadow-sm ${theme.header} ${theme.headerGlow}`}
      >
        {highlight && <Trophy className="inline w-3 h-3 mr-0.5 -mt-px text-accent-gold" />}
        {label}
      </span>
      {formatHint ? (
        <span className="text-[7px] font-medium text-slate-500 dark:text-slate-400 text-center leading-tight max-w-[236px]">
          {formatHint}
        </span>
      ) : null}
    </div>
  );
}

function BracketConnector({
  roundIdx,
  prevMatchIds,
  nextMatchCount,
  matchesById,
  bracketH,
  theme,
}: {
  roundIdx: number;
  prevMatchIds: string[];
  nextMatchCount: number;
  matchesById: Map<string, ResolvedKnockoutMatch>;
  bracketH: number;
  theme: RoundTheme;
}) {
  const ratio = prevMatchIds.length / nextMatchCount;
  const forkX = CONNECTOR_W * 0.38;
  const endX = CONNECTOR_W - 4;
  const paths: { d: string; done: boolean }[] = [];

  for (let j = 0; j < nextMatchCount; j++) {
    const parentStart = j * ratio;
    const parentYs = Array.from({ length: ratio }, (_, k) =>
      matchCenterY(roundIdx, parentStart + k),
    );
    const yNext = matchCenterY(roundIdx + 1, j);
    const yMin = Math.min(...parentYs);
    const yMax = Math.max(...parentYs);
    const allDone = Array.from({ length: ratio }, (_, k) => parentStart + k).every(
      (idx) => matchesById.get(prevMatchIds[idx])?.state.status === "Completed",
    );

    for (const y of parentYs) {
      paths.push({ d: `M 0 ${y} H ${forkX}`, done: allDone });
    }
    if (ratio > 1) {
      paths.push({ d: `M ${forkX} ${yMin} V ${yMax}`, done: allDone });
    }
    paths.push({
      d: `M ${forkX} ${yNext} H ${endX - 5} M ${endX - 10} ${yNext - 3.5} L ${endX} ${yNext} L ${endX - 10} ${yNext + 3.5}`,
      done: allDone,
    });
  }

  return (
    <svg
      width={CONNECTOR_W}
      height={bracketH}
      viewBox={`0 0 ${CONNECTOR_W} ${bracketH}`}
      className="shrink-0"
      aria-hidden
    >
      <defs>
        <linearGradient id="tw-connector-active" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#47cfbb" />
          <stop offset="100%" stopColor="#a2186d" />
        </linearGradient>
      </defs>
      {paths.map((p, i) => (
        <path
          key={i}
          d={p.d}
          fill="none"
          className={p.done ? undefined : theme.connector}
          stroke={p.done ? "url(#tw-connector-active)" : undefined}
          strokeWidth={p.done ? 2.25 : 1.75}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={p.done ? { filter: "drop-shadow(0 0 3px rgba(71,207,187,0.4))" } : undefined}
        />
      ))}
    </svg>
  );
}

function BracketScaleFit({ children }: { children: ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState({ scale: 1, w: 0, h: 0 });

  useLayoutEffect(() => {
    const container = containerRef.current;
    const content = contentRef.current;
    if (!container || !content) return;

    const update = () => {
      const w = content.scrollWidth;
      const h = content.scrollHeight;
      const available = container.clientWidth;
      const scale = w > 0 ? Math.min(1, available / w) : 1;
      setLayout({ scale, w, h });
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(container);
    ro.observe(content);
    return () => ro.disconnect();
  }, [children]);

  return (
    <div ref={containerRef} className="w-full overflow-hidden">
      <div
        className="mx-auto"
        style={{
          width: layout.w > 0 ? layout.w * layout.scale : undefined,
          height: layout.h > 0 ? layout.h * layout.scale : undefined,
        }}
      >
        <div
          ref={contentRef}
          className="w-max"
          style={{
            transform: layout.scale < 1 ? `scale(${layout.scale})` : undefined,
            transformOrigin: "top left",
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

function BracketShell({ children, legend }: { children: ReactNode; legend?: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: "easeOut" }}
      className="tw-bracket-shell board-pattern p-4 sm:p-8 w-full mx-auto overflow-hidden"
    >
      <BracketScaleFit>{children}</BracketScaleFit>
        {legend !== false && (
          <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 mt-6 pt-5 border-t border-tw-purple/10 dark:border-tw-teal/15">
            <LegendItem color="bg-tw-purple/40" label="Upcoming" />
            <LegendItem color="bg-tw-coral animate-pulse-soft" label="Live" />
            <LegendItem color="bg-tw-teal" label="Qualified" />
            <LegendItem color="bg-accent-gold" label="Championship" />
          </div>
        )}
      </motion.div>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-500">
      <span className={`w-2 h-2 rounded-full ${color}`} />
      {label}
    </span>
  );
}

function TournamentBracket({
  roundLabels,
  roundMatchIds,
  stageFormats,
  matches,
  selectedId,
  onSelect,
  showBestOf = true,
}: {
  roundLabels: string[];
  roundMatchIds: string[][];
  stageFormats: string[];
  matches: ResolvedKnockoutMatch[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  showBestOf?: boolean;
}) {
  const byId = useMemo(() => new Map(matches.map((m) => [m.id, m])), [matches]);
  const leafCount = roundMatchIds[0]?.length ?? 1;
  const bracketH = leafCount * SLOT_H;

  return (
    <BracketShell>
      <div className="flex items-start" style={{ gap: ROUND_GAP }}>
        {roundMatchIds.map((ids, roundIdx) => {
          const isLast = roundIdx === roundMatchIds.length - 1;
          const step = Math.pow(2, roundIdx);
          const theme = ROUND_THEMES[roundIdx] ?? ROUND_THEMES[0];

          return (
            <motion.div
              key={roundLabels[roundIdx]}
              className="flex items-start"
              style={{ gap: ROUND_GAP }}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: roundIdx * 0.08, duration: 0.4 }}
            >
              <div
                className={`shrink-0 tw-stage-column bg-gradient-to-b ${theme.column} to-transparent px-1 py-1`}
                style={{ width: CARD_W + 8 }}
              >
                <RoundHeader
                  label={roundLabels[roundIdx]}
                  theme={theme}
                  highlight={isLast}
                  stage={roundIdx + 1}
                  formatHint={stageFormats[roundIdx]}
                />
                <div className="relative" style={{ height: bracketH, width: CARD_W + 4 }}>
                  {ids.map((id, matchIdx) => {
                    const match = byId.get(id);
                    if (!match) return null;
                    const top = matchIdx * step * SLOT_H + (step * SLOT_H - CARD_H) / 2;
                    return (
                      <motion.div
                        key={id}
                        className="absolute left-1"
                        style={{ top, width: CARD_W, height: CARD_H }}
                        initial={{ opacity: 0, scale: 0.92 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: roundIdx * 0.05 + matchIdx * 0.03 }}
                      >
                        <KnockoutMatchChip
                          match={match}
                          selected={selectedId === id}
                          onSelect={() => onSelect(id)}
                          theme={theme}
                          showBestOf={showBestOf}
                        />
                      </motion.div>
                    );
                  })}
                </div>
              </div>

              {!isLast && (
                <div className="shrink-0 flex flex-col" style={{ width: CONNECTOR_W }}>
                  <div style={{ height: HEADER_H }} />
                  <BracketConnector
                    roundIdx={roundIdx}
                    prevMatchIds={ids}
                    nextMatchCount={roundMatchIds[roundIdx + 1].length}
                    matchesById={byId}
                    bracketH={bracketH}
                    theme={theme}
                  />
                </div>
              )}
            </motion.div>
          );
        })}
      </div>
    </BracketShell>
  );
}

function msR1NodeId(gA: string, gB: string, leg: 1 | 2) {
  return `ms-r1-${gA.replace(/\s/g, "")}-${gB.replace(/\s/g, "")}-${leg}`;
}

const MENS_R1_DISPLAY_ORDER = [
  msR1NodeId("Group A", "Group B", 1),
  msR1NodeId("Group C", "Group D", 1),
  msR1NodeId("Group A", "Group B", 2),
  msR1NodeId("Group C", "Group D", 2),
  msR1NodeId("Group E", "Group F", 1),
  msR1NodeId("Group G", "Group H", 1),
  msR1NodeId("Group E", "Group F", 2),
  msR1NodeId("Group G", "Group H", 2),
] as const;

export function MensKnockoutFlowchart({
  matches,
  selectedId,
  onSelect,
}: {
  matches: ResolvedKnockoutMatch[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <TournamentBracket
      roundLabels={["Round 1", "Quarterfinals", "Semifinals", "Championship"]}
      stageFormats={[
        "Best of 3 boards",
        "Best of 3 boards",
        "Best of 5 boards",
        "25 points or 8 boards",
      ]}
      roundMatchIds={[
        [...MENS_R1_DISPLAY_ORDER],
        ["ms-r2-ab-cd-1", "ms-r2-ab-cd-2", "ms-r2-ef-gh-1", "ms-r2-ef-gh-2"],
        ["ms-sf-1", "ms-sf-2"],
        ["ms-final"],
      ]}
      matches={matches}
      selectedId={selectedId}
      onSelect={onSelect}
    />
  );
}

export function MensDoublesKnockoutFlowchart({
  matches,
  selectedId,
  onSelect,
}: {
  matches: ResolvedKnockoutMatch[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <TournamentBracket
      roundLabels={["Round 1", "Semifinals", "Championship"]}
      stageFormats={[
        "Best of 3 boards",
        "Best of 5 boards",
        "25 points or 8 boards",
      ]}
      roundMatchIds={[
        [
          mdR1NodeId("Group A", "Group B", 1),
          mdR1NodeId("Group C", "Group D", 1),
          mdR1NodeId("Group A", "Group B", 2),
          mdR1NodeId("Group C", "Group D", 2),
        ],
        ["md-r2-ab-cd-1", "md-r2-ab-cd-2"],
        ["md-final"],
      ]}
      matches={matches}
      selectedId={selectedId}
      onSelect={onSelect}
      showBestOf={false}
    />
  );
}

function mdR1NodeId(gA: string, gB: string, leg: 1 | 2) {
  return `md-r1-${gA.replace(/\s/g, "")}-${gB.replace(/\s/g, "")}-${leg}`;
}

/* ─── Women's IPL playoff (column layout + bracket connectors) ─── */

const WS_BOX_H = HEADER_H + CARD_H;
const WS_SLOT_H = WS_BOX_H + 40;
/** Extra drop so Qualifier 2 header clears the Q1→Final bypass line */
const WS_Q2_DROP = 24;

function wsCardCenterY(blockTop: number) {
  return blockTop + HEADER_H + CARD_H / 2;
}

function wsBracketLayout() {
  const bracketH = WS_SLOT_H + WS_BOX_H;
  const q1Top = 0;
  const elimTop = WS_SLOT_H;
  const yQ1 = wsCardCenterY(q1Top);
  const yElim = wsCardCenterY(elimTop);
  const yQ2 = (yQ1 + yElim) / 2 + WS_Q2_DROP;
  const q2Top = yQ2 - (HEADER_H + CARD_H / 2);
  /** Shared Y for Q1 winner bypass — straight horizontal into Final (upper slot) */
  const yBypass = HEADER_H + 30;
  const loserY = q1Top + HEADER_H + CARD_H - 22;
  /** Q2 winner enters Final lower slot */
  const yFinalQ2 = HEADER_H + CARD_H - 30;
  const finalColLeft =
    CARD_W + ROUND_GAP + CONNECTOR_W + ROUND_GAP + CARD_W + ROUND_GAP + CONNECTOR_W + ROUND_GAP;
  const totalW = finalColLeft + CARD_W;
  return {
    bracketH,
    yQ1,
    yElim,
    yQ2,
    yBypass,
    loserY,
    yFinalQ2,
    q2Top,
    finalColLeft,
    totalW,
  };
}

function WsSvgConnector({
  width,
  height,
  paths,
  theme,
}: {
  width: number;
  height: number;
  paths: { d: string; done: boolean }[];
  theme: RoundTheme;
}) {
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="shrink-0"
      aria-hidden
    >
      <defs>
        <linearGradient id="ws-conn-active" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#47cfbb" />
          <stop offset="100%" stopColor="#a2186d" />
        </linearGradient>
      </defs>
      {paths.map((p, i) => (
        <path
          key={i}
          d={p.d}
          fill="none"
          className={p.done ? undefined : theme.connector}
          stroke={p.done ? "url(#ws-conn-active)" : undefined}
          strokeWidth={p.done ? 2.25 : 1.75}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={p.done ? { filter: "drop-shadow(0 0 3px rgba(71,207,187,0.4))" } : undefined}
        />
      ))}
    </svg>
  );
}

function WsMergeConnector({
  yLoser,
  yElim,
  yQ2,
  height,
  q1Done,
  elimDone,
}: {
  yLoser: number;
  yElim: number;
  yQ2: number;
  height: number;
  q1Done: boolean;
  elimDone: boolean;
}) {
  const forkX = CONNECTOR_W * 0.42;
  const endX = CONNECTOR_W - 4;
  const mergeDone = q1Done || elimDone;
  const paths = [
    { d: `M 0 ${yLoser} H ${forkX}`, done: q1Done },
    { d: `M 0 ${yElim} H ${forkX}`, done: elimDone },
    { d: `M ${forkX} ${yLoser} V ${yElim}`, done: mergeDone },
    {
      d: `M ${forkX} ${yQ2} H ${endX - 5} M ${endX - 10} ${yQ2 - 3.5} L ${endX} ${yQ2} L ${endX - 10} ${yQ2 + 3.5}`,
      done: mergeDone,
    },
  ];
  return <WsSvgConnector width={CONNECTOR_W} height={height} paths={paths} theme={PLAYOFF_THEME} />;
}

function WsToFinalConnector({
  yQ2,
  yFinalEntry,
  height,
  q2Done,
}: {
  yQ2: number;
  yFinalEntry: number;
  height: number;
  q2Done: boolean;
}) {
  const forkX = CONNECTOR_W * 0.38;
  const endX = CONNECTOR_W - 4;
  const paths = [
    { d: `M 0 ${yQ2} H ${forkX} V ${yFinalEntry}`, done: q2Done },
    {
      d: `M ${forkX} ${yFinalEntry} H ${endX - 5} M ${endX - 10} ${yFinalEntry - 3.5} L ${endX} ${yFinalEntry} L ${endX - 10} ${yFinalEntry + 3.5}`,
      done: q2Done,
    },
  ];
  return <WsSvgConnector width={CONNECTOR_W} height={height} paths={paths} theme={PLAYOFF_THEME} />;
}

function WsBypassRail({
  fromX,
  toX,
  y,
  height,
  done,
}: {
  fromX: number;
  toX: number;
  y: number;
  height: number;
  done: boolean;
}) {
  const endX = toX - 4;
  return (
    <svg
      className="absolute top-0 left-0 pointer-events-none z-[1]"
      width={toX + 8}
      height={height}
      aria-hidden
    >
      <defs>
        <linearGradient id="ws-bypass-active" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#47cfbb" />
          <stop offset="100%" stopColor="#d4a853" />
        </linearGradient>
      </defs>
      <path
        d={`M ${fromX} ${y} H ${endX - 5} M ${endX - 10} ${y - 3.5} L ${endX} ${y} L ${endX - 10} ${y + 3.5}`}
        fill="none"
        className={done ? undefined : PLAYOFF_THEME.connector}
        stroke={done ? "url(#ws-bypass-active)" : undefined}
        strokeWidth={done ? 2.25 : 1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={done ? { filter: "drop-shadow(0 0 4px rgba(212,168,83,0.45))" } : undefined}
      />
    </svg>
  );
}

function WsStackedMatch({
  top,
  label,
  hint,
  formatHint,
  theme,
  highlight,
  children,
}: {
  top: number;
  label: string;
  hint?: string;
  formatHint?: string;
  theme: RoundTheme;
  highlight?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="absolute left-0 w-full" style={{ top, width: CARD_W }}>
      <RoundHeader label={label} theme={theme} highlight={highlight} formatHint={formatHint} />
      {children}
      {hint && (
        <p className="text-[9px] text-center text-slate-400 mt-1.5 leading-snug px-1">{hint}</p>
      )}
    </div>
  );
}

function WomensMatchSlot({
  label,
  hint,
  theme,
  highlight,
  children,
}: {
  label: string;
  hint?: string;
  theme: RoundTheme;
  highlight?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center shrink-0" style={{ width: CARD_W }}>
      <RoundHeader label={label} theme={theme} highlight={highlight} />
      {children}
      {hint && (
        <p className="text-[9px] text-center text-slate-400 mt-1.5 leading-snug px-1">{hint}</p>
      )}
    </div>
  );
}

function WomensMobileStep({
  label,
  hint,
  theme,
  highlight,
  children,
  showArrow,
}: {
  label: string;
  hint?: string;
  theme: RoundTheme;
  highlight?: boolean;
  children: ReactNode;
  showArrow?: boolean;
}) {
  return (
    <div className="w-full max-w-sm mx-auto">
      <WomensMatchSlot label={label} hint={hint} theme={theme} highlight={highlight}>
        {children}
      </WomensMatchSlot>
      {showArrow && (
        <div className="flex justify-center py-3">
          <svg width="20" height="28" viewBox="0 0 20 28" className="stroke-tw-magenta/50 dark:stroke-tw-teal/50">
            <path
              d="M10 2 V20 M5 15 L10 22 L15 15"
              fill="none"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      )}
    </div>
  );
}

export function WomensKnockoutFlowchart({
  matches,
  selectedId,
  onSelect,
}: {
  matches: ResolvedKnockoutMatch[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const byId = useMemo(() => new Map(matches.map((m) => [m.id, m])), [matches]);

  const chip = (id: string) => {
    const match = byId.get(id);
    if (!match) return null;
    return (
      <KnockoutMatchChip
        match={match}
        selected={selectedId === id}
        onSelect={() => onSelect(id)}
        theme={PLAYOFF_THEME}
        showBestOf={false}
      />
    );
  };

  const matchFormat = (id: string) => formatLabel(byId.get(id)?.format ?? { type: "best-of", boards: 3 });

  const q1Done = byId.get("ws-q1")?.state.status === "Completed";
  const elimDone = byId.get("ws-elim")?.state.status === "Completed";
  const q2Done = byId.get("ws-q2")?.state.status === "Completed";

  const layout = useMemo(() => wsBracketLayout(), []);

  return (
    <BracketShell>
      {/* Desktop / tablet — column bracket (scales via BracketShell) */}
      <div
        className="hidden md:block relative mx-auto"
        style={{ width: layout.totalW, minHeight: layout.bracketH + 28 }}
      >
        <WsBypassRail
          fromX={CARD_W}
          toX={layout.finalColLeft}
          y={layout.yBypass}
          height={layout.bracketH}
          done={!!q1Done}
        />

        <div className="relative z-[2] flex items-start" style={{ gap: ROUND_GAP }}>
          <div className="relative shrink-0" style={{ width: CARD_W, height: layout.bracketH }}>
            <WsStackedMatch
              top={0}
              label="Qualifier 1"
              hint="Winner → Final"
              formatHint={matchFormat("ws-q1")}
              theme={PLAYOFF_THEME}
            >
              {chip("ws-q1")}
            </WsStackedMatch>
            <WsStackedMatch
              top={WS_SLOT_H}
              label="Eliminator"
              hint="3rd vs 4th"
              formatHint={matchFormat("ws-elim")}
              theme={PLAYOFF_THEME}
            >
              {chip("ws-elim")}
            </WsStackedMatch>
          </div>

          <WsMergeConnector
            yLoser={layout.loserY}
            yElim={layout.yElim}
            yQ2={layout.yQ2}
            height={layout.bracketH}
            q1Done={!!q1Done}
            elimDone={!!elimDone}
          />

          <div className="relative shrink-0" style={{ width: CARD_W, height: layout.bracketH }}>
            <WsStackedMatch
              top={layout.q2Top}
              label="Qualifier 2"
              hint="Q1 loser vs Elim winner"
              formatHint={matchFormat("ws-q2")}
              theme={PLAYOFF_THEME}
            >
              {chip("ws-q2")}
            </WsStackedMatch>
          </div>

          <WsToFinalConnector
            yQ2={layout.yQ2}
            yFinalEntry={layout.yFinalQ2}
            height={layout.bracketH}
            q2Done={!!q2Done}
          />

          <div className="relative shrink-0" style={{ width: CARD_W, height: layout.bracketH }}>
            <WsStackedMatch
              top={0}
              label="Championship"
              hint="Q1 winner vs Q2 winner"
              formatHint={matchFormat("ws-final")}
              theme={ROUND_THEMES[3]}
              highlight
            >
              {chip("ws-final")}
            </WsStackedMatch>
          </div>
        </div>
      </div>

      {/* Mobile: vertical flow */}
      <div className="md:hidden flex flex-col">
        <WomensMobileStep label="Qualifier 1" hint="Winner → Final" theme={PLAYOFF_THEME} showArrow>
          {chip("ws-q1")}
        </WomensMobileStep>
        <WomensMobileStep label="Eliminator" hint="3rd vs 4th" theme={PLAYOFF_THEME} showArrow>
          {chip("ws-elim")}
        </WomensMobileStep>
        <WomensMobileStep label="Qualifier 2" hint="Q1 loser vs Elim winner" theme={PLAYOFF_THEME} showArrow>
          {chip("ws-q2")}
        </WomensMobileStep>
        <WomensMobileStep label="Championship" hint="Q1 winner vs Q2 winner" theme={ROUND_THEMES[3]} highlight>
          {chip("ws-final")}
        </WomensMobileStep>
      </div>
    </BracketShell>
  );
}
