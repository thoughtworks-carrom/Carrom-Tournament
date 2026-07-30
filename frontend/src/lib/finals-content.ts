/**
 * Finals page content — photos live under `frontend/public/finals/`.
 * Filename (without extension) matches the player's name.
 */

export type FinalsPhotoSection =
  | "mens-singles-final"
  | "mens-doubles-final"
  | "womens-singles-final"
  | "organisers"
  | "volunteers";

export interface FinalsPhoto {
  file: string;
  title?: string;
}

function photoEntry(section: FinalsPhotoSection, filename: string): FinalsPhoto {
  const title = filename.replace(/\.[^.]+$/, "");
  return { file: `finals/${section}/${filename}`, title };
}

function titleCaseName(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function peoplePhotoEntry(
  section: "organisers" | "volunteers",
  filename: string,
): FinalsPhoto {
  const stem = filename.replace(/\.[^.]+$/, "");
  return { file: `finals/${section}/${filename}`, title: titleCaseName(stem) };
}

export const FINALS_PHOTOS: Record<FinalsPhotoSection, FinalsPhoto[]> = {
  "mens-singles-final": [
    photoEntry("mens-singles-final", "Pulkit.webp"),
    photoEntry("mens-singles-final", "Nagendra babu.png"),
  ],
  "mens-doubles-final": [
    photoEntry("mens-doubles-final", "Raju Reddy.png"),
    photoEntry("mens-doubles-final", "pavan posannapeta.png"),
    photoEntry("mens-doubles-final", "Nagendra babu.png"),
    photoEntry("mens-doubles-final", "srikanth nelluri.png"),
    photoEntry("mens-doubles-final", "Poorna Chandra.png"),
  ],
  "womens-singles-final": [
    photoEntry("womens-singles-final", "Rohini.png"),
    photoEntry("womens-singles-final", "Lakshmi Prasanna.png"),
  ],
  organisers: [
    peoplePhotoEntry("organisers", "Gopichand.png"),
    peoplePhotoEntry("organisers", "Sai Mohan Reddy.png"),
    peoplePhotoEntry("organisers", "sharan reddi.png"),
    peoplePhotoEntry("organisers", "mani kumar reddy .png"),
    peoplePhotoEntry("organisers", "Lochan.jpg"),
  ],
  volunteers: [
    peoplePhotoEntry("volunteers", "suresh.png"),
    peoplePhotoEntry("volunteers", "Praneeth.png"),
    peoplePhotoEntry("volunteers", "Yamuna.png"),
    peoplePhotoEntry("volunteers", "Bharath.jpeg"),
    peoplePhotoEntry("volunteers", "chaitanya.jpg"),
    peoplePhotoEntry("volunteers", "chakravarthi.png"),
    peoplePhotoEntry("volunteers", "Dinesh.png"),
    peoplePhotoEntry("volunteers", "narendra.png"),
    peoplePhotoEntry("volunteers", "Raghavendra.png"),
  ],
};

export function normalizePhotoName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Bracket / roster names → photo filename stem (without extension) */
const PHOTO_NAME_ALIASES: Partial<
  Record<FinalsPhotoSection, Record<string, string>>
> = {
  "mens-doubles-final": {
    [normalizePhotoName("Bolem Poorna Rama Satya Chandu")]: "Poorna Chandra",
  },
};

export function splitTeamNames(name: string): string[] {
  if (name.includes(" / ")) {
    return name.split(" / ").map((part) => part.trim()).filter(Boolean);
  }
  if (name.includes("/")) {
    return name.split("/").map((part) => part.trim()).filter(Boolean);
  }
  return [name];
}

function photoMatchesName(photo: FinalsPhoto, playerName: string): boolean {
  const target = normalizePhotoName(playerName);
  if (!target || target === "tbd") return false;

  const title = normalizePhotoName(photo.title ?? "");
  const fileStem = normalizePhotoName(
    photo.file.split("/").pop()?.replace(/\.[^.]+$/, "") ?? "",
  );

  if (target === title || target === fileStem) return true;
  if (title && (target.includes(title) || title.includes(target))) return true;
  if (fileStem && (target.includes(fileStem) || fileStem.includes(target))) return true;

  const targetParts = target.split(" ").filter((part) => part.length > 2);
  if (
    targetParts.length > 0 &&
    targetParts.every((part) => title.includes(part) || fileStem.includes(part))
  ) {
    return true;
  }

  const labelParts = (title || fileStem).split(" ").filter((part) => part.length > 2);
  if (labelParts.length > 0 && labelParts.every((part) => target.includes(part))) {
    return true;
  }

  return false;
}

export function photosForPlayer(
  section: FinalsPhotoSection,
  playerName: string,
): FinalsPhoto | undefined {
  const normalized = normalizePhotoName(playerName);
  const aliasStem = PHOTO_NAME_ALIASES[section]?.[normalized];
  if (aliasStem) {
    const aliasPhoto = FINALS_PHOTOS[section].find(
      (photo) =>
        normalizePhotoName(photo.title ?? "") === normalizePhotoName(aliasStem),
    );
    if (aliasPhoto) return aliasPhoto;
  }

  return FINALS_PHOTOS[section].find((photo) => photoMatchesName(photo, playerName));
}

export function photosForSlot(
  section: FinalsPhotoSection,
  slotName: string,
  isDoubles: boolean,
): FinalsPhoto[] {
  const names = isDoubles ? splitTeamNames(slotName) : [slotName];
  return names
    .map((name) => photosForPlayer(section, name))
    .filter((photo): photo is FinalsPhoto => photo != null);
}

export function finalsPhotoUrl(file: string): string {
  const base = import.meta.env.BASE_URL ?? "/";
  const normalized = file.replace(/^\//, "");
  const encoded = normalized.split("/").map(encodeURIComponent).join("/");
  return `${base}${encoded}`;
}

export function finalsScoreboardPhotos(
  section: FinalsPhotoSection,
  slotAName: string,
  slotBName: string,
  isDoubles: boolean,
): {
  sideA: string[];
  sideB: string[];
} {
  return {
    sideA: photosForSlot(section, slotAName, isDoubles).map((photo) => photo.file),
    sideB: photosForSlot(section, slotBName, isDoubles).map((photo) => photo.file),
  };
}

export function sectionForFinalMatchId(matchId: string): FinalsPhotoSection | null {
  if (matchId === "ms-final") return "mens-singles-final";
  if (matchId === "md-final") return "mens-doubles-final";
  if (matchId === "ws-final") return "womens-singles-final";
  return null;
}

export function sectionForOverlayCategory(
  slug: "mens-singles" | "mens-doubles" | "womens-singles",
): FinalsPhotoSection {
  if (slug === "mens-singles") return "mens-singles-final";
  if (slug === "mens-doubles") return "mens-doubles-final";
  return "womens-singles-final";
}

export function youtubeEmbedUrl(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;

  if (/^[\w-]{11}$/.test(trimmed)) {
    return `https://www.youtube.com/embed/${trimmed}`;
  }

  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname.replace(/^www\./, "").replace(/^m\./, "");

    if (host === "youtube.com" || host === "youtube-nocookie.com") {
      const videoId = parsed.searchParams.get("v");
      if (videoId) return `https://www.youtube.com/embed/${videoId}`;

      const pathMatch = parsed.pathname.match(
        /\/(?:live|embed|shorts|v)\/([^/?#]+)/,
      );
      if (pathMatch?.[1]) {
        return `https://www.youtube.com/embed/${pathMatch[1]}`;
      }
    }

    if (host === "youtu.be") {
      const id = parsed.pathname.replace(/^\//, "").split("/")[0];
      if (id) return `https://www.youtube.com/embed/${id}`;
    }
  } catch {
    return null;
  }
  return null;
}
