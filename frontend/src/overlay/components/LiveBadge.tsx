export function LiveBadge() {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-600 border border-red-400/50 text-white text-[0.65rem] font-bold tracking-[0.1em] uppercase overlay-live-pulse">
      <span aria-hidden>🔴</span>
      LIVE
    </span>
  );
}
