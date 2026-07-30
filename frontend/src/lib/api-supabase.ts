import { requireSupabase } from "./supabase";
import { computeStandings, enrichMatch } from "./standings";
import {
  type ApiKnockoutRow,
  type KnockoutMatchState,
  type KnockoutStateMap,
  mapKnockoutStateToRow,
  rowsToKnockoutStateMap,
} from "./knockout-state";
import type {
  ApiCategory,
  ApiFinalsSettings,
  ApiGalleryImage,
  ApiGroup,
  ApiGroupPlayer,
  ApiGroupTeam,
  ApiMatch,
  ApiPlayer,
  ApiStanding,
  ApiTeam,
  CategoryFormat,
  Gender,
  MatchStatus,
  ParticipantType,
} from "./types";

const GALLERY_BUCKET = "gallery";
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const EXT_TO_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};

function inferImageContentType(file: File): string | null {
  if (file.type && ALLOWED_TYPES.has(file.type)) return file.type;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const fromExt = EXT_TO_MIME[ext];
  return fromExt && ALLOWED_TYPES.has(fromExt) ? fromExt : null;
}

async function requireAdminSession() {
  const sb = requireSupabase();
  const {
    data: { session },
    error,
  } = await sb.auth.getSession();
  if (error) sbError(error);
  if (!session) {
    throw new Error("Sign in as admin to update tournament data");
  }
  return sb;
}

function sbError(error: { message: string } | null): never {
  throw new Error(error?.message ?? "Request failed");
}

let cachedPlayers: ApiPlayer[] | null = null;
let cachedTeams: ApiTeam[] | null = null;

async function loadPlayers(): Promise<ApiPlayer[]> {
  if (cachedPlayers) return cachedPlayers;
  const sb = requireSupabase();
  const { data, error } = await sb.from("players").select("*").order("name");
  if (error) sbError(error);
  cachedPlayers = (data ?? []) as ApiPlayer[];
  return cachedPlayers;
}

async function loadTeams(): Promise<ApiTeam[]> {
  if (cachedTeams) return cachedTeams;
  const sb = requireSupabase();
  const { data, error } = await sb.from("teams").select("*").order("created_at");
  if (error) sbError(error);
  cachedTeams = (data ?? []) as ApiTeam[];
  return cachedTeams;
}

function playerMap(players: ApiPlayer[]) {
  return new Map(players.map((p) => [p.id, p]));
}

function teamMap(teams: ApiTeam[]) {
  return new Map(teams.map((t) => [t.id, t]));
}

function invalidateCache() {
  cachedPlayers = null;
  cachedTeams = null;
}

async function prepareParticipantRemoval(
  groupId: string,
  participantId: string,
): Promise<void> {
  const sb = requireSupabase();
  const { data: matches, error } = await sb
    .from("matches")
    .select("id, status, participant1_id, participant2_id")
    .eq("group_id", groupId)
    .or(
      `participant1_id.eq.${participantId},participant2_id.eq.${participantId}`,
    );
  if (error) sbError(error);

  const all = matches ?? [];
  const played = all.filter((m) => m.status === "COMPLETED").length;

  if (played < 2 || played === 2) {
    const ids = all.map((m) => m.id as string);
    if (ids.length > 0) {
      const { error: delError } = await sb.from("matches").delete().in("id", ids);
      if (delError) sbError(delError);
    }
    return;
  }

  const remaining = all.filter(
    (m) => m.status === "SCHEDULED" || m.status === "LIVE",
  );
  for (const m of remaining) {
    const opponent =
      m.participant1_id === participantId
        ? (m.participant2_id as string)
        : (m.participant1_id as string);
    const { error: updError } = await sb
      .from("matches")
      .update({
        status: "COMPLETED" as MatchStatus,
        winner_participant_id: opponent,
        winner_score: 0,
        loser_score: 0,
      })
      .eq("id", m.id as string);
    if (updError) sbError(updError);
  }
}

async function validateDoublesTeam(
  category: ApiCategory,
  player1Id: string,
  player2Id: string,
  players: ApiPlayer[],
): Promise<[ApiPlayer, ApiPlayer]> {
  if (player1Id === player2Id) {
    throw new Error("A team cannot have the same player twice");
  }

  const pmap = playerMap(players);
  const p1 = pmap.get(player1Id);
  const p2 = pmap.get(player2Id);
  if (!p1 || !p2) throw new Error("Player not found");
  if (!p1.is_active || !p2.is_active) throw new Error("Player is not active");

  if (category.gender === "MALE") {
    if (p1.gender !== "MALE" || p2.gender !== "MALE") {
      throw new Error("Men's Doubles teams must have two male players");
    }
  } else if (category.gender === "FEMALE") {
    if (p1.gender !== "FEMALE" || p2.gender !== "FEMALE") {
      throw new Error("Women's Doubles teams must have two female players");
    }
  } else if (category.gender === "MIXED") {
    if (p1.gender === p2.gender) {
      throw new Error("Mixed Doubles teams must have one male and one female player");
    }
  }

  return [p1, p2];
}

