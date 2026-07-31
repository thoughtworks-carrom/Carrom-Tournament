import { useEffect, useRef, useState } from "react";
import { BroadcastScoreBug } from "./components/BroadcastScoreBug";
import { useOverlayMatch } from "./useOverlayMatch";
import "./overlay.css";

function OverlayCanvas({ children }: { children: React.ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const updateScale = () => {
      const rw = root.clientWidth || window.innerWidth;
      setScale(Math.min(rw / 1920, 1));
    };

    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(root);
    window.addEventListener("resize", updateScale);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateScale);
    };
  }, []);

  return (
    <div ref={rootRef} className="overlay-root">
      <div
        className="overlay-canvas"
        style={{ transform: `translateX(-50%) scale(${scale})` }}
      >
        {children}
      </div>
    </div>
  );
}

function StatusScreen({ message }: { message: string }) {
  return (
    <OverlayCanvas>
      <div className="overlay-status-wrap overlay-fade-in">
        <p className="overlay-status-message">{message}</p>
      </div>
    </OverlayCanvas>
  );
}

export default function OverlayPage() {
  const view = useOverlayMatch();

  useEffect(() => {
    const meta = document.querySelector('meta[name="viewport"]');
    const previous = meta?.getAttribute("content") ?? null;
    meta?.setAttribute("content", "width=1920, initial-scale=1");
    return () => {
      if (meta && previous) meta.setAttribute("content", previous);
    };
  }, []);

  if (view.kind === "loading") {
    return <StatusScreen message="Loading..." />;
  }

  if (view.kind === "invalid-category") {
    return <StatusScreen message="Invalid Category" />;
  }

  if (view.kind === "no-match") {
    return <StatusScreen message="No Active Final Match" />;
  }

  const { match, categoryLabel, isDoubles, connection, isOnBreak } = view;

  return (
    <OverlayCanvas>
      <div className="overlay-bug-wrap">
        {connection === "reconnecting" && (
          <p className="absolute -top-10 left-0 right-0 text-center font-display text-sm text-white/70 overlay-live-pulse">
            Reconnecting...
          </p>
        )}

        <BroadcastScoreBug
          match={match}
          categoryLabel={categoryLabel}
          isDoubles={isDoubles}
          categorySlug={view.categorySlug}
          isOnBreak={isOnBreak}
        />
      </div>
    </OverlayCanvas>
  );
}
