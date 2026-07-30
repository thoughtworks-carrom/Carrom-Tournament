export function LiveBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-red-600 border border-red-400/50 text-white text-sm font-bold tracking-[0.12em] uppercase overlay-live-pulse shadow-md shadow-red-900/40">
      <span aria-hidden>🔴</span>
      LIVE
    </span>
  );
}
