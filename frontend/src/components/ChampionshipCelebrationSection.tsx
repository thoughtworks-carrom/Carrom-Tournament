import { motion } from "framer-motion";
import { Award, Heart, Sparkles, Trophy } from "lucide-react";
import {
  FINALS_PHOTOS,
  finalsPhotoUrl,
  photosForSlot,
  splitTeamNames,
  type FinalsPhotoSection,
} from "../lib/finals-content";
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
import type { CategoryData } from "../lib/tournament";
import { PeoplePhotoGrid, SectionBlock } from "./PeoplePhotoGrid";

const CHAMPIONSHIP_FINALS = [
  {
    section: "womens-singles-final" as const,
    label: "Women's Singles",
    finalId: "ws-final",
    build: buildWomensSinglesKnockout,
    category: "Women's Singles",
    isDoubles: false,
  },
  {
    section: "mens-singles-final" as const,
    label: "Men's Singles",
    finalId: "ms-final",
    build: buildMensSinglesKnockout,
    category: "Men's Singles",
    isDoubles: false,
  },
  {
    section: "mens-doubles-final" as const,
    label: "Men's Doubles",
    finalId: "md-final",
    build: buildMensDoublesKnockout,
    category: "Men's Doubles",
    isDoubles: true,
  },
] as const;

function resolveFinalMatch(
  tournament: CategoryData[],
  knockoutState: KnockoutStateMap,
  config: (typeof CHAMPIONSHIP_FINALS)[number],
): ResolvedKnockoutMatch | null {
  const categoryData = tournament.find((c) => c.category === config.category);
  const bracket = config.build(categoryData);
  const resolved = resolveKnockoutBracket(bracket, knockoutState);
  return resolved.find((m) => m.id === config.finalId) ?? null;
}

