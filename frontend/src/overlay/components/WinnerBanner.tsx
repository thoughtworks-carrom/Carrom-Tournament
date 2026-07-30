export function WinnerBanner() {
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-yellow-500/20 border border-yellow-400/60 text-yellow-300 text-[0.72rem] font-bold tracking-[0.1em] uppercase overlay-winner-reveal">
      <span aria-hidden>🏆</span>
      WINNER
    </span>
  );
}
