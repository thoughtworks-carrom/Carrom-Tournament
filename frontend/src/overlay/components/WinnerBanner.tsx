export function WinnerBanner() {
  return (
    <span className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-yellow-500/20 border border-yellow-400/60 text-yellow-300 text-sm font-bold tracking-[0.12em] uppercase overlay-winner-reveal shadow-md shadow-yellow-900/30">
      <span aria-hidden>🏆</span>
      WINNER
    </span>
  );
}
