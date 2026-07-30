import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ExternalLink, Radio, Trophy, Youtube } from "lucide-react";
import { api, type ApiFinalsSettings } from "../lib/api";
import { useSupabase } from "../lib/config";
import {
  FINALS_PHOTOS,
  finalsPhotoUrl,
  photosForSlot,
  youtubeEmbedUrl,
  type FinalsPhoto,
  type FinalsPhotoSection,
} from "../lib/finals-content";
import {
  resolveFinalsScoreDisplay,
  boardStatusLabel,
  finalsFormatLabel,
} from "../lib/finals-scoring";
import {
  resolveKnockoutBracket,
  type KnockoutMatchState,
  type KnockoutStateMap,
  type ResolvedKnockoutMatch,
} from "../lib/knockout-state";
import {
  buildMensDoublesKnockout,
  buildMensSinglesKnockout,
  buildWomensSinglesKnockout,
} from "../lib/knockouts";
import type { CategoryData } from "../lib/tournament";
import { loadFinalsSettings, saveFinalsSettings } from "../lib/finals-storage";
import { KnockoutMatchDetailPanel } from "./KnockoutMatchDetail";
import { BoardWinDots } from "./BoardWinDots";
import { supabase } from "../lib/supabase";

const FINAL_MATCH_TABS = [
  {
    section: "mens-singles-final" as const,
    label: "Men's Singles",
    finalId: "ms-final",
    build: buildMensSinglesKnockout,
    category: "Men's Singles",
  },
  {
    section: "mens-doubles-final" as const,
    label: "Men's Doubles",
    finalId: "md-final",
    build: buildMensDoublesKnockout,
    category: "Men's Doubles",
  },
  {
    section: "womens-singles-final" as const,
    label: "Women's Singles",
    finalId: "ws-final",
    build: buildWomensSinglesKnockout,
    category: "Women's Singles",
  },
];

function scrollToLiveSection() {
  document.getElementById("finals-live")?.scrollIntoView({ behavior: "smooth" });
}

function SectionBlock({
  title,
  subtitle,
  children,
  id,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  id?: string;
}) {
  return (
    <div id={id} className="mb-16 last:mb-0 scroll-mt-24">
      <div className="mb-8">
        <h3 className="font-display text-2xl md:text-3xl font-bold text-tw-ink dark:text-white">
          {title}
        </h3>
        {subtitle ? (
          <p className="text-tw-purple/70 dark:text-slate-400 mt-2">{subtitle}</p>
        ) : null}
      </div>
      {children}
    </div>
  );
}

