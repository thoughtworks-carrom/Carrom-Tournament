import type { ApiFinalsSettings } from "./types";

const STORAGE_KEY = "carrom-finals-youtube-v1";

const DEFAULT: ApiFinalsSettings = {
  youtube_url: null,
  live_match_id: null,
  updated_at: new Date().toISOString(),
};

export function loadFinalsSettings(): ApiFinalsSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT;
    return { ...DEFAULT, ...(JSON.parse(raw) as ApiFinalsSettings) };
  } catch {
    return DEFAULT;
  }
}

export function saveFinalsSettings(settings: ApiFinalsSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}
