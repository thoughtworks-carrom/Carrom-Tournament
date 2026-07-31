import { FINALS_MAX_BOARDS } from "../lib/finals-scoring";

export function BoardWinDots({
  won,
  side,
  size = "md",
  compact = false,
}: {
  won: number;
  side: "A" | "B";
  size?: "sm" | "md";
  compact?: boolean;
}) {
  const dotSize = size === "sm" ? "w-2 h-2" : "w-2.5 h-2.5";
  const gap = size === "sm" ? "gap-1" : "gap-1.5";

  return (
    <div
      className={`flex justify-center ${gap} ${compact ? "mt-0.5" : "mt-3"}`}
      aria-label={`${won} boards won`}
    >
      {Array.from({ length: FINALS_MAX_BOARDS }, (_, i) => (
        <span
          key={i}
          className={`${dotSize} rounded-full ${
            i < won
              ? side === "A"
                ? "bg-tw-teal shadow-sm shadow-tw-teal/30"
                : "bg-tw-magenta shadow-sm shadow-tw-magenta/30"
              : "bg-slate-200 dark:bg-slate-700"
          }`}
        />
      ))}
    </div>
  );
}
