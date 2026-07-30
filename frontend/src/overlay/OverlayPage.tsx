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
      const rw = root.clientWidth;
      const rh = root.clientHeight;
      setScale(Math.min(rw / 1920, rh / 1080));
    };

    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={rootRef} className="overlay-root">
      <div
        className="overlay-canvas"
        style={{ transform: `scale(${scale})`, transformOrigin: "bottom center" }}
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

  if (view.kind === "loading") {
    return <StatusScreen message="Loading..." />;
  }

  if (view.kind === "invalid-category") {
    return <StatusScreen message="Invalid Category" />;
  }

  if (view.kind === "no-match") {
    return <StatusScreen message="No Active Final Match" />;
  }

  const { match, categoryLabel, isDoubles, connection } = view;

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
        />
      </div>
    </OverlayCanvas>
  );
}
