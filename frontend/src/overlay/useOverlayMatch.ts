import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { useSupabase } from "../lib/config";
import {
  loadKnockoutState,
  mapRowToKnockoutState,
  type ApiKnockoutRow,
  type KnockoutStateMap,
  type ResolvedKnockoutMatch,
} from "../lib/knockout-state";
import { fetchTournamentData, type CategoryData } from "../lib/tournament";
import { supabase } from "../lib/supabase";
import {
  categoryLabelFromSlug,
  finalMatchIdFromSlug,
  isActiveFinalMatch,
  isDoublesCategory,
  parseOverlayCategory,
  resolveFinalMatch,
  type OverlayCategorySlug,
} from "./overlay-utils";
import { loadFinalsSettings, saveFinalsSettings } from "../lib/finals-storage";

export type OverlayConnectionState = "connecting" | "connected" | "reconnecting";

export type OverlayViewState =
  | { kind: "loading" }
  | { kind: "invalid-category" }
  | { kind: "no-match"; categoryLabel: string }
  | {
      kind: "match";
      categorySlug: OverlayCategorySlug;
      categoryLabel: string;
      isDoubles: boolean;
      match: ResolvedKnockoutMatch;
      connection: OverlayConnectionState;
      isOnBreak: boolean;
    };

function readCategoryParam(): string | null {
  return new URLSearchParams(window.location.search).get("category");
}

export function useOverlayMatch(): OverlayViewState {
  const categorySlug = useMemo(
    () => parseOverlayCategory(readCategoryParam()),
    [],
  );

  const [tournament, setTournament] = useState<CategoryData[]>([]);
  const [knockoutState, setKnockoutState] = useState<KnockoutStateMap>({});
  const [bootstrapped, setBootstrapped] = useState(false);
  const [connection, setConnection] = useState<OverlayConnectionState>(
    "connecting",
  );
  const [breakMatchId, setBreakMatchId] = useState<string | null>(null);

  const loadInitialData = useCallback(async () => {
    const [{ tournament: data }, knockout] = await Promise.all([
      fetchTournamentData(),
      api.getKnockoutState().catch(() => loadKnockoutState()),
    ]);
    setTournament(data);
    setKnockoutState(
      Object.keys(knockout).length > 0 ? knockout : loadKnockoutState(),
    );
    setBootstrapped(true);
  }, []);

  useEffect(() => {
    if (!categorySlug) {
      setBootstrapped(true);
      return;
    }
    void loadInitialData();
  }, [categorySlug, loadInitialData]);

  useEffect(() => {
    const loadBreakSetting = async () => {
      try {
        const remote = await api.getFinalsSettings();
        setBreakMatchId(remote.break_match_id);
        saveFinalsSettings(remote);
      } catch {
        setBreakMatchId(loadFinalsSettings().break_match_id);
      }
    };

    void loadBreakSetting();
    const interval = window.setInterval(() => {
      void loadBreakSetting();
    }, 5000);

    const sb = supabase;
    if (!useSupabase() || !sb) {
      return () => window.clearInterval(interval);
    }

    const channel = sb
      .channel("overlay-finals-settings")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "finals_settings" },
        (payload) => {
          const row = payload.new as { break_match_id?: string | null };
          if (!row) return;
          setBreakMatchId(row.break_match_id ?? null);
        },
      )
      .subscribe();

    return () => {
      window.clearInterval(interval);
      void sb.removeChannel(channel);
    };
  }, []);

  const matchId = categorySlug ? finalMatchIdFromSlug(categorySlug) : null;

  useEffect(() => {
    if (!categorySlug || !matchId) return;

    const sb = supabase;
    if (!useSupabase() || !sb) {
      setConnection("connected");
      const interval = window.setInterval(() => {
        void api
          .getKnockoutState()
          .then((state) => {
            if (Object.keys(state).length > 0) {
              setKnockoutState(state);
            }
          })
          .catch(() => {
            setKnockoutState(loadKnockoutState());
          });
      }, 3000);
      return () => window.clearInterval(interval);
    }

    let cancelled = false;
    setConnection("connecting");

    const channel = sb
      .channel(`overlay-knockout-${matchId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "knockout_matches",
          filter: `id=eq.${matchId}`,
        },
        (payload) => {
          const row = payload.new as ApiKnockoutRow | undefined;
          if (!row?.id) return;
          setKnockoutState((prev) => ({
            ...prev,
            [row.id]: mapRowToKnockoutState(row),
          }));
        },
      )
      .subscribe((status) => {
        if (cancelled) return;
        if (status === "SUBSCRIBED") {
          setConnection("connected");
        } else if (
          status === "CHANNEL_ERROR" ||
          status === "TIMED_OUT" ||
          status === "CLOSED"
        ) {
          setConnection("reconnecting");
        }
      });

    return () => {
      cancelled = true;
      void sb.removeChannel(channel);
    };
  }, [categorySlug, matchId]);

  const resolvedMatch = useMemo(() => {
    if (!categorySlug || tournament.length === 0) return null;
    return resolveFinalMatch(categorySlug, tournament, knockoutState);
  }, [categorySlug, tournament, knockoutState]);

  if (!bootstrapped) {
    return { kind: "loading" };
  }

  if (!categorySlug) {
    return { kind: "invalid-category" };
  }

  const categoryLabel = categoryLabelFromSlug(categorySlug);

  if (!resolvedMatch || !isActiveFinalMatch(resolvedMatch)) {
    return { kind: "no-match", categoryLabel };
  }

  return {
    kind: "match",
    categorySlug,
    categoryLabel,
    isDoubles: isDoublesCategory(categorySlug),
    match: resolvedMatch,
    connection,
    isOnBreak: breakMatchId === resolvedMatch.id,
  };
}
