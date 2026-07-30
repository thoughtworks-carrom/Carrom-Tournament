export function LiveBadge() {
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-600 border border-red-400/50 text-white text-[0.72rem] font-bold tracking-[0.1em] uppercase overlay-live-pulse">
      <span aria-hidden>🔴</span>
      LIVE
    </span>
  );
}