export interface SeedResult {
  message: string;
  counts: {
    categories: number;
    groups: number;
    players: number;
    teams: number;
    group_players: number;
    group_teams: number;
    matches: number;
  };
}

export const supabaseClient = {
  verifyAdmin: async (_secret_key: string) => {
    throw new Error("Use email and password sign-in with Supabase");
  },

  seedTournamentData: async (force = false): Promise<SeedResult> => {
    const sb = requireSupabase();
    const { data, error } = await sb.rpc("seed_tournament_data", {
      force_reseed: force,
    });
    if (error) sbError(error);
    invalidateCache();
    return data as SeedResult;
  },

  resetAllMatchResults: async (): Promise<number> => {
    const sb = requireSupabase();
    const { data, error } = await sb.rpc("reset_all_match_results");
    if (error) sbError(error);
    invalidateCache();
    return (data as number) ?? 0;
  },

  getCategories: async (): Promise<ApiCategory[]> => {
    const sb = requireSupabase();
    const { data, error } = await sb.from("categories").select("*").order("name");
    if (error) sbError(error);
    return (data ?? []) as ApiCategory[];
  },

  getGroups: async (categoryId?: string): Promise<ApiGroup[]> => {
    const sb = requireSupabase();
    let query = sb.from("groups").select("*").order("name");
    if (categoryId) query = query.eq("category_id", categoryId);
    const { data, error } = await query;
    if (error) sbError(error);
    return (data ?? []) as ApiGroup[];
  },

  getPlayers: async (): Promise<ApiPlayer[]> => loadPlayers(),

  getTeams: async (categoryId?: string): Promise<ApiTeam[]> => {
    const teams = await loadTeams();
    if (!categoryId) return teams;
    return teams.filter((t) => t.category_id === categoryId);
  },

  getStandings: async (groupId: string): Promise<ApiStanding[]> => {
    const sb = requireSupabase();
    const [players, teams, groupRes, gpRes, gtRes, matchRes] = await Promise.all([
      loadPlayers(),
      loadTeams(),
      sb.from("groups").select("id, category_id").eq("id", groupId).single(),
      sb.from("group_players").select("player_id").eq("group_id", groupId),
      sb.from("group_teams").select("team_id").eq("group_id", groupId),
      sb.from("matches").select("*").eq("group_id", groupId),
    ]);

    if (groupRes.error) sbError(groupRes.error);
    if (gpRes.error) sbError(gpRes.error);
    if (gtRes.error) sbError(gtRes.error);
    if (matchRes.error) sbError(matchRes.error);

    const categoryRes = await sb
      .from("categories")
      .select("format")
      .eq("id", groupRes.data.category_id)
      .single();
    if (categoryRes.error) sbError(categoryRes.error);

    const format = categoryRes.data.format as CategoryFormat;
    const participantIds =
      format === "SINGLES"
        ? (gpRes.data ?? []).map((r) => ({ id: r.player_id as string, type: "PLAYER" as ParticipantType }))
        : (gtRes.data ?? []).map((r) => ({ id: r.team_id as string, type: "TEAM" as ParticipantType }));

    return computeStandings(
      groupId,
      format,
      participantIds,
      (matchRes.data ?? []) as ApiMatch[],
      playerMap(players),
      teamMap(teams),
    );
  },

  getGroupMatches: async (groupId: string): Promise<ApiMatch[]> => {
    const sb = requireSupabase();
    const [players, teams, { data, error }] = await Promise.all([
      loadPlayers(),
      loadTeams(),
      sb.from("matches").select("*").eq("group_id", groupId).order("created_at"),
    ]);
    if (error) sbError(error);

    const pmap = playerMap(players);
    const tmap = teamMap(teams);
    return ((data ?? []) as ApiMatch[]).map((m) => enrichMatch(m, pmap, tmap));
  },

  createPlayer: async (data: {
    name: string;
    employee_id?: string;
    gender: Gender;
  }): Promise<ApiPlayer> => {
    const sb = requireSupabase();
    const { data: row, error } = await sb
      .from("players")
      .insert({
        name: data.name,
        employee_id: data.employee_id ?? null,
        gender: data.gender,
      })
      .select()
      .single();
    if (error) sbError(error);
    invalidateCache();
    return row as ApiPlayer;
  },

  createTeam: async (data: {
    player1_id: string;
    player2_id: string;
    category_id: string;
    group_id: string;
  }): Promise<ApiTeam> => {
    const sb = requireSupabase();
    const [players, categories, groupRes] = await Promise.all([
      loadPlayers(),
      supabaseClient.getCategories(),
      sb.from("groups").select("id, category_id").eq("id", data.group_id).single(),
    ]);

    if (groupRes.error) sbError(groupRes.error);
    if (groupRes.data.category_id !== data.category_id) {
      throw new Error("Group does not belong to the selected category");
    }

    const category = categories.find((c) => c.id === data.category_id);
    if (!category) throw new Error("Category not found");
    if (category.format !== "DOUBLES") {
      throw new Error("Teams can only be created for doubles categories");
    }

    const [p1, p2] = await validateDoublesTeam(category, data.player1_id, data.player2_id, players);

    const existingTeams = (await loadTeams()).filter(
      (t) => t.category_id === data.category_id && t.is_active,
    );
    for (const team of existingTeams) {
      const assigned = new Set([team.player1_id, team.player2_id]);
      if (assigned.has(data.player1_id) || assigned.has(data.player2_id)) {
        throw new Error("One or both players are already on a team in this category");
      }
    }

    const { data: team, error: teamError } = await sb
      .from("teams")
      .insert({
        team_name: `${p1.name} / ${p2.name}`,
        player1_id: data.player1_id,
        player2_id: data.player2_id,
        category_id: data.category_id,
      })
      .select()
      .single();
    if (teamError) sbError(teamError);

    const { error: assignError } = await sb.from("group_teams").insert({
      group_id: data.group_id,
      team_id: team.id,
    });
    if (assignError) sbError(assignError);

    invalidateCache();
    return team as ApiTeam;
  },

  createGroup: async (data: { name: string; category_id: string }): Promise<ApiGroup> => {
    const sb = requireSupabase();
    const { data: row, error } = await sb
      .from("groups")
      .insert(data)
      .select()
      .single();
    if (error) sbError(error);
    return row as ApiGroup;
  },

  assignPlayer: async (groupId: string, playerId: string) => {
    const sb = requireSupabase();
    const { error } = await sb.from("group_players").insert({
      group_id: groupId,
      player_id: playerId,
    });
    if (error) sbError(error);
  },

  assignTeam: async (groupId: string, teamId: string) => {
    const sb = requireSupabase();
    const { error } = await sb.from("group_teams").insert({
      group_id: groupId,
      team_id: teamId,
    });
    if (error) sbError(error);
  },

  getGroupPlayers: async (groupId: string): Promise<ApiGroupPlayer[]> => {
    const sb = requireSupabase();
    const { data, error } = await sb
      .from("group_players")
      .select("id, group_id, player_id, group_position")
      .eq("group_id", groupId)
      .order("group_position", { ascending: true, nullsFirst: false });
    if (error) sbError(error);
    return (data ?? []) as ApiGroupPlayer[];
  },

  getGroupTeams: async (groupId: string): Promise<ApiGroupTeam[]> => {
    const sb = requireSupabase();
    const { data, error } = await sb
      .from("group_teams")
      .select("id, group_id, team_id, group_position")
      .eq("group_id", groupId)
      .order("group_position", { ascending: true, nullsFirst: false });
    if (error) sbError(error);
    return (data ?? []) as ApiGroupTeam[];
  },

  deactivatePlayer: async (playerId: string): Promise<ApiPlayer> => {
    const sb = requireSupabase();
    const { data, error } = await sb
      .from("players")
      .update({ is_active: false })
      .eq("id", playerId)
      .select()
      .single();
    if (error) sbError(error);
    invalidateCache();
    return data as ApiPlayer;
  },

  reactivatePlayer: async (playerId: string): Promise<ApiPlayer> => {
    const sb = requireSupabase();
    const { data, error } = await sb
      .from("players")
      .update({ is_active: true })
      .eq("id", playerId)
      .select()
      .single();
    if (error) sbError(error);
    invalidateCache();
    return data as ApiPlayer;
  },

  deactivateTeam: async (teamId: string): Promise<ApiTeam> => {
    const sb = requireSupabase();
    const { data, error } = await sb
      .from("teams")
      .update({ is_active: false })
      .eq("id", teamId)
      .select()
      .single();
    if (error) sbError(error);
    invalidateCache();
    return data as ApiTeam;
  },

  reactivateTeam: async (teamId: string): Promise<ApiTeam> => {
    const sb = requireSupabase();
    const { data, error } = await sb
      .from("teams")
      .update({ is_active: true })
      .eq("id", teamId)
      .select()
      .single();
    if (error) sbError(error);
    invalidateCache();
    return data as ApiTeam;
  },

  deleteGroup: async (groupId: string) => {
    const sb = requireSupabase();
    const { error } = await sb.from("groups").delete().eq("id", groupId);
    if (error) sbError(error);
  },

  removePlayerFromGroup: async (groupId: string, assignmentId: string) => {
    const sb = requireSupabase();
    const { data: row, error: fetchError } = await sb
      .from("group_players")
      .select("player_id")
      .eq("id", assignmentId)
      .eq("group_id", groupId)
      .single();
    if (fetchError) sbError(fetchError);

    await prepareParticipantRemoval(groupId, row.player_id as string);

    const { error } = await sb
      .from("group_players")
      .delete()
      .eq("id", assignmentId)
      .eq("group_id", groupId);
    if (error) sbError(error);
  },

  removeTeamFromGroup: async (groupId: string, assignmentId: string) => {
    const sb = requireSupabase();
    const { data: row, error: fetchError } = await sb
      .from("group_teams")
      .select("team_id")
      .eq("id", assignmentId)
      .eq("group_id", groupId)
      .single();
    if (fetchError) sbError(fetchError);

    await prepareParticipantRemoval(groupId, row.team_id as string);

    const { error } = await sb
      .from("group_teams")
      .delete()
      .eq("id", assignmentId)
      .eq("group_id", groupId);
    if (error) sbError(error);
  },

  resetMatch: async (matchId: string): Promise<ApiMatch> => {
    const sb = await requireAdminSession();
    const { data: row, error } = await sb
      .from("matches")
      .update({
        status: "SCHEDULED",
        winner_participant_id: null,
        winner_score: null,
        loser_score: null,
      })
      .eq("id", matchId)
      .select()
      .single();
    if (error) sbError(error);

    const [players, teams] = await Promise.all([loadPlayers(), loadTeams()]);
    return enrichMatch(row as ApiMatch, playerMap(players), teamMap(teams));
  },

  updateMatch: async (
    matchId: string,
    data: {
      status?: MatchStatus;
      winner_participant_id?: string;
      winner_score?: number;
      loser_score?: number;
    },
  ): Promise<ApiMatch> => {
    const sb = await requireAdminSession();
    const payload: Record<string, unknown> = {};
    if (data.status !== undefined) payload.status = data.status;
    if (data.winner_participant_id !== undefined) {
      payload.winner_participant_id = data.winner_participant_id;
    }
    if (data.winner_score !== undefined) payload.winner_score = data.winner_score;
    if (data.loser_score !== undefined) payload.loser_score = data.loser_score;
    if (data.status === "SCHEDULED") {
      payload.winner_participant_id = null;
      payload.winner_score = null;
      payload.loser_score = null;
    }

    const { data: row, error } = await sb
      .from("matches")
      .update(payload)
      .eq("id", matchId)
      .select()
      .single();
    if (error) sbError(error);

    const [players, teams] = await Promise.all([loadPlayers(), loadTeams()]);
    return enrichMatch(row as ApiMatch, playerMap(players), teamMap(teams));
  },

  getGalleryImages: async (): Promise<ApiGalleryImage[]> => {
    const sb = requireSupabase();
    const { data, error } = await sb
      .from("gallery_images")
      .select("id, filename, content_type, storage_path, created_at")
      .order("created_at", { ascending: false });
    if (error) sbError(error);

    return (data ?? []).map((row) => ({
      id: row.id as string,
      filename: row.filename as string,
      content_type: row.content_type as string,
      url_path: row.storage_path as string,
      created_at: row.created_at as string,
    }));
  },

  uploadGalleryImage: async (file: File): Promise<ApiGalleryImage> => {
    const contentType = inferImageContentType(file);
    if (!contentType) {
      throw new Error("Only JPEG, PNG, WebP, and GIF images are allowed");
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new Error("Image must be 5 MB or smaller");
    }

    const sb = await requireAdminSession();
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
    const storagePath = `${crypto.randomUUID()}.${ext}`;

    const { error: uploadError } = await sb.storage
      .from(GALLERY_BUCKET)
      .upload(storagePath, file, {
        contentType,
        cacheControl: "3600",
        upsert: false,
      });
    if (uploadError) {
      throw new Error(
        uploadError.message.includes("row-level security")
          ? "Upload denied — sign in as admin and ensure gallery storage policies are set up (see supabase/patches/gallery-storage-fix.sql)"
          : uploadError.message,
      );
    }

    const { data: row, error } = await sb
      .from("gallery_images")
      .insert({
        filename: file.name,
        content_type: file.type,
        storage_path: storagePath,
      })
      .select()
      .single();
    if (error) {
      await sb.storage.from(GALLERY_BUCKET).remove([storagePath]);
      sbError(error);
    }

    return {
      id: row.id as string,
      filename: row.filename as string,
      content_type: row.content_type as string,
      url_path: row.storage_path as string,
      created_at: row.created_at as string,
    };
  },

  deleteGalleryImage: async (imageId: string) => {
    const sb = await requireAdminSession();
    const { data: row, error: fetchError } = await sb
      .from("gallery_images")
      .select("storage_path")
      .eq("id", imageId)
      .single();
    if (fetchError) sbError(fetchError);

    const { error } = await sb.from("gallery_images").delete().eq("id", imageId);
    if (error) sbError(error);

    if (row?.storage_path) {
      await sb.storage.from(GALLERY_BUCKET).remove([row.storage_path as string]);
    }
  },

  getKnockoutState: async (): Promise<KnockoutStateMap> => {
    const sb = requireSupabase();
    const { data, error } = await sb.from("knockout_matches").select("*");
    if (error) sbError(error);
    return rowsToKnockoutStateMap((data ?? []) as ApiKnockoutRow[]);
  },

  upsertKnockoutMatch: async (
    matchId: string,
    category: string,
    state: KnockoutMatchState,
  ): Promise<void> => {
    const sb = await requireAdminSession();
    const row = {
      ...mapKnockoutStateToRow(matchId, category, state),
      updated_at: new Date().toISOString(),
    };
    const { error } = await sb.from("knockout_matches").upsert(row);
    if (error) sbError(error);
  },

  getFinalsSettings: async (): Promise<ApiFinalsSettings> => {
    const sb = requireSupabase();
    const { data, error } = await sb
      .from("finals_settings")
      .select("youtube_url, live_match_id, updated_at")
      .eq("id", 1)
      .maybeSingle();

    if (!error) {
      return {
        youtube_url: (data?.youtube_url as string | null) ?? null,
        live_match_id: (data?.live_match_id as string | null) ?? null,
        updated_at: (data?.updated_at as string) ?? new Date().toISOString(),
      };
    }

    // Fallback: anonymous REST read (public SELECT policy + anon key)
    const baseUrl = import.meta.env.VITE_SUPABASE_URL;
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
    if (!baseUrl || !anonKey) sbError(error);

    const res = await fetch(
      `${baseUrl}/rest/v1/finals_settings?id=eq.1&select=youtube_url,live_match_id,updated_at`,
      {
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
        },
      },
    );
    if (!res.ok) {
      sbError({ message: (await res.text()) || error.message });
    }
    const rows = (await res.json()) as Array<{
      youtube_url?: string | null;
      live_match_id?: string | null;
      updated_at?: string;
    }>;
    const row = rows[0];
    return {
      youtube_url: row?.youtube_url ?? null,
      live_match_id: row?.live_match_id ?? null,
      updated_at: row?.updated_at ?? new Date().toISOString(),
    };
  },

  updateFinalsSettings: async (patch: {
    youtube_url?: string | null;
    live_match_id?: string | null;
  }): Promise<ApiFinalsSettings> => {
    const sb = await requireAdminSession();
    const { data, error } = await sb
      .from("finals_settings")
      .upsert({
        id: 1,
        ...patch,
        updated_at: new Date().toISOString(),
      })
      .select("youtube_url, live_match_id, updated_at")
      .single();
    if (error) sbError(error);
    return {
      youtube_url: data.youtube_url as string | null,
      live_match_id: data.live_match_id as string | null,
      updated_at: data.updated_at as string,
    };
  },
};

export function supabaseGalleryImageUrl(storagePath: string) {
  const sb = requireSupabase();
  const { data } = sb.storage.from(GALLERY_BUCKET).getPublicUrl(storagePath);
  return data.publicUrl;
}