function PeoplePhotoGrid({ photos }: { photos: FinalsPhoto[] }) {
  if (photos.length === 0) {
    return (
      <p className="text-center text-slate-500 dark:text-slate-400 py-8 rounded-2xl border border-dashed border-tw-purple/20 dark:border-tw-teal/20">
        Photos will appear here once added to the repo.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-6">
      {photos.map((photo) => (
        <motion.div
          key={photo.file}
          whileHover={{ scale: 1.02 }}
          className="flex flex-col items-center text-center"
        >
          <div className="w-full aspect-square rounded-2xl overflow-hidden glass bg-white/60 dark:bg-slate-800/60 flex items-center justify-center p-3">
            <img
              src={finalsPhotoUrl(photo.file)}
              alt={photo.title ?? "Photo"}
              className="max-w-full max-h-full w-full h-full object-contain"
            />
          </div>
          {photo.title ? (
            <p className="mt-3 text-sm font-semibold text-tw-ink dark:text-white leading-snug">
              {photo.title}
            </p>
          ) : null}
        </motion.div>
      ))}
    </div>
  );
}

function PublicFinalScoreView({
  match,
  section,
  onGoToLive,
  isOnYoutubeLive,
}: {
  match: ResolvedKnockoutMatch;
  section: FinalsPhotoSection;
  onGoToLive: () => void;
  isOnYoutubeLive: boolean;
}) {
  const display = resolveFinalsScoreDisplay(match);
  const isLive = match.state.status === "Live" || isOnYoutubeLive;
  const isDoubles = section === "mens-doubles-final";

  const sides = (
    <>
      {(["A", "B"] as const).map((side) => {
        const slot = side === "A" ? match.resolvedA : match.resolvedB;
        const points = side === "A" ? display.pointsA : display.pointsB;
        const boardsWon = side === "A" ? display.boardsWonA : display.boardsWonB;
        const won = match.state.winnerSide === side;
        const photos = photosForSlot(section, slot.name, isDoubles);

        return (
          <div
            key={side}
            className={`p-5 rounded-2xl border-2 text-center ${
              won
                ? "border-yellow-400/60 bg-yellow-400/5"
                : side === "A"
                  ? "border-tw-teal/30 bg-tw-teal/5"
                  : "border-tw-magenta/30 bg-tw-magenta/5"
            }`}
          >
            {photos.length > 0 ? (
              <div
                className={`flex justify-center gap-3 mb-3 ${
                  photos.length > 1 ? "flex-wrap" : ""
                }`}
              >
                {photos.map((photo) => (
                  <img
                    key={photo.file}
                    src={finalsPhotoUrl(photo.file)}
                    alt=""
                    className="w-20 h-20 rounded-full object-cover border-2 border-white/20 shadow-md"
                  />
                ))}
              </div>
            ) : null}
            <p className="font-display text-lg md:text-xl font-bold text-tw-ink dark:text-white mb-3">
              {slot.name}
            </p>
            <p className="font-display text-5xl font-extrabold tabular-nums text-tw-purple dark:text-tw-teal">
              {points}
            </p>
            <p className="text-xs uppercase tracking-wider text-slate-500 mt-1">
              points
            </p>
            <p className="text-sm font-semibold text-slate-600 dark:text-slate-400 mt-2 tabular-nums">
              Boards won: {boardsWon}
            </p>
            <BoardWinDots won={boardsWon} side={side} />
          </div>
        );
      })}
    </>
  );

  const content = (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-center gap-3">
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide bg-accent-gold/20 text-yellow-700 dark:text-yellow-300 border border-yellow-500/30">
          <Trophy className="w-3.5 h-3.5" />
          Championship Final
        </span>
        <span
          className={`px-3 py-1 rounded-full text-xs font-bold uppercase ${
            isLive
              ? "bg-tw-coral text-white animate-pulse-soft"
              : match.state.status === "Completed"
                ? "bg-tw-teal/20 text-tw-purple dark:text-tw-teal"
                : "bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300"
          }`}
        >
          {match.state.status}
        </span>
        <span className="text-xs text-slate-500">{finalsFormatLabel()}</span>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">{sides}</div>

      <p className="text-center text-sm text-slate-600 dark:text-slate-400">
        {boardStatusLabel(display)} · Boards won {display.boardsWonA}–{display.boardsWonB} ·
        First to {display.pointsToWin} points
      </p>

      {isLive ? (
        <p className="text-center text-sm font-semibold text-tw-coral flex items-center justify-center gap-2">
          <Radio className="w-4 h-4" />
          Tap anywhere to watch YouTube live
        </p>
      ) : null}
    </div>
  );

  if (isLive) {
    return (
      <button
        type="button"
        onClick={onGoToLive}
        className="w-full glass rounded-2xl p-6 md:p-8 mb-6 text-left hover:ring-2 hover:ring-tw-coral/50 transition-all"
      >
        {content}
      </button>
    );
  }

  return <div className="glass rounded-2xl p-6 md:p-8 mb-6">{content}</div>;
}

function YouTubeLiveBlock({
  youtubeUrl,
  adminMode,
  youtubeInput,
  onYoutubeInputChange,
  onSave,
  onClear,
  busy,
}: {
  youtubeUrl: string | null;
  adminMode: boolean;
  youtubeInput: string;
  onYoutubeInputChange: (url: string) => void;
  onSave: () => void;
  onClear: () => void;
  busy: boolean;
}) {
  const url = youtubeUrl?.trim() ?? "";
  const embed = url ? youtubeEmbedUrl(url) : null;

  return (
    <SectionBlock
      id="finals-live"
      title="Live on YouTube"
      subtitle={
        url
          ? "Watch the championship final live"
          : "Stream appears here when admin adds a YouTube link"
      }
    >
      {adminMode ? (
        <div className="glass rounded-2xl p-5 mb-6 space-y-4 border border-tw-coral/20 max-w-4xl mx-auto">
          <label className="font-display font-bold text-tw-ink dark:text-white flex items-center gap-2">
            <Youtube className="w-5 h-5 text-red-500" />
            YouTube live link
          </label>
          <input
            type="url"
            value={youtubeInput}
            onChange={(e) => onYoutubeInputChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSave();
            }}
            placeholder="https://www.youtube.com/watch?v=..."
            className="w-full px-4 py-3 rounded-xl border border-tw-purple/20 dark:border-tw-teal/20 bg-white/80 dark:bg-slate-800/80 text-sm"
            disabled={busy}
          />
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={onSave}
              disabled={busy || !youtubeInput.trim()}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-semibold text-sm disabled:opacity-50"
            >
              Save
            </button>
            {url ? (
              <button
                type="button"
                onClick={onClear}
                disabled={busy}
                className="px-5 py-2.5 rounded-xl bg-slate-600 hover:bg-slate-500 text-white font-semibold text-sm disabled:opacity-50"
              >
                Remove
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {!url ? (
        <p className="text-center text-slate-500 dark:text-slate-400 py-8 rounded-2xl border border-dashed border-tw-purple/20 dark:border-tw-teal/20 max-w-4xl mx-auto">
          No live stream yet.
        </p>
      ) : embed ? (
        <div className="rounded-2xl overflow-hidden glass shadow-xl max-w-4xl mx-auto">
          <div className="aspect-video w-full bg-black">
            <iframe
              src={`${embed}?autoplay=1&rel=0&modestbranding=1`}
              title="YouTube live stream"
              className="w-full h-full border-0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-t border-white/10 dark:border-slate-700/50">
            <span className="inline-flex items-center gap-2 text-sm font-bold text-red-500 uppercase tracking-wide">
              <Radio className="w-4 h-4 animate-pulse" />
              Live
            </span>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-semibold text-sm transition-colors"
            >
              <Youtube className="w-4 h-4" />
              Open on YouTube
              <ExternalLink className="w-3.5 h-3.5 opacity-80" />
            </a>
          </div>
        </div>
      ) : (
        <div className="text-center glass rounded-2xl p-8 max-w-xl mx-auto">
          <p className="text-sm text-slate-500 mb-4">
            Could not embed this link. Use a watch URL like{" "}
            <code className="text-xs">youtube.com/watch?v=...</code>
          </p>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-red-600 hover:bg-red-500 text-white font-semibold"
          >
            <Youtube className="w-5 h-5" />
            Open on YouTube
            <ExternalLink className="w-4 h-4" />
          </a>
        </div>
      )}
    </SectionBlock>
  );
}

export function FinalsSection({
  tournament,
  knockoutState,
  adminMode,
  onKnockoutUpdate,
  onKnockoutBoards,
  onKnockoutPoints,
  onKnockoutComplete,
}: {
  tournament: CategoryData[];
  knockoutState: KnockoutStateMap;
  adminMode: boolean;
  onKnockoutUpdate: (matchId: string, patch: Partial<KnockoutMatchState>) => void;
  onKnockoutBoards: (match: ResolvedKnockoutMatch, side: "A" | "B", delta: number) => void;
  onKnockoutPoints: (match: ResolvedKnockoutMatch, side: "A" | "B", delta: number) => void;
  onKnockoutComplete: (matchId: string, winnerSide: "A" | "B") => void;
}) {
  const [activeTab, setActiveTab] = useState(0);
  const [settings, setSettings] = useState<ApiFinalsSettings>({
    youtube_url: null,
    live_match_id: null,
    updated_at: new Date().toISOString(),
  });
  const [youtubeInput, setYoutubeInput] = useState("");
  const [busy, setBusy] = useState(false);

  const loadSettings = useCallback(async () => {
    const local = loadFinalsSettings();
    if (local.youtube_url) {
      setSettings(local);
      setYoutubeInput(local.youtube_url);
    }

    try {
      const remote = await api.getFinalsSettings();
      if (remote.youtube_url) {
        setSettings(remote);
        setYoutubeInput(remote.youtube_url);
        saveFinalsSettings(remote);
      } else if (!local.youtube_url) {
        setSettings(remote);
      }
    } catch (e) {
      console.error("Could not load finals YouTube settings:", e);
    }
  }, []);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    const sb = supabase;
    if (!useSupabase() || !sb) return;

    const channel = sb
      .channel("finals-settings-sync")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "finals_settings" },
        (payload) => {
          const row = payload.new as {
            youtube_url?: string | null;
            live_match_id?: string | null;
            updated_at?: string;
          };
          if (!row) return;
          const next = {
            youtube_url: row.youtube_url ?? null,
            live_match_id: row.live_match_id ?? null,
            updated_at: row.updated_at ?? new Date().toISOString(),
          };
          setSettings(next);
          saveFinalsSettings(next);
          if (row.youtube_url) setYoutubeInput(row.youtube_url);
        },
      )
      .subscribe();

    return () => {
      void sb.removeChannel(channel);
    };
  }, []);

  const resolvedFinals = useMemo(() => {
    return FINAL_MATCH_TABS.map((tab) => {
      const categoryData = tournament.find((c) => c.category === tab.category);
      const bracket = tab.build(categoryData);
      const resolved = resolveKnockoutBracket(bracket, knockoutState);
      return resolved.find((m) => m.id === tab.finalId) ?? null;
    });
  }, [tournament, knockoutState]);

  const activeConfig = FINAL_MATCH_TABS[activeTab];
  const activeMatch = resolvedFinals[activeTab];

  const savedYoutubeUrl = settings.youtube_url?.trim() ?? "";

  const applyYoutubeUrl = (url: string | null) => {
    const next: ApiFinalsSettings = {
      youtube_url: url,
      live_match_id: null,
      updated_at: new Date().toISOString(),
    };
    setSettings(next);
    setYoutubeInput(url ?? "");
    saveFinalsSettings(next);
  };

  const handleSaveYoutube = async () => {
    const url = youtubeInput.trim();
    if (!url) return;

    applyYoutubeUrl(url);
    setBusy(true);
    try {
      const updated = await api.updateFinalsSettings({ youtube_url: url });
      setSettings(updated);
      saveFinalsSettings(updated);
    } catch (e) {
      if (useSupabase()) {
        window.alert(
          e instanceof Error
            ? `${e.message}\n\nThe stream plays on this browser. Sign in as admin so all visitors see it.`
            : "Could not sync to server. Stream plays on this browser only.",
        );
      }
    } finally {
      setBusy(false);
    }
  };

  const handleClearYoutube = async () => {
    applyYoutubeUrl(null);
    setBusy(true);
    try {
      const updated = await api.updateFinalsSettings({ youtube_url: null });
      setSettings(updated);
      saveFinalsSettings(updated);
    } catch {
      /* local state already cleared */
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      id="finals"
      className="py-20 bg-gradient-to-b from-tw-purple/5 via-white to-tw-magenta/5 dark:from-slate-950 dark:via-slate-900 dark:to-tw-purple/10 border-y border-tw-purple/10 dark:border-tw-teal/10"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-14"
        >
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-yellow-400/20 to-tw-magenta/20 text-yellow-600 dark:text-yellow-400 mb-4 shadow-md">
            <Trophy className="w-7 h-7" />
          </div>
          <h2 className="font-display text-3xl md:text-4xl font-bold text-tw-ink dark:text-white mb-3">
            Championship Finals
          </h2>
          <p className="text-tw-purple/70 dark:text-slate-400 max-w-2xl mx-auto">
            Live scores and YouTube stream for the championship finals.
          </p>
        </motion.div>

        <SectionBlock
          title="Final Matches"
          subtitle={adminMode ? "Edit scores for each final" : "Live scores for each final"}
        >
          <div className="flex flex-wrap justify-center gap-3 mb-8">
            {FINAL_MATCH_TABS.map((tab, index) => (
              <button
                key={tab.section}
                type="button"
                onClick={() => setActiveTab(index)}
                className={`px-5 py-2.5 rounded-full text-sm font-semibold transition-all ${
                  activeTab === index
                    ? "bg-gradient-to-r from-tw-purple to-tw-magenta text-white shadow-lg"
                    : "glass text-tw-purple dark:text-slate-300 hover:bg-tw-teal/10"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {!activeMatch ? (
            <p className="text-slate-500 dark:text-slate-400 text-center py-6">
              Final match details will appear once players are confirmed.
            </p>
          ) : adminMode ? (
            <div className="glass rounded-2xl p-6 md:p-8 mb-6">
              <KnockoutMatchDetailPanel
                match={activeMatch}
                adminMode
                onUpdate={(patch) => onKnockoutUpdate(activeMatch.id, patch)}
                onBoards={(side, delta) => onKnockoutBoards(activeMatch, side, delta)}
                onPoints={(side, delta) => onKnockoutPoints(activeMatch, side, delta)}
                onComplete={(side) => onKnockoutComplete(activeMatch.id, side)}
              />
            </div>
          ) : (
            <PublicFinalScoreView
              match={activeMatch}
              section={activeConfig.section}
              onGoToLive={scrollToLiveSection}
              isOnYoutubeLive={Boolean(savedYoutubeUrl)}
            />
          )}

        </SectionBlock>

        <YouTubeLiveBlock
          youtubeUrl={settings.youtube_url}
          adminMode={adminMode}
          youtubeInput={youtubeInput}
          onYoutubeInputChange={setYoutubeInput}
          onSave={() => void handleSaveYoutube()}
          onClear={() => void handleClearYoutube()}
          busy={busy}
        />

        <SectionBlock
          title="Organisers"
          subtitle="The team behind Thoughtworks Hyderabad Carrom Championship 2026"
        >
          <PeoplePhotoGrid photos={FINALS_PHOTOS.organisers} />
        </SectionBlock>

        <SectionBlock
          title="Volunteers"
          subtitle="Cheers to our wonderful volunteers! 💙 You helped us strike the perfect shot and made the Carrom event a memorable success. Thank you!"
        >
          <PeoplePhotoGrid photos={FINALS_PHOTOS.volunteers} />
        </SectionBlock>
      </div>
    </section>
  );
}