function ParticipantPhotos({
  section,
  name,
  isDoubles,
  variant,
}: {
  section: FinalsPhotoSection;
  name: string;
  isDoubles: boolean;
  variant: "winner" | "runner";
}) {
  const photos = photosForSlot(section, name, isDoubles);
  const names = isDoubles ? splitTeamNames(name) : [name];
  const ringClass =
    variant === "winner"
      ? "ring-yellow-400/70 shadow-yellow-500/20"
      : "ring-slate-300/60 dark:ring-slate-500/50";

  if (photos.length === 0) {
    return (
      <div
        className={`w-28 h-28 md:w-32 md:h-32 rounded-full bg-slate-200/80 dark:bg-slate-700/80 flex items-center justify-center ring-4 ${ringClass}`}
      >
        <Trophy className="w-10 h-10 text-slate-400" />
      </div>
    );
  }

  return (
    <div className={`flex justify-center gap-3 ${photos.length > 1 ? "flex-wrap" : ""}`}>
      {photos.map((photo, index) => (
        <div key={photo.file} className="flex flex-col items-center">
          <img
            src={finalsPhotoUrl(photo.file)}
            alt={photo.title ?? names[index] ?? name}
            className={`w-28 h-28 md:w-32 md:h-32 rounded-full object-cover ring-4 ${ringClass} shadow-lg`}
          />
          {isDoubles && names[index] ? (
            <p className="mt-2 text-xs font-medium text-slate-600 dark:text-slate-300 text-center max-w-[7rem]">
              {names[index]}
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function CategoryPodium({
  config,
  match,
}: {
  config: (typeof CHAMPIONSHIP_FINALS)[number];
  match: ResolvedKnockoutMatch | null;
}) {
  const completed =
    match?.ready &&
    match.state.status === "Completed" &&
    match.state.winnerSide != null;

  const winnerSlot = completed
    ? match.state.winnerSide === "A"
      ? match.resolvedA
      : match.resolvedB
    : null;
  const runnerSlot = completed
    ? match.state.winnerSide === "A"
      ? match.resolvedB
      : match.resolvedA
    : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      className="glass rounded-3xl p-6 md:p-8 border border-tw-purple/10 dark:border-tw-teal/15"
    >
      <h4 className="font-display text-xl md:text-2xl font-bold text-center text-tw-ink dark:text-white mb-8">
        {config.label}
      </h4>

      {!completed || !winnerSlot || !runnerSlot ? (
        <p className="text-center text-slate-500 dark:text-slate-400 py-6">
          Final results will appear here once the championship match is completed.
        </p>
      ) : (
        <div className="grid sm:grid-cols-2 gap-6 md:gap-8">
          <div className="flex flex-col items-center text-center p-5 rounded-2xl bg-yellow-400/10 border-2 border-yellow-400/40">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide bg-yellow-400/25 text-yellow-800 dark:text-yellow-200 mb-4">
              <Trophy className="w-3.5 h-3.5" />
              Winner
            </span>
            <ParticipantPhotos
              section={config.section}
              name={winnerSlot.name}
              isDoubles={config.isDoubles}
              variant="winner"
            />
            <p className="mt-4 font-display text-lg font-bold text-tw-ink dark:text-white">
              {winnerSlot.name}
            </p>
          </div>

          <div className="flex flex-col items-center text-center p-5 rounded-2xl bg-slate-100/80 dark:bg-slate-800/50 border-2 border-slate-300/50 dark:border-slate-600/50">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide bg-slate-200/80 dark:bg-slate-700/80 text-slate-700 dark:text-slate-200 mb-4">
              <Award className="w-3.5 h-3.5" />
              Runner-up
            </span>
            <ParticipantPhotos
              section={config.section}
              name={runnerSlot.name}
              isDoubles={config.isDoubles}
              variant="runner"
            />
            <p className="mt-4 font-display text-lg font-bold text-tw-ink dark:text-white">
              {runnerSlot.name}
            </p>
          </div>
        </div>
      )}
    </motion.div>
  );
}

export function ChampionshipCelebrationSection({
  tournament,
  knockoutState,
}: {
  tournament: CategoryData[];
  knockoutState: KnockoutStateMap;
}) {
  const finals = CHAMPIONSHIP_FINALS.map((config) => ({
    config,
    match: resolveFinalMatch(tournament, knockoutState, config),
  }));

  return (
    <section
      id="celebration"
      className="py-20 bg-gradient-to-b from-yellow-400/8 via-white to-tw-teal/8 dark:from-slate-950 dark:via-slate-900 dark:to-tw-purple/10 border-b border-tw-purple/10 dark:border-tw-teal/10"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-14"
        >
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-yellow-400/25 to-tw-magenta/20 text-yellow-600 dark:text-yellow-400 mb-4 shadow-md">
            <Trophy className="w-7 h-7" />
          </div>
          <h2 className="font-display text-3xl md:text-4xl font-bold text-tw-ink dark:text-white mb-3">
            Champions &amp; Runners-up
          </h2>
          <p className="text-tw-purple/70 dark:text-slate-400 max-w-2xl mx-auto">
            Congratulations to our 2026 championship winners and everyone who made the finals unforgettable.
          </p>
        </motion.div>

        <div id="winners" className="scroll-mt-24 mb-16">
          <div className="grid lg:grid-cols-1 gap-8 max-w-4xl mx-auto">
            {finals.map(({ config, match }) => (
              <CategoryPodium key={config.finalId} config={config} match={match} />
            ))}
          </div>
        </div>

        <SectionBlock
          id="organisers"
          title="Organisers"
          subtitle="The team behind Thoughtworks Hyderabad Carrom Championship 2026"
        >
          <PeoplePhotoGrid photos={FINALS_PHOTOS.organisers} layout="row" />
        </SectionBlock>

        <SectionBlock
          id="volunteers"
          title="Volunteers"
          subtitle="Cheers to our wonderful volunteers! 💙 You helped us strike the perfect shot and made the Carrom event a memorable success. Thank you!"
        >
          <PeoplePhotoGrid photos={FINALS_PHOTOS.volunteers} />
        </SectionBlock>

        <SectionBlock
          id="admin-team"
          title="Admin Team"
          subtitle="Thank you for making this event possible."
        >
          <PeoplePhotoGrid photos={FINALS_PHOTOS["admin-team"]} layout="row" />
        </SectionBlock>

        <motion.div
          id="see-you-soon"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="scroll-mt-24 text-center py-12 px-6 rounded-3xl glass border border-tw-teal/20 dark:border-tw-purple/25 bg-gradient-to-br from-tw-teal/5 via-white/50 to-tw-magenta/5 dark:from-tw-teal/10 dark:via-slate-900/50 dark:to-tw-magenta/10"
        >
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-tw-teal/15 text-tw-teal dark:text-tw-teal mb-4">
            <Heart className="w-6 h-6" />
          </div>
          <h3 className="font-display text-2xl md:text-3xl font-bold text-tw-ink dark:text-white mb-3">
            See you soon at another tournament!
          </h3>
          <p className="text-slate-600 dark:text-slate-300 max-w-xl mx-auto flex items-center justify-center gap-2 flex-wrap">
            <Sparkles className="w-4 h-4 text-tw-magenta shrink-0" />
            Thank you for being part of Thoughtworks Hyderabad Carrom Championship 2026.
          </p>
        </motion.div>
      </div>
    </section>
  );
}
