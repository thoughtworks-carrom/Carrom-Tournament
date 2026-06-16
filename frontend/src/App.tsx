import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Award,
  AlertCircle,
  Calendar,
  Camera,
  Circle,
  Clock,
  Coins,
  Edit3,
  Gamepad2,
  Info,
  LayoutGrid,
  Lock,
  ImagePlus,
  MapPin,
  Menu,
  Moon,
  Search,
  Trash2,
  Shield,
  Sparkles,
  Sun,
  Target,
  Trophy,
  Users,
  X,
  Zap,
  ExternalLink,
  Download,
} from "lucide-react";
import {
  api,
  ApiCategory,
  ApiGalleryImage,
  ApiPlayer,
  ApiTeam,
  galleryImageUrl,
  Gender,
} from "./lib/api";
import {
  isAdmin,
  setAdminKey,
  signInAdmin,
  signOutAdmin,
  usesSupabaseAuth,
} from "./lib/auth";
import { supabase } from "./lib/supabase";
import {
  CategoryData,
  GroupMatch,
  PlayerStanding,
  TournamentGroup,
  computeTournamentMatchProgress,
  fetchTournamentData,
  formatMatchProgress,
  matchProgressFromMatches,
  playerScoresForMatch,
  toApiStatus,
  type MatchProgress,
} from "./lib/tournament";
import {
  exportMatchScheduleExcel,
  exportTournamentExcel,
  hasAnyGroups,
  hasAnyMatches,
} from "./lib/export-excel";

const publicAsset = (file: string) => `${import.meta.env.BASE_URL}${file}`;

// ─── Types ───────────────────────────────────────────────────────────────────

type Category = string;
type MatchStatus = GroupMatch["status"];

const TOURNAMENT_START = new Date(2026, 5, 12, 11, 0, 0);

const DISPLAY_CATEGORIES = [
  "Men's Singles",
  "Women's Singles",
  "Men's Doubles",
  "Mixed Doubles",
] as const;

const GALLERY_PREVIEW_COUNT = 6;
const GALLERY_DRIVE_URL =
  "https://drive.google.com/drive/folders/1gDyLrI_1D53idcBKC6_07w4yqf5_cz4T?usp=sharing";

function collectLiveMatches(data: CategoryData[]) {
  const results: { match: GroupMatch; group: string; category: string }[] = [];
  for (const cat of data) {
    for (const group of cat.groups) {
      for (const match of group.matches) {
        if (match.status === "Live") {
          results.push({ match, group: group.name, category: cat.category });
        }
      }
    }
  }
  return results;
}

function patchMatchInTournament(
  data: CategoryData[],
  matchId: string,
  update: {
    status?: MatchStatus;
    winnerParticipantId?: string | null;
    winnerScore?: number | null;
    loserScore?: number | null;
  },
): CategoryData[] {
  return data.map((cat) => ({
    ...cat,
    groups: cat.groups.map((grp) => ({
      ...grp,
      matches: grp.matches.map((m) => {
        if (m.id !== matchId) return m;
        const next = { ...m, ...update };
        if (update.status === "Scheduled") {
          next.winnerParticipantId = null;
          next.winnerScore = null;
          next.loserScore = null;
        }
        return next;
      }),
    })),
  }));
}

function LiveMatchesBanner({
  matches,
}: {
  matches: { match: GroupMatch; group: string; category: string }[];
}) {
  if (matches.length === 0) return null;

  return (
    <motion.div
      id="live-matches"
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className="mb-8 p-6 rounded-2xl border-2 border-red-500/50 bg-red-500/10 dark:bg-red-500/20 relative overflow-hidden"
    >
      <div className="absolute top-0 right-0 px-4 py-1 bg-red-500 text-white text-xs font-bold rounded-bl-xl flex items-center gap-1">
        <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
        LIVE
      </div>
      <h3 className="font-display text-lg font-bold mb-4">Live Matches</h3>
      <ul className="space-y-3">
        {matches.map(({ match, group, category }) => (
          <li
            key={match.id}
            className="p-4 rounded-xl bg-white/60 dark:bg-slate-900/40 border border-red-500/20"
          >
            <p className="text-xl font-bold">
              <PlayerLink
                name={match.playerA}
                employeeId={
                  match.participant1Type === "PLAYER"
                    ? match.participant1EmployeeId
                    : null
                }
              />
              <span className="text-red-500 mx-2">vs</span>
              <PlayerLink
                name={match.playerB}
                employeeId={
                  match.participant2Type === "PLAYER"
                    ? match.participant2EmployeeId
                    : null
                }
              />
            </p>
            <p className="text-sm text-slate-500 mt-1">
              {group} · {category}
            </p>
            <span className="inline-block mt-2 px-2 py-0.5 rounded-full text-xs font-bold bg-red-500 text-white animate-pulse">
              Live
            </span>
          </li>
        ))}
      </ul>
    </motion.div>
  );
}

const RULES_CATEGORIES = [
  {
    title: "General Rules",
    icon: Shield,
    rules: [
      "The Pieces: Matches will be played using standard White and Black coins, along with one Red coin (the Queen).",
      "Winning a Board: The team or player who successfully pockets all of their designated coins first wins the board.",
      "The Opening Break: A toss or coin flip will decide who gets the choice of strike or color for the first break.",
      "Flicking Restriction: Thumb shots are strictly prohibited. All shots must be played using the index or middle finger. Pushing the striker is a foul.",
      "Turn Continuity: A player continues their turn as long as they legally pocket their own coin. The turn ends on a miss, foul, or pocketing only an opponent's coin.",
      "Striker Placement: When placing the striker on the baselines, it must touch both parallel lines and either completely cover or not touch the red end circles.",
    ],
  },
  {
    title: "Official Red Coin (Queen) Rules",
    icon: Coins,
    rules: [
      "The Pre-requisite: A player can only pocket and attempt to cover the Queen if they have already pocketed at least one of their own coins.",
      "Covering the Queen: Once the Queen is pocketed, it must be 'covered' by pocketing one of the player's own coins on the immediate subsequent shot.",
      "Failure to Cover: If the player fails to cover the Queen on the next shot, the Queen is returned to the center circle, and the turn ends.",
      "Simultaneous Pocketing: If a player pockets the Queen and one of their own coins in the same strike, the Queen is automatically covered.",
      "The Final Piece Rule: A player cannot pocket their last remaining coin before the queen has been covered",
    ],
  },
  {
    title: "Striker, Fouls & Penalties",
    icon: AlertCircle,
    rules: [
      "Foul Penalty: A foul immediately ends the player's turn. Under ICF rules, a foul incurs a one-coin penalty.",
      "Striker Pocketed: If the striker is pocketed, it is a foul with one penalty coin returned. If no coins pocketed yet, the penalty is owed.",
      "Coin + Striker Together: If a player pockets their own coin and the striker in the same proper stroke, the pocketed coin and one additional Due coin shall be returned to the board (total of 2 coins returned). The player shall continue their turn.",
      "Touching Pieces: Physically touching any coin in play (other than the striker during positioning) is a foul.",
    ],
  },
  {
    title: "Coin Replacement & Conduct",
    icon: Award,
    rules: [
      "Placement Protocol: Any penalty coin or coin that flies out must be placed inside the center circle.",
      "No Disturbance: Coins must be placed flat on the board without disturbing other pieces. If center is occupied, coins are packed closely as per referee's discretion.",
      "Authorized Personnel: Coins must only be replaced by the referee, coordinator, or opponent player—never by the foul committer.",
      "Sportsmanlike Conduct: Players must maintain decorum. Intentional distractions or unsporting behavior will result in warning or forfeit.",
      "Direct Hitting: ICF rules allow tactical blocking and direct hitting of any coin on the board, provided the strike is legal.",
    ],
  },
];

const NAV_LINKS = [
  { id: "hero", label: "Home" },
  { id: "categories", label: "Categories" },
  { id: "rules", label: "Rules" },
  { id: "scoring", label: "Scoring" },
  { id: "standings", label: "Standings" },
  { id: "info", label: "Info" },
  { id: "gallery", label: "Gallery" },
];

const CATEGORY_META: Record<
  string,
  { icon: React.ElementType; color: string }
> = {
  "Men's Singles": { icon: Target, color: "from-blue-500/20 to-blue-600/5" },
  "Women's Singles": { icon: Zap, color: "from-pink-500/20 to-pink-600/5" },
  "Men's Doubles": {
    icon: Users,
    color: "from-emerald-500/20 to-emerald-600/5",
  },
  "Mixed Doubles": { icon: Award, color: "from-teal-500/20 to-teal-600/5" },
};

function getCategoryMeta(name: string) {
  return (
    CATEGORY_META[name] ?? {
      icon: LayoutGrid,
      color: "from-slate-500/20 to-slate-600/5",
    }
  );
}

// ─── Hooks & Utils ─────────────────────────────────────────────────────────────

function useCountdown(target: Date) {
  const [remaining, setRemaining] = useState(getRemaining(target));

  useEffect(() => {
    const id = setInterval(() => setRemaining(getRemaining(target)), 1000);
    return () => clearInterval(id);
  }, [target]);

  return remaining;
}

function getRemaining(target: Date) {
  const diff = Math.max(0, target.getTime() - Date.now());
  return {
    days: Math.floor(diff / (1000 * 60 * 60 * 24)),
    hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
    minutes: Math.floor((diff / (1000 * 60)) % 60),
    seconds: Math.floor((diff / 1000) % 60),
    done: diff === 0,
  };
}

function scrollTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
}

function isSinglesCategory(category: Category): boolean {
  return category.includes("Singles");
}

function sortStandings(standings: PlayerStanding[]): PlayerStanding[] {
  return [...standings].sort(
    (a, b) =>
      b.points - a.points ||
      b.score - a.score ||
      b.wins - a.wins ||
      a.name.localeCompare(b.name),
  );
}

// ─── Decorative Components ─────────────────────────────────────────────────────

type CoinColor = "white" | "black" | "red";

type SimCoin = {
  id: number;
  homeX: number;
  homeY: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: CoinColor;
};

type CarromSim = {
  striker: { x: number; y: number; vx: number; vy: number };
  coins: SimCoin[];
  idleMs: number;
  resetting: boolean;
};

const COIN_COLORS: CoinColor[] = [
  "white",
  "white",
  "white",
  "white",
  "black",
  "black",
  "black",
  "black",
  "red",
];

const STRIKER_RADIUS = 5;
const COIN_RADIUS = 2.55;
const STRIKER_MASS = 3.2;
const COIN_MASS = 1;
const RESTITUTION = 0.9;
const STRIKER_FRICTION_FAST = 0.95;
const STRIKER_FRICTION_SLOW = 3.8;
const COIN_FRICTION_FAST = 0.72;
const COIN_FRICTION_SLOW = 2.1;
const COIN_RENDER_SMOOTHING = 14;
const STOP_SPEED = 0.1;
const BOARD_MARGIN = 5;
const AUTO_SHOT_PAUSE_MS = 900;
const RESET_DURATION_MS = 1000;
const POST_SHOT_IDLE_MS = 2800;
const SHOT_SPEED_MIN = 58;
const SHOT_SPEED_MAX = 76;
const BASELINE_Y = 88;
const MIN_COIN_GAP = 7.5;

function isInTextZone(x: number, y: number) {
  return x > 35 && x < 65 && y > 30 && y < 60;
}

function randomCoinPositions(count: number) {
  const positions: { x: number; y: number }[] = [];
  let attempts = 0;

  while (positions.length < count && attempts < 600) {
    attempts += 1;
    const x = 7 + Math.random() * 86;
    const y = 16 + Math.random() * 62;
    if (isInTextZone(x, y)) continue;
    if (y > BASELINE_Y - 6) continue;
    const crowded = positions.some(
      (p) => Math.hypot(p.x - x, p.y - y) < MIN_COIN_GAP,
    );
    if (crowded) continue;
    positions.push({ x, y });
  }

  while (positions.length < count) {
    const i = positions.length;
    positions.push({
      x: i % 2 === 0 ? 12 + i * 4 : 88 - i * 4,
      y: 20 + (i % 4) * 14,
    });
  }

  return positions;
}

function buildCoins(): SimCoin[] {
  const positions = randomCoinPositions(COIN_COLORS.length);
  return COIN_COLORS.map((color, id) => ({
    id,
    homeX: positions[id].x,
    homeY: positions[id].y,
    x: positions[id].x,
    y: positions[id].y,
    vx: 0,
    vy: 0,
    color,
  }));
}

function createSim(): CarromSim {
  return {
    striker: {
      x: 50,
      y: BASELINE_Y,
      vx: 0,
      vy: 0,
    },
    coins: buildCoins(),
    idleMs: AUTO_SHOT_PAUSE_MS,
    resetting: false,
  };
}

function pickShotTarget(sim: CarromSim) {
  const ranked = [...sim.coins].sort((a, b) => {
    const da = Math.hypot(a.x - sim.striker.x, a.y - sim.striker.y);
    const db = Math.hypot(b.x - sim.striker.x, b.y - sim.striker.y);
    return da - db;
  });
  const pool = ranked.slice(0, Math.min(4, ranked.length));
  return pool[Math.floor(Math.random() * pool.length)] ?? sim.coins[0];
}

function applyCarromFriction(
  vx: number,
  vy: number,
  dt: number,
  fast: number,
  slow: number,
) {
  const speed = Math.hypot(vx, vy);
  const blend = Math.min(1, speed / 20);
  const friction = slow + (fast - slow) * blend;
  const damp = Math.exp(-friction * dt);
  return { vx: vx * damp, vy: vy * damp };
}

function autoShoot(sim: CarromSim) {
  const target = pickShotTarget(sim);
  const offset = (Math.random() - 0.5) * 32;
  sim.striker.x = Math.min(84, Math.max(16, target.x + offset));
  sim.striker.y = BASELINE_Y;
  sim.striker.vx = 0;
  sim.striker.vy = 0;

  const dx = target.x - sim.striker.x + (Math.random() - 0.5) * 2;
  const dy = target.y - sim.striker.y + (Math.random() - 0.5) * 2;
  const len = Math.hypot(dx, dy) || 1;
  const speed =
    SHOT_SPEED_MIN + Math.random() * (SHOT_SPEED_MAX - SHOT_SPEED_MIN);

  sim.striker.vx = (dx / len) * speed;
  sim.striker.vy = (dy / len) * speed;
  sim.idleMs = 0;
}

function coinsDisplaced(sim: CarromSim) {
  return sim.coins.some((c) => Math.hypot(c.x - c.homeX, c.y - c.homeY) > 0.35);
}

function hasMotion(sim: CarromSim) {
  if (Math.hypot(sim.striker.vx, sim.striker.vy) > STOP_SPEED) return true;
  return sim.coins.some((c) => Math.hypot(c.vx, c.vy) > STOP_SPEED);
}

function resolveCircleCollision(
  ax: number,
  ay: number,
  avx: number,
  avy: number,
  am: number,
  ar: number,
  bx: number,
  by: number,
  bvx: number,
  bvy: number,
  bm: number,
  br: number,
) {
  const dx = bx - ax;
  const dy = by - ay;
  const dist = Math.hypot(dx, dy);
  const minDist = ar + br;
  if (dist >= minDist || dist === 0) {
    return {
      ax,
      ay,
      avx,
      avy,
      bx,
      by,
      bvx,
      bvy,
    };
  }

  const nx = dx / dist;
  const ny = dy / dist;
  const overlap = minDist - dist;
  const totalMass = am + bm;

  let nax = ax - (nx * overlap * bm) / totalMass;
  let nay = ay - (ny * overlap * bm) / totalMass;
  let nbx = bx + (nx * overlap * am) / totalMass;
  let nby = by + (ny * overlap * am) / totalMass;

  const rvx = bvx - avx;
  const rvy = bvy - avy;
  const relNormal = rvx * nx + rvy * ny;
  if (relNormal < 0) {
    const impulse = (-(1 + RESTITUTION) * relNormal) / (1 / am + 1 / bm);
    const ix = impulse * nx;
    const iy = impulse * ny;
    avx -= ix / am;
    avy -= iy / am;
    bvx += ix / bm;
    bvy += iy / bm;
  }

  return { ax: nax, ay: nay, avx, avy, bx: nbx, by: nby, bvx, bvy };
}

function applyWallBounce(
  x: number,
  y: number,
  vx: number,
  vy: number,
  radius: number,
) {
  const m = BOARD_MARGIN + radius;
  let nx = x;
  let ny = y;
  let nvx = vx;
  let nvy = vy;

  const wallKeep = radius <= COIN_RADIUS ? 0.62 : 0.55;
  if (nx < m) {
    nx = m;
    nvx = Math.abs(nvx) * wallKeep;
    nvy *= 0.92;
  } else if (nx > 100 - m) {
    nx = 100 - m;
    nvx = -Math.abs(nvx) * wallKeep;
    nvy *= 0.92;
  }
  if (ny < m) {
    ny = m;
    nvy = Math.abs(nvy) * wallKeep;
    nvx *= 0.92;
  } else if (ny > 100 - m) {
    ny = 100 - m;
    nvy = -Math.abs(nvy) * wallKeep;
    nvx *= 0.92;
  }

  return { x: nx, y: ny, vx: nvx, vy: nvy };
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function stepPhysics(sim: CarromSim, dt: number) {
  const substeps = 5;
  const subDt = dt / substeps;

  for (let step = 0; step < substeps; step++) {
    stepPhysicsSubstep(sim, subDt);
  }
}

function stepPhysicsSubstep(sim: CarromSim, dt: number) {
  const s = sim.striker;
  s.x += s.vx * dt;
  s.y += s.vy * dt;
  const strikerDrag = applyCarromFriction(
    s.vx,
    s.vy,
    dt,
    STRIKER_FRICTION_FAST,
    STRIKER_FRICTION_SLOW,
  );
  s.vx = strikerDrag.vx;
  s.vy = strikerDrag.vy;

  const strikerWall = applyWallBounce(s.x, s.y, s.vx, s.vy, STRIKER_RADIUS);
  s.x = strikerWall.x;
  s.y = strikerWall.y;
  s.vx = strikerWall.vx;
  s.vy = strikerWall.vy;

  for (const coin of sim.coins) {
    coin.x += coin.vx * dt;
    coin.y += coin.vy * dt;
    const coinDrag = applyCarromFriction(
      coin.vx,
      coin.vy,
      dt,
      COIN_FRICTION_FAST,
      COIN_FRICTION_SLOW,
    );
    coin.vx = coinDrag.vx;
    coin.vy = coinDrag.vy;

    const hit = resolveCircleCollision(
      s.x,
      s.y,
      s.vx,
      s.vy,
      STRIKER_MASS,
      STRIKER_RADIUS,
      coin.x,
      coin.y,
      coin.vx,
      coin.vy,
      COIN_MASS,
      COIN_RADIUS,
    );
    s.x = hit.ax;
    s.y = hit.ay;
    s.vx = hit.avx;
    s.vy = hit.avy;
    coin.x = hit.bx;
    coin.y = hit.by;
    coin.vx = hit.bvx;
    coin.vy = hit.bvy;

    const coinWall = applyWallBounce(
      coin.x,
      coin.y,
      coin.vx,
      coin.vy,
      COIN_RADIUS,
    );
    coin.x = coinWall.x;
    coin.y = coinWall.y;
    coin.vx = coinWall.vx;
    coin.vy = coinWall.vy;
  }

  for (let i = 0; i < sim.coins.length; i++) {
    for (let j = i + 1; j < sim.coins.length; j++) {
      const a = sim.coins[i];
      const b = sim.coins[j];
      const hit = resolveCircleCollision(
        a.x,
        a.y,
        a.vx,
        a.vy,
        COIN_MASS,
        COIN_RADIUS,
        b.x,
        b.y,
        b.vx,
        b.vy,
        COIN_MASS,
        COIN_RADIUS,
      );
      a.x = hit.ax;
      a.y = hit.ay;
      a.vx = hit.avx;
      a.vy = hit.avy;
      b.x = hit.bx;
      b.y = hit.by;
      b.vx = hit.bvx;
      b.vy = hit.bvy;
    }
  }
}

function stepCarromSim(sim: CarromSim, dt: number) {
  if (sim.resetting) {
    sim.idleMs += dt * 1000;
    const progress = Math.min(1, sim.idleMs / RESET_DURATION_MS);
    const ease = 1 - (1 - progress) ** 3;

    for (const coin of sim.coins) {
      coin.x = coin.homeX + (coin.x - coin.homeX) * (1 - ease);
      coin.y = coin.homeY + (coin.y - coin.homeY) * (1 - ease);
      coin.vx = 0;
      coin.vy = 0;
    }

    sim.striker.vx = 0;
    sim.striker.vy = 0;
    sim.striker.x += (50 - sim.striker.x) * ease * 0.1;
    sim.striker.y += (BASELINE_Y - sim.striker.y) * ease * 0.1;

    if (progress >= 1) {
      sim.resetting = false;
      sim.idleMs = 0;
      sim.coins = buildCoins();
      sim.striker.x = 50;
      sim.striker.y = BASELINE_Y;
      sim.striker.vx = 0;
      sim.striker.vy = 0;
    }
    return;
  }

  if (hasMotion(sim)) {
    stepPhysics(sim, dt);
    sim.idleMs = 0;
    return;
  }

  sim.idleMs += dt * 1000;

  if (coinsDisplaced(sim)) {
    if (sim.idleMs >= POST_SHOT_IDLE_MS) {
      sim.resetting = true;
      sim.idleMs = 0;
    }
    return;
  }

  if (sim.idleMs >= AUTO_SHOT_PAUSE_MS) {
    autoShoot(sim);
  }
}

function FloatingCarromCoin({
  color,
  floating,
  delay = 0,
}: {
  color: CoinColor;
  floating?: boolean;
  delay?: number;
}) {
  const palette =
    color === "white"
      ? {
          edge: "#9a8468",
          face: "radial-gradient(circle at 35% 28%, #fffffa 0%, #f6eedc 38%, #e2d2b4 72%, #c9b08e 100%)",
          grain: "rgba(139, 105, 20, 0.06)",
          ring: "rgba(100, 78, 48, 0.28)",
          crown: "rgba(255,255,255,0.62)",
        }
      : color === "black"
        ? {
            edge: "#1a0e08",
            face: "radial-gradient(circle at 35% 28%, #4f382c 0%, #2e1c14 42%, #1a0e08 100%)",
            grain: "rgba(255,255,255,0.04)",
            ring: "rgba(255,255,255,0.1)",
            crown: "rgba(255,255,255,0.14)",
          }
        : {
            edge: "#cc0000",
            face: "radial-gradient(circle at 35% 28%, #ff3333 0%, #ff0000 45%, #e60000 78%, #cc0000 100%)",
            grain: "rgba(255, 255, 255, 0.06)",
            ring: "rgba(255, 255, 255, 0.25)",
            crown: "rgba(255,255,255,0.45)",
          };

  return (
    <div
      className={`relative w-11 h-11 md:w-12 md:h-12 ${color === "red" ? "opacity-100" : "opacity-90"} ${floating ? "carrom-coin-float" : ""}`}
      style={{ animationDelay: `${delay}s` }}
    >
      <div
        className="absolute left-1/2 -translate-x-1/2 bottom-[-8%] w-[76%] h-[20%] rounded-[50%] bg-slate-900/20 blur-[4px]"
        aria-hidden
      />
      <div className="absolute inset-0 rounded-full" style={{ padding: "3px" }}>
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background:
              color === "red"
                ? "linear-gradient(180deg, #ff1a1a 0%, #b30000 100%)"
                : `linear-gradient(180deg, ${palette.edge} 0%, #0f0a06 100%)`,
            boxShadow:
              color === "red"
                ? "0 4px 12px rgba(255, 0, 0, 0.35)"
                : "0 4px 10px rgba(15, 23, 42, 0.28)",
          }}
        />
        <div
          className="absolute inset-[3px] rounded-full overflow-hidden"
          style={{
            background: palette.face,
            boxShadow:
              color === "red"
                ? "inset 0 3px 6px rgba(255,255,255,0.4), inset 0 -4px 6px rgba(180, 0, 0, 0.25)"
                : "inset 0 3px 6px rgba(255,255,255,0.42), inset 0 -5px 8px rgba(0,0,0,0.28)",
          }}
        >
          <div
            className="absolute inset-0 opacity-80"
            style={{
              backgroundImage: `repeating-linear-gradient(118deg, transparent, transparent 3px, ${palette.grain} 3px, ${palette.grain} 4px)`,
            }}
          />
          <div
            className="absolute inset-[16%] rounded-full border"
            style={{ borderColor: palette.ring }}
          />
          <div
            className="absolute inset-[30%] rounded-full border"
            style={{ borderColor: palette.ring, opacity: 0.75 }}
          />
          {color === "red" && (
            <div
              className="absolute inset-[22%] rounded-full border-2"
              style={{ borderColor: "rgba(255, 255, 255, 0.35)" }}
            />
          )}
          <div
            className="absolute top-[16%] left-[22%] w-[38%] h-[24%] rounded-full rotate-[-22deg]"
            style={{ background: palette.crown }}
          />
        </div>
      </div>
    </div>
  );
}

function CarromBoardBackground() {
  const reduceMotion = useReducedMotion();
  const simRef = useRef<CarromSim>(createSim());
  const displayCoinsRef = useRef(
    createSim().coins.map((c) => ({ x: c.x, y: c.y })),
  );
  const lastFrameRef = useRef(performance.now());
  const [frame, setFrame] = useState(() => createSim());

  useEffect(() => {
    if (reduceMotion) return;
    simRef.current = createSim();
    displayCoinsRef.current = simRef.current.coins.map((c) => ({
      x: c.x,
      y: c.y,
    }));
    autoShoot(simRef.current);
    lastFrameRef.current = performance.now();
    let raf = 0;

    const tick = (now: number) => {
      const dt = Math.min((now - lastFrameRef.current) / 1000, 0.032);
      lastFrameRef.current = now;
      const sim = simRef.current;
      stepCarromSim(sim, dt);

      if (displayCoinsRef.current.length !== sim.coins.length) {
        displayCoinsRef.current = sim.coins.map((c) => ({ x: c.x, y: c.y }));
      }

      const smooth = sim.resetting
        ? 1
        : 1 - Math.exp(-COIN_RENDER_SMOOTHING * dt);

      const coins = sim.coins.map((coin, i) => {
        const prev = displayCoinsRef.current[i] ?? { x: coin.x, y: coin.y };
        const x = lerp(prev.x, coin.x, smooth);
        const y = lerp(prev.y, coin.y, smooth);
        displayCoinsRef.current[i] = { x, y };
        return { ...coin, x, y };
      });

      setFrame({
        striker: { ...sim.striker },
        coins,
        idleMs: sim.idleMs,
        resetting: sim.resetting,
      });
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reduceMotion]);

  const striker = reduceMotion ? { x: 50, y: BASELINE_Y } : frame.striker;
  const boardMoving =
    !reduceMotion &&
    (Math.hypot(frame.striker.vx, frame.striker.vy) > STOP_SPEED ||
      frame.coins.some((c) => Math.hypot(c.vx, c.vy) > STOP_SPEED));

  return (
    <div
      className="absolute inset-0 overflow-hidden z-0 max-w-6xl mx-auto left-0 right-0 pointer-events-none opacity-80"
      aria-hidden
    >
      <div className="absolute inset-0 carrom-board-surface opacity-60" />

      <div className="absolute inset-0">
        {frame.coins.map((coin) => {
          if (reduceMotion) {
            return (
              <div
                key={coin.id}
                className="absolute -translate-x-1/2 -translate-y-1/2"
                style={{ left: `${coin.homeX}%`, top: `${coin.homeY}%` }}
              >
                <FloatingCarromCoin
                  color={coin.color}
                  floating
                  delay={coin.id * 0.35}
                />
              </div>
            );
          }
          const moving = Math.hypot(coin.vx, coin.vy) > STOP_SPEED;
          return (
            <div
              key={coin.id}
              className="absolute -translate-x-1/2 -translate-y-1/2 will-change-[left,top]"
              style={{ left: `${coin.x}%`, top: `${coin.y}%` }}
            >
              <FloatingCarromCoin
                color={coin.color}
                floating={!moving && !boardMoving}
                delay={coin.id * 0.35}
              />
            </div>
          );
        })}
      </div>

      <div
        className="absolute -translate-x-1/2 -translate-y-1/2"
        style={{ left: `${striker.x}%`, top: `${striker.y}%` }}
      >
        <div className="relative w-24 h-24 md:w-32 md:h-32 rounded-full bg-gradient-to-br from-white via-white to-stone-50 border-[4px] border-white shadow-[0_10px_28px_rgba(15,23,42,0.15)] p-2 ring-2 ring-white brightness-110">
          <img
            src={publicAsset("tw.jpg")}
            alt=""
            className="w-full h-full rounded-full object-cover brightness-[1.45] contrast-[1.08] saturate-[1.2]"
          />
        </div>
      </div>
    </div>
  );
}

function PlayerLink({
  name,
  employeeId,
  className = "",
  adminMode = false,
}: {
  name: string;
  employeeId?: string | null;
  className?: string;
  adminMode?: boolean;
}) {
  if (adminMode || !employeeId) {
    return <span className={className}>{name}</span>;
  }

  return (
    <a
      href={`https://jigsaw.thoughtworks.net/consultants/${employeeId}`}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-1 hover:text-accent-teal transition-colors ${className}`}
    >
      {name}
      <ExternalLink className="w-3.5 h-3.5 opacity-60" />
    </a>
  );
}

function GlassCard({
  children,
  className = "",
  hover = true,
}: {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
}) {
  return (
    <motion.div
      whileHover={hover ? { y: -4, scale: 1.01 } : undefined}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
      className={`glass rounded-2xl p-6 ${className}`}
    >
      {children}
    </motion.div>
  );
}

function SectionHeader({
  title,
  subtitle,
  icon: Icon,
}: {
  title: string;
  subtitle?: string;
  icon?: React.ElementType;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      className="text-center mb-12"
    >
      {Icon && (
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-accent-teal/10 dark:bg-accent-teal/20 text-accent-teal mb-4">
          <Icon className="w-7 h-7" />
        </div>
      )}
      <h2 className="font-display text-3xl md:text-4xl font-bold text-slate-900 dark:text-white mb-3">
        {title}
      </h2>
      {subtitle && (
        <p className="text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
          {subtitle}
        </p>
      )}
    </motion.div>
  );
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1)
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 text-xs font-bold">
        <Trophy className="w-3.5 h-3.5" /> 1st
      </span>
    );
  if (rank === 2)
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold">
        2nd
      </span>
    );
  if (rank === 3)
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300 text-xs font-bold">
        3rd
      </span>
    );
  return (
    <span className="text-slate-500 dark:text-slate-400 font-medium">
      #{rank}
    </span>
  );
}

// ─── Navbar ────────────────────────────────────────────────────────────────────

function Navbar({
  dark,
  toggleTheme,
  toggleAdmin,
  menuOpen,
  setMenuOpen,
}: {
  dark: boolean;
  toggleTheme: () => void;
  toggleAdmin: () => void;
  menuOpen: boolean;
  setMenuOpen: (v: boolean) => void;
}) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav
      className={`sticky top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled ? "glass-strong shadow-lg py-2" : "bg-transparent py-4"
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between">
          <button
            onClick={() => scrollTo("hero")}
            className="flex items-center gap-3 font-display font-bold text-lg text-slate-900 dark:text-white"
          >
            <img
              src={publicAsset("tw.jpg")}
              alt="Thoughtworks"
              className="w-10 h-10 rounded-lg bg-white/90 p-1 shadow-sm object-contain"
            />
            <span className="hidden sm:inline">TW Carrom</span>
          </button>

          <div className="hidden lg:flex items-center gap-1">
            {NAV_LINKS.map((link) => (
              <button
                key={link.id}
                onClick={() => scrollTo(link.id)}
                className="px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:text-accent-teal dark:hover:text-accent-teal rounded-lg transition-colors"
              >
                {link.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={toggleAdmin}
              aria-label="Organizer admin mode"
              className="p-2 rounded-xl opacity-0"
            >
              <Edit3 className="w-5 h-5" />
            </button>
            <button
              onClick={toggleTheme}
              className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
            >
              {dark ? (
                <Sun className="w-5 h-5" />
              ) : (
                <Moon className="w-5 h-5" />
              )}
            </button>
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="lg:hidden p-2 rounded-xl bg-slate-100 dark:bg-slate-800"
            >
              {menuOpen ? (
                <X className="w-5 h-5" />
              ) : (
                <Menu className="w-5 h-5" />
              )}
            </button>
          </div>
        </div>

        <AnimatePresence>
          {menuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="lg:hidden overflow-hidden mt-3"
            >
              <div className="glass rounded-xl p-3 flex flex-col gap-1">
                {NAV_LINKS.map((link) => (
                  <button
                    key={link.id}
                    onClick={() => {
                      scrollTo(link.id);
                      setMenuOpen(false);
                    }}
                    className="px-4 py-3 text-left font-medium rounded-lg hover:bg-accent-teal/10 dark:hover:bg-accent-teal/20 transition-colors"
                  >
                    {link.label}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </nav>
  );
}

// ─── Hero ──────────────────────────────────────────────────────────────────────

function Hero({
  countdown,
  onViewStandings,
}: {
  countdown: ReturnType<typeof useCountdown>;
  onViewStandings: () => void;
}) {
  return (
    <section
      id="hero"
      className="relative min-h-screen flex items-center pt-24 pb-16 overflow-hidden board-pattern"
    >
      <CarromBoardBackground />
      <div
        className="absolute inset-0 pointer-events-none z-[1] dark:hidden"
        style={{
          background: `
            radial-gradient(ellipse 58% 52% at 50% 44%, rgba(255,255,255,0.92) 0%, rgba(255,255,255,0.72) 42%, rgba(255,255,255,0.2) 72%, transparent 100%),
            linear-gradient(to bottom, rgba(255,255,255,0.55), rgba(255,255,255,0.35))
          `,
        }}
      />
      <div
        className="absolute inset-0 pointer-events-none z-[1] hidden dark:block"
        style={{
          background: `
            radial-gradient(ellipse 58% 52% at 50% 44%, rgba(15,23,42,0.92) 0%, rgba(15,23,42,0.78) 42%, rgba(15,23,42,0.35) 72%, transparent 100%),
            linear-gradient(to bottom, rgba(15,23,42,0.65), rgba(15,23,42,0.45))
          `,
        }}
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 w-full">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
          className="text-center max-w-4xl mx-auto"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass text-sm font-medium text-accent-teal mb-6"
          >
            <Sparkles className="w-4 h-4" />
            Thoughtworks Hyderabad Office
          </motion.div>

          <h1 className="font-display text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold text-slate-900 dark:text-white leading-tight mb-6">
            Thoughtworks Hyderabad{" "}
            <span className="text-gradient">Carrom Tournament 2026</span>
          </h1>

          <p className="text-lg md:text-xl text-slate-600 dark:text-slate-300 mb-8 max-w-2xl mx-auto">
            From beginners to boardroom champions — everyone is welcome!
          </p>

          <div className="flex flex-wrap justify-center gap-3 mb-12">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => scrollTo("rules")}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold bg-board-dark hover:bg-board text-white shadow-lg shadow-board-dark/30 transition-colors"
            >
              <Shield className="w-5 h-5" />
              View Rules
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.98 }}
              onClick={onViewStandings}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold bg-accent-teal hover:bg-accent-teal/90 text-white shadow-lg shadow-accent-teal/30 transition-colors"
            >
              <Trophy className="w-5 h-5" />
              View Standings
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.98 }}
              onClick={onViewStandings}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold bg-board-dark hover:bg-board text-white shadow-lg shadow-board-dark/30 transition-colors"
            >
              <Calendar className="w-5 h-5" />
              Group Schedules
            </motion.button>
          </div>

          <GlassCard className="max-w-lg mx-auto" hover={false}>
            {countdown.done ? (
              <p className="text-xl md:text-2xl font-display font-bold text-accent-teal text-center">
                Tournament Has Started
              </p>
            ) : (
              <>
                <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-4 flex items-center justify-center gap-2">
                  <Clock className="w-4 h-4" /> Tournament Starts In
                </p>
                <div className="grid grid-cols-4 gap-3">
                  <div className="text-center">
                    <div className="text-2xl md:text-3xl font-display font-bold text-accent-teal">
                      {countdown.days}
                    </div>
                    <div className="text-xs tracking-wider text-slate-500">
                      Days
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl md:text-3xl font-display font-bold text-accent-teal">
                      {String(countdown.hours).padStart(2, "0")}
                    </div>
                    <div className="text-xs tracking-wider text-slate-500">
                      Hours
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl md:text-3xl font-display font-bold text-accent-teal">
                      {String(countdown.minutes).padStart(2, "0")}
                    </div>
                    <div className="text-xs tracking-wider text-slate-500">
                      Minutes
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl md:text-3xl font-display font-bold text-accent-teal">
                      {String(countdown.seconds).padStart(2, "0")}
                    </div>
                    <div className="text-xs tracking-wider text-slate-500">
                      Seconds
                    </div>
                  </div>
                </div>
              </>
            )}
          </GlassCard>
        </motion.div>
      </div>
    </section>
  );
}

// ─── Stats ─────────────────────────────────────────────────────────────────────

function MatchProgressBar({ progress }: { progress: MatchProgress }) {
  const pct =
    progress.total > 0
      ? Math.round((progress.completed / progress.total) * 100)
      : 0;
  return (
    <div className="h-1.5 rounded-full bg-slate-200/80 dark:bg-slate-700/80 overflow-hidden">
      <div
        className="h-full rounded-full bg-accent-teal transition-all duration-500"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function MatchProgressText({
  progress,
  className = "",
}: {
  progress: MatchProgress;
  className?: string;
}) {
  const pending = progress.total - progress.completed;
  return (
    <span className={className}>
      <span className="font-semibold text-slate-900 dark:text-white">
        {formatMatchProgress(progress)}
      </span>{" "}
      <span className="text-slate-500 dark:text-slate-400">completed</span>
      {pending > 0 && (
        <span className="text-slate-400 dark:text-slate-500">
          {" "}
          · {pending} pending
        </span>
      )}
    </span>
  );
}

function StatsBar({
  categoryCount,
  playerCount,
  matchProgress,
}: {
  categoryCount: number;
  playerCount: number;
  matchProgress: MatchProgress;
}) {
  const stats = [
    { label: "Categories", value: String(categoryCount), icon: LayoutGrid },
    { label: "Players", value: String(playerCount), icon: Users },
    {
      label: "Matches completed",
      value: formatMatchProgress(matchProgress, { suffix: "" }),
      icon: Gamepad2,
    },
    { label: "Tables", value: "3", icon: Circle },
  ];

  return (
    <section className="py-12 -mt-8 relative z-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {stats.map(({ label, value, icon: Icon }, i) => (
            <motion.div
              key={label}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
            >
              <GlassCard className="text-center">
                <Icon className="w-8 h-8 mx-auto text-accent-gold mb-2" />
                <div className="text-2xl md:text-3xl font-display font-bold text-slate-900 dark:text-white">
                  {value}
                </div>
                <div className="text-sm text-slate-500 dark:text-slate-400">
                  {label}
                </div>
              </GlassCard>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Categories ────────────────────────────────────────────────────────────────

const CATEGORY_TAGLINES: Record<string, string> = {
  "Men's Singles": "Individual men's competition",
  "Women's Singles": "Individual women's competition",
  "Men's Doubles": "Men's pairs on the board",
  "Mixed Doubles": "Mixed-gender doubles teams",
};

function Categories({
  onSelectCategory,
}: {
  onSelectCategory: (c: Category) => void;
}) {
  return (
    <section id="categories" className="py-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeader
          title="Tournament Categories"
          subtitle="Browse all tournament categories"
          icon={LayoutGrid}
        />
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {DISPLAY_CATEGORIES.map((category, i) => {
            const { icon: Icon, color } = getCategoryMeta(category);
            return (
              <motion.div
                key={category}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
              >
                <button
                  onClick={() => onSelectCategory(category)}
                  className="w-full text-left"
                >
                  <GlassCard className={`bg-gradient-to-br ${color} h-full`}>
                    <div className="w-12 h-12 rounded-xl bg-white/80 dark:bg-slate-800/80 flex items-center justify-center mb-4">
                      <Icon className="w-6 h-6 text-accent-teal" />
                    </div>
                    <h3 className="font-display text-xl font-bold text-slate-900 dark:text-white">
                      {category}
                    </h3>
                    <p className="text-sm text-slate-600 dark:text-slate-400 mt-2">
                      {CATEGORY_TAGLINES[category]}
                    </p>
                    <p className="text-sm text-accent-teal mt-4 font-medium">
                      View standings & matches →
                    </p>
                  </GlassCard>
                </button>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ─── Rules ─────────────────────────────────────────────────────────────────────

function RulesSection() {
  return (
    <section id="rules" className="py-20 bg-slate-50/50 dark:bg-slate-900/30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeader
          title="Tournament Rules"
          subtitle="Fully aligned with ICF standards with local adjustments"
          icon={Shield}
        />
        <div className="space-y-12">
          {RULES_CATEGORIES.map(({ title, icon: Icon, rules }, categoryIdx) => (
            <div key={categoryIdx}>
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 rounded-lg bg-accent-teal/10 dark:bg-accent-teal/20 flex items-center justify-center">
                  <Icon className="w-6 h-6 text-accent-teal" />
                </div>
                <h3 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
                  {title}
                </h3>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                {rules.map((rule, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, scale: 0.95 }}
                    whileInView={{ opacity: 1, scale: 1 }}
                    viewport={{ once: true }}
                    transition={{ delay: (i % 4) * 0.05 }}
                  >
                    <GlassCard className="h-full flex gap-3">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-board text-white text-xs font-bold flex items-center justify-center">
                        {i + 1}
                      </span>
                      <p className="text-slate-700 dark:text-slate-300 text-sm leading-relaxed">
                        {rule}
                      </p>
                    </GlassCard>
                  </motion.div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Scoring ───────────────────────────────────────────────────────────────────

function Scoring() {
  const scenarios = [
    {
      title: "Winning team pots red",
      formula: "Score = 3 + remaining opponent coins",
      example: "Opponent has 3 coins left → Final score = 6",
      highlight: "6",
      icon: Trophy,
      gradient: "from-amber-500/30 to-orange-500/10",
    },
    {
      title: "Losing team had potted red",
      formula: "Winning team gets only remaining opponent coins",
      example: "Opponent has 3 coins left → Final score = 3",
      highlight: "3",
      icon: Coins,
      gradient: "from-accent-teal/30 to-emerald-500/10",
    },
  ];

  return (
    <section id="scoring" className="py-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeader
          title="Scoring System"
          subtitle="Understand how points are calculated per board"
          icon={Award}
        />
        <div className="grid md:grid-cols-2 gap-8">
          {scenarios.map((s, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: i ? 20 : -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
            >
              <GlassCard className={`bg-gradient-to-br ${s.gradient}`}>
                <s.icon className="w-10 h-10 text-accent-gold mb-4" />
                <h3 className="font-display text-xl font-bold mb-3">
                  {s.title}
                </h3>
                <p className="font-mono text-sm bg-slate-900/5 dark:bg-white/5 rounded-lg px-4 py-3 mb-4">
                  {s.formula}
                </p>
                <p className="text-slate-600 dark:text-slate-400 mb-4">
                  {s.example}
                </p>
                <div className="text-5xl font-display font-extrabold text-gradient">
                  {s.highlight}
                </div>
                <p className="text-xs text-slate-500 mt-1">points example</p>
              </GlassCard>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Admin Editors ─────────────────────────────────────────────────────────────

function AdminBanner({
  adminMode,
  onLogout,
}: {
  adminMode: boolean;
  onLogout: () => void | Promise<void>;
}) {
  if (!adminMode) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="fixed top-[7rem] left-1/2 -translate-x-1/2 z-40 px-4 py-2 rounded-full bg-accent-teal text-white text-sm font-medium shadow-lg flex items-center gap-3"
    >
      <Edit3 className="w-4 h-4" />
      Admin Mode — changes sync to database
      <button
        type="button"
        onClick={() => void onLogout()}
        className="underline text-xs opacity-90 hover:opacity-100"
      >
        Logout
      </button>
    </motion.div>
  );
}

function AdminLoginModal({
  open,
  onClose,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const supabaseAuth = usesSupabaseAuth();
  const [email, setEmail] = useState("");
  const [secret, setSecret] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setLoading(true);
    setError("");
    try {
      if (supabaseAuth) {
        await signInAdmin(email.trim(), secret);
      } else {
        await api.verifyAdmin(secret);
        setAdminKey(secret);
      }
      onSuccess();
      onClose();
      setSecret("");
      setEmail("");
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : supabaseAuth
            ? "Invalid email or password"
            : "Invalid admin secret",
      );
    } finally {
      setLoading(false);
    }
  };

  const canSubmit = supabaseAuth
    ? Boolean(email.trim() && secret)
    : Boolean(secret);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="glass-strong rounded-2xl max-w-md w-full p-8"
          >
            <div className="flex justify-between items-start mb-6">
              <h3 className="font-display text-2xl font-bold flex items-center gap-2">
                <Lock className="w-6 h-6 text-accent-teal" />
                Admin Login
              </h3>
              <button
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-slate-500 mb-4">
              {supabaseAuth
                ? "Sign in with your organizer account to manage the tournament."
                : "Enter the organizer secret key to manage the tournament."}
            </p>
            {supabaseAuth && (
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Admin email"
                autoComplete="username"
                className="w-full px-4 py-3 rounded-xl glass mb-3"
              />
            )}
            <input
              type="password"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              placeholder={supabaseAuth ? "Password" : "Admin secret"}
              autoComplete={supabaseAuth ? "current-password" : "off"}
              className="w-full px-4 py-3 rounded-xl glass mb-3"
              onKeyDown={(e) => e.key === "Enter" && canSubmit && submit()}
            />
            {error && <p className="text-red-500 text-sm mb-3">{error}</p>}
            <button
              onClick={submit}
              disabled={loading || !canSubmit}
              className="w-full py-3 rounded-xl bg-accent-teal text-white font-semibold disabled:opacity-50"
            >
              {loading ? "Signing in..." : "Login"}
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function AdminPanel({
  categories,
  players,
  teams,
  tournament,
  onRefresh,
}: {
  categories: ApiCategory[];
  players: ApiPlayer[];
  teams: ApiTeam[];
  tournament: CategoryData[];
  onRefresh: () => Promise<void>;
}) {
  const [playerName, setPlayerName] = useState("");
  const [playerEmployeeId, setPlayerEmployeeId] = useState("");
  const [playerGender, setPlayerGender] = useState<Gender | "">("");
  const [teamCategoryId, setTeamCategoryId] = useState("");
  const [teamGroupId, setTeamGroupId] = useState("");
  const [teamPlayer1, setTeamPlayer1] = useState("");
  const [teamPlayer2, setTeamPlayer2] = useState("");
  const [groupName, setGroupName] = useState("");
  const [groupCategoryId, setGroupCategoryId] = useState("");
  const [assignCategoryId, setAssignCategoryId] = useState("");
  const [assignGroupId, setAssignGroupId] = useState("");
  const [assignPlayerId, setAssignPlayerId] = useState("");
  const [message, setMessage] = useState("");
  const [groups, setGroups] = useState<
    { id: string; name: string; category_id: string }[]
  >([]);
  const [manageCategoryId, setManageCategoryId] = useState("");
  const [manageGroupId, setManageGroupId] = useState("");
  const [groupAssignments, setGroupAssignments] = useState<
    { assignmentId: string; label: string; type: "player" | "team" }[]
  >([]);
  const [deactivatePlayerId, setDeactivatePlayerId] = useState("");
  const [reactivatePlayerId, setReactivatePlayerId] = useState("");
  const [deactivateTeamCategoryId, setDeactivateTeamCategoryId] = useState("");
  const [deactivateTeamId, setDeactivateTeamId] = useState("");
  const [reactivateTeamCategoryId, setReactivateTeamCategoryId] = useState("");
  const [reactivateTeamId, setReactivateTeamId] = useState("");
  const [deleteGroupCategoryId, setDeleteGroupCategoryId] = useState("");
  const [deleteGroupId, setDeleteGroupId] = useState("");
  const [removeConfirm, setRemoveConfirm] = useState<{
    label: string;
    run: () => Promise<unknown>;
  } | null>(null);

  useEffect(() => {
    api
      .getGroups()
      .then(setGroups)
      .catch(() => setGroups([]));
  }, [categories, tournament]);

  useEffect(() => {
    if (!manageGroupId || !manageCategoryId) {
      setGroupAssignments([]);
      return;
    }
    const category = categories.find((c) => c.id === manageCategoryId);
    if (!category) return;

    const load = async () => {
      try {
        if (category.format === "SINGLES") {
          const rows = await api.getGroupPlayers(manageGroupId);
          setGroupAssignments(
            rows.map((r) => ({
              assignmentId: r.id,
              label:
                players.find((p) => p.id === r.player_id)?.name ??
                "Unknown player",
              type: "player" as const,
            })),
          );
        } else {
          const rows = await api.getGroupTeams(manageGroupId);
          setGroupAssignments(
            rows.map((r) => ({
              assignmentId: r.id,
              label:
                teams.find((t) => t.id === r.team_id)?.team_name ??
                "Unknown team",
              type: "team" as const,
            })),
          );
        }
      } catch {
        setGroupAssignments([]);
      }
    };
    void load();
  }, [manageGroupId, manageCategoryId, categories, players, teams, tournament]);

  const activePlayers = players.filter((p) => p.is_active);
  const inactivePlayers = players.filter((p) => !p.is_active);
  const singlesCategories = categories.filter((c) => c.format === "SINGLES");
  const doublesCategories = categories.filter((c) => c.format === "DOUBLES");

  const assignedPlayerIdsInCategory = (categoryId: string) => {
    const categoryData = tournament.find((c) => c.categoryId === categoryId);
    if (!categoryData) return new Set<string>();
    return new Set(
      categoryData.groups.flatMap((g) => g.standings.map((s) => s.id)),
    );
  };

  const playersOnTeamsInCategory = (categoryId: string) => {
    const ids = new Set<string>();
    teams
      .filter((t) => t.is_active && t.category_id === categoryId)
      .forEach((t) => {
        ids.add(t.player1_id);
        ids.add(t.player2_id);
      });
    return ids;
  };

  const groupsForCategory = (categoryId: string) =>
    groups.filter((g) => g.category_id === categoryId);

  const availableSinglesPlayers = (categoryId: string) => {
    const category = categories.find((c) => c.id === categoryId);
    if (!category) return [];
    const assigned = assignedPlayerIdsInCategory(categoryId);
    return activePlayers.filter((p) => {
      if (assigned.has(p.id)) return false;
      if (category.gender === "MALE") return p.gender === "MALE";
      if (category.gender === "FEMALE") return p.gender === "FEMALE";
      return false;
    });
  };

  const availableDoublesPlayers = (categoryId: string, excludeId?: string) => {
    const category = categories.find((c) => c.id === categoryId);
    if (!category) return [];
    const onTeam = playersOnTeamsInCategory(categoryId);
    return activePlayers.filter((p) => {
      if (p.id === excludeId) return false;
      if (onTeam.has(p.id)) return false;
      if (category.gender === "MALE") return p.gender === "MALE";
      if (category.gender === "FEMALE") return p.gender === "FEMALE";
      return true;
    });
  };

  const teamPlayer2Options = (categoryId: string, player1Id: string) => {
    const category = categories.find((c) => c.id === categoryId);
    const player1 = activePlayers.find((p) => p.id === player1Id);
    if (!category || !player1)
      return availableDoublesPlayers(categoryId, player1Id);
    if (category.gender === "MIXED") {
      return availableDoublesPlayers(categoryId, player1Id).filter(
        (p) => p.gender !== player1.gender,
      );
    }
    return availableDoublesPlayers(categoryId, player1Id);
  };

  const resetPlayerForm = () => {
    setPlayerName("");
    setPlayerEmployeeId("");
    setPlayerGender("");
  };

  const resetAssignForm = () => {
    setAssignCategoryId("");
    setAssignGroupId("");
    setAssignPlayerId("");
  };

  const resetTeamForm = () => {
    setTeamCategoryId("");
    setTeamGroupId("");
    setTeamPlayer1("");
    setTeamPlayer2("");
  };

  const resetGroupForm = () => {
    setGroupName("");
    setGroupCategoryId("");
  };

  const runAction = async (
    action: () => Promise<unknown>,
    success: string,
    onSuccess?: () => void,
    confirmMessage?: string,
  ) => {
    if (confirmMessage && !window.confirm(confirmMessage)) return;
    setMessage("");
    try {
      await action();
      setMessage(success);
      onSuccess?.();
      await onRefresh();
      const updatedGroups = await api.getGroups();
      setGroups(updatedGroups);
    } catch (e) {
      const text = e instanceof Error ? e.message : "Action failed";
      setMessage(text);
    }
  };

  const confirmRemoveFromGroup = async () => {
    if (!removeConfirm) return;
    const { label, run } = removeConfirm;
    setRemoveConfirm(null);
    await runAction(run, `Removed ${label} from group`);
  };

  const removeConfirmDialog =
    removeConfirm &&
    createPortal(
      <div
        className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
        onClick={() => setRemoveConfirm(null)}
      >
        <div
          className="glass-strong rounded-2xl max-w-md w-full p-6 shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <p className="font-display text-lg font-bold mb-2">
            Remove {removeConfirm.label}?
          </p>
          <ul className="text-sm text-slate-500 dark:text-slate-400 mb-6 space-y-1 list-disc pl-5">
            <li>Played 0–1 matches: all their matches and points are removed.</li>
            <li>
              Played 3+ matches: remaining fixtures become walkovers (opponent
              gets 2 points, 0 score).
            </li>
            <li>Played exactly 2: all their matches are removed.</li>
          </ul>
          <div className="flex gap-3 justify-end">
            <button
              type="button"
              onClick={() => setRemoveConfirm(null)}
              className="px-4 py-2 rounded-xl glass text-sm font-semibold"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void confirmRemoveFromGroup()}
              className="px-4 py-2 rounded-xl bg-red-600 text-white text-sm font-semibold"
            >
              Remove
            </button>
          </div>
        </div>
      </div>,
      document.body,
    );

  return (
    <div className="mb-10 glass rounded-2xl p-6 space-y-6">
      {removeConfirmDialog}
      <h3 className="font-display text-xl font-bold">Organizer Tools</h3>
      {message && <p className="text-sm text-accent-teal">{message}</p>}

      <div className="grid md:grid-cols-2 gap-6">
        <div className="space-y-3">
          <h4 className="font-semibold">Add Player</h4>
          <input
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            placeholder="Name"
            className="w-full px-3 py-2 rounded-lg glass"
          />
          <input
            value={playerEmployeeId}
            onChange={(e) => setPlayerEmployeeId(e.target.value)}
            placeholder="Employee ID"
            className="w-full px-3 py-2 rounded-lg glass"
          />
          <select
            value={playerGender}
            onChange={(e) => setPlayerGender(e.target.value as Gender | "")}
            className="w-full px-3 py-2 rounded-lg glass"
          >
            <option value="">Select gender</option>
            <option value="MALE">Male</option>
            <option value="FEMALE">Female</option>
          </select>
          <button
            onClick={() =>
              runAction(
                () =>
                  api.createPlayer({
                    name: playerName,
                    employee_id: playerEmployeeId || undefined,
                    gender: playerGender as Gender,
                  }),
                "Player created",
                resetPlayerForm,
              )
            }
            disabled={!playerName.trim() || !playerGender}
            className="px-4 py-2 rounded-lg bg-accent-teal text-white text-sm disabled:opacity-50"
          >
            Add Player
          </button>
        </div>

        <div className="space-y-3">
          <h4 className="font-semibold">Assign Player to Group</h4>
          <select
            value={assignCategoryId}
            onChange={(e) => {
              setAssignCategoryId(e.target.value);
              setAssignGroupId("");
              setAssignPlayerId("");
            }}
            className="w-full px-3 py-2 rounded-lg glass"
          >
            <option value="">Select category</option>
            {singlesCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            value={assignGroupId}
            onChange={(e) => setAssignGroupId(e.target.value)}
            className="w-full px-3 py-2 rounded-lg glass"
            disabled={!assignCategoryId}
          >
            <option value="">Select group</option>
            {groupsForCategory(assignCategoryId).map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
          <select
            value={assignPlayerId}
            onChange={(e) => setAssignPlayerId(e.target.value)}
            className="w-full px-3 py-2 rounded-lg glass"
            disabled={!assignCategoryId}
          >
            <option value="">Select player</option>
            {availableSinglesPlayers(assignCategoryId).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <button
            onClick={() =>
              runAction(
                () => api.assignPlayer(assignGroupId, assignPlayerId),
                "Player assigned to group",
                resetAssignForm,
              )
            }
            disabled={!assignGroupId || !assignPlayerId}
            className="px-4 py-2 rounded-lg bg-accent-teal text-white text-sm disabled:opacity-50"
          >
            Save Assignment
          </button>
        </div>

        <div className="space-y-3">
          <h4 className="font-semibold">Create Doubles Team</h4>
          <select
            value={teamCategoryId}
            onChange={(e) => {
              setTeamCategoryId(e.target.value);
              setTeamGroupId("");
              setTeamPlayer1("");
              setTeamPlayer2("");
            }}
            className="w-full px-3 py-2 rounded-lg glass"
          >
            <option value="">Select category</option>
            {doublesCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            value={teamGroupId}
            onChange={(e) => setTeamGroupId(e.target.value)}
            className="w-full px-3 py-2 rounded-lg glass"
            disabled={!teamCategoryId}
          >
            <option value="">Select group</option>
            {groupsForCategory(teamCategoryId).map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
          <select
            value={teamPlayer1}
            onChange={(e) => {
              setTeamPlayer1(e.target.value);
              setTeamPlayer2("");
            }}
            className="w-full px-3 py-2 rounded-lg glass"
            disabled={!teamCategoryId}
          >
            <option value="">Player 1</option>
            {availableDoublesPlayers(teamCategoryId).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <select
            value={teamPlayer2}
            onChange={(e) => setTeamPlayer2(e.target.value)}
            className="w-full px-3 py-2 rounded-lg glass"
            disabled={!teamCategoryId || !teamPlayer1}
          >
            <option value="">Player 2</option>
            {teamPlayer2Options(teamCategoryId, teamPlayer1).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <button
            onClick={() =>
              runAction(
                () =>
                  api.createTeam({
                    player1_id: teamPlayer1,
                    player2_id: teamPlayer2,
                    category_id: teamCategoryId,
                    group_id: teamGroupId,
                  }),
                "Team created and assigned to group",
                resetTeamForm,
              )
            }
            disabled={
              !teamCategoryId || !teamGroupId || !teamPlayer1 || !teamPlayer2
            }
            className="px-4 py-2 rounded-lg bg-accent-teal text-white text-sm disabled:opacity-50"
          >
            Save Team
          </button>
        </div>

        <div className="space-y-3">
          <h4 className="font-semibold">Create Group</h4>
          <input
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            placeholder="Group name"
            className="w-full px-3 py-2 rounded-lg glass"
          />
          <select
            value={groupCategoryId}
            onChange={(e) => setGroupCategoryId(e.target.value)}
            className="w-full px-3 py-2 rounded-lg glass"
          >
            <option value="">Select category</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <button
            onClick={() =>
              runAction(
                () =>
                  api.createGroup({
                    name: groupName,
                    category_id: groupCategoryId,
                  }),
                "Group created",
                resetGroupForm,
              )
            }
            className="px-4 py-2 rounded-lg bg-accent-teal text-white text-sm"
          >
            Create Group
          </button>
        </div>
      </div>

      <div className="border-t border-slate-200 dark:border-slate-700 pt-6 space-y-4">
        <h4 className="font-semibold text-red-600 dark:text-red-400">
          Remove &amp; Manage
        </h4>
        <div className="grid md:grid-cols-2 gap-6">
          <div className="space-y-3">
            <p className="text-sm font-medium">Remove from group</p>
            <select
              value={manageCategoryId}
              onChange={(e) => {
                setManageCategoryId(e.target.value);
                setManageGroupId("");
              }}
              className="w-full px-3 py-2 rounded-lg glass"
            >
              <option value="">Select category</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <select
              value={manageGroupId}
              onChange={(e) => setManageGroupId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg glass"
              disabled={!manageCategoryId}
            >
              <option value="">Select group</option>
              {groupsForCategory(manageCategoryId).map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
            {groupAssignments.length === 0 && manageGroupId && (
              <p className="text-xs text-slate-500">
                No members in this group.
              </p>
            )}
            <ul className="space-y-2 max-h-40 overflow-y-auto">
              {groupAssignments.map((item) => (
                <li
                  key={item.assignmentId}
                  className="flex items-center justify-between gap-2 text-sm glass rounded-lg px-3 py-2"
                >
                  <span>{item.label}</span>
                  <button
                    type="button"
                    onClick={() =>
                      setRemoveConfirm({
                        label: item.label,
                        run: () =>
                          item.type === "player"
                            ? api.removePlayerFromGroup(
                                manageGroupId,
                                item.assignmentId,
                              )
                            : api.removeTeamFromGroup(
                                manageGroupId,
                                item.assignmentId,
                              ),
                      })
                    }
                    className="text-red-600 dark:text-red-400 text-xs font-semibold hover:underline"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-3">
            <p className="text-sm font-medium">Deactivate player</p>
            <select
              value={deactivatePlayerId}
              onChange={(e) => setDeactivatePlayerId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg glass"
            >
              <option value="">Select player</option>
              {activePlayers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() =>
                runAction(
                  () => api.deactivatePlayer(deactivatePlayerId),
                  "Player deactivated",
                  () => setDeactivatePlayerId(""),
                  "Deactivate this player? They will be hidden from new assignments.",
                )
              }
              disabled={!deactivatePlayerId}
              className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm disabled:opacity-50"
            >
              Deactivate Player
            </button>

            {inactivePlayers.length > 0 && (
              <>
                <p className="text-sm font-medium pt-2">Reactivate player</p>
                <select
                  value={reactivatePlayerId}
                  onChange={(e) => setReactivatePlayerId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg glass"
                >
                  <option value="">Select inactive player</option>
                  {inactivePlayers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() =>
                    runAction(
                      () => api.reactivatePlayer(reactivatePlayerId),
                      "Player reactivated",
                      () => setReactivatePlayerId(""),
                    )
                  }
                  disabled={!reactivatePlayerId}
                  className="px-4 py-2 rounded-lg bg-accent-teal text-white text-sm disabled:opacity-50"
                >
                  Reactivate Player
                </button>
              </>
            )}

            <p className="text-sm font-medium pt-2">Deactivate doubles team</p>
            <select
              value={deactivateTeamCategoryId}
              onChange={(e) => {
                setDeactivateTeamCategoryId(e.target.value);
                setDeactivateTeamId("");
              }}
              className="w-full px-3 py-2 rounded-lg glass"
            >
              <option value="">Select category</option>
              {doublesCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <select
              value={deactivateTeamId}
              onChange={(e) => setDeactivateTeamId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg glass"
              disabled={!deactivateTeamCategoryId}
            >
              <option value="">Select team</option>
              {teams
                .filter(
                  (t) =>
                    t.is_active && t.category_id === deactivateTeamCategoryId,
                )
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.team_name}
                  </option>
                ))}
            </select>
            <button
              type="button"
              onClick={() =>
                runAction(
                  () => api.deactivateTeam(deactivateTeamId),
                  "Team deactivated",
                  () => setDeactivateTeamId(""),
                  "Deactivate this team?",
                )
              }
              disabled={!deactivateTeamId}
              className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm disabled:opacity-50"
            >
              Deactivate Team
            </button>

            {teams.some((t) => !t.is_active) && (
              <>
                <p className="text-sm font-medium pt-2">
                  Reactivate doubles team
                </p>
                <select
                  value={reactivateTeamCategoryId}
                  onChange={(e) => {
                    setReactivateTeamCategoryId(e.target.value);
                    setReactivateTeamId("");
                  }}
                  className="w-full px-3 py-2 rounded-lg glass"
                >
                  <option value="">Select category</option>
                  {doublesCategories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <select
                  value={reactivateTeamId}
                  onChange={(e) => setReactivateTeamId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg glass"
                  disabled={!reactivateTeamCategoryId}
                >
                  <option value="">Select inactive team</option>
                  {teams
                    .filter(
                      (t) =>
                        !t.is_active &&
                        t.category_id === reactivateTeamCategoryId,
                    )
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.team_name}
                      </option>
                    ))}
                </select>
                <button
                  type="button"
                  onClick={() =>
                    runAction(
                      () => api.reactivateTeam(reactivateTeamId),
                      "Team reactivated",
                      () => setReactivateTeamId(""),
                    )
                  }
                  disabled={!reactivateTeamId}
                  className="px-4 py-2 rounded-lg bg-accent-teal text-white text-sm disabled:opacity-50"
                >
                  Reactivate Team
                </button>
              </>
            )}
          </div>

          <div className="space-y-3 md:col-span-2">
            <p className="text-sm font-medium">Delete group</p>
            <div className="flex flex-col sm:flex-row gap-3">
              <select
                value={deleteGroupCategoryId}
                onChange={(e) => {
                  setDeleteGroupCategoryId(e.target.value);
                  setDeleteGroupId("");
                }}
                className="flex-1 px-3 py-2 rounded-lg glass"
              >
                <option value="">Select category</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <select
                value={deleteGroupId}
                onChange={(e) => setDeleteGroupId(e.target.value)}
                className="flex-1 px-3 py-2 rounded-lg glass"
                disabled={!deleteGroupCategoryId}
              >
                <option value="">Select group</option>
                {groupsForCategory(deleteGroupCategoryId).map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() =>
                  runAction(
                    () => api.deleteGroup(deleteGroupId),
                    "Group deleted",
                    () => {
                      setDeleteGroupId("");
                      setDeleteGroupCategoryId("");
                    },
                    "Delete this group and all its matches? This cannot be undone.",
                  )
                }
                disabled={!deleteGroupId}
                className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm disabled:opacity-50 whitespace-nowrap"
              >
                Delete Group
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MatchAdminControls({
  match,
  groupName,
  categoryName,
  onSave,
}: {
  match: GroupMatch;
  groupName: string;
  categoryName: string;
  onSave: (
    match: GroupMatch,
    update: {
      status?: MatchStatus;
      winnerParticipantId?: string;
      winnerScore?: number;
      loserScore?: number;
    },
  ) => Promise<void>;
}) {
  const [winnerId, setWinnerId] = useState(
    match.winnerParticipantId || match.participant1Id,
  );
  const [winnerScore, setWinnerScore] = useState(
    String(match.winnerScore ?? ""),
  );
  const [loserScore, setLoserScore] = useState(String(match.loserScore ?? ""));
  const [showCompleteConfirm, setShowCompleteConfirm] = useState(false);

  const winnerName =
    winnerId === match.participant1Id ? match.playerA : match.playerB;
  const loserName =
    winnerId === match.participant1Id ? match.playerB : match.playerA;

  useEffect(() => {
    setWinnerId(match.winnerParticipantId || match.participant1Id);
    setWinnerScore(String(match.winnerScore ?? ""));
    setLoserScore(String(match.loserScore ?? ""));
  }, [
    match.id,
    match.status,
    match.winnerParticipantId,
    match.winnerScore,
    match.loserScore,
    match.participant1Id,
  ]);

  const resetMatchForm = () => {
    setWinnerId(match.participant1Id);
    setWinnerScore("");
    setLoserScore("");
  };

  const handleSave = async (update: {
    status?: MatchStatus;
    winnerParticipantId?: string;
    winnerScore?: number;
    loserScore?: number;
  }) => {
    await onSave(match, update);
    if (update.status === "Completed") {
      resetMatchForm();
    }
  };

  const submitComplete = () => {
    const wScoreRaw = winnerScore.trim();
    const lScoreRaw = loserScore.trim();
    const wScoreParsed = wScoreRaw === "" ? null : Number(wScoreRaw);
    const lScoreParsed = lScoreRaw === "" ? null : Number(lScoreRaw);

    if (wScoreParsed === null || Number.isNaN(wScoreParsed)) {
      window.alert("Enter a valid winner score before completing the match.");
      return;
    }

    const update: {
      status: MatchStatus;
      winnerParticipantId: string;
      winnerScore: number;
      loserScore?: number;
    } = {
      status: "Completed",
      winnerParticipantId: winnerId,
      winnerScore: wScoreParsed,
    };
    if (lScoreParsed !== null && !Number.isNaN(lScoreParsed)) {
      update.loserScore = lScoreParsed;
    }
    setShowCompleteConfirm(false);
    void handleSave(update);
  };

  const completeConfirmDialog =
    showCompleteConfirm &&
    createPortal(
      <div
        className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
        onClick={() => setShowCompleteConfirm(false)}
      >
        <div
          className="glass-strong rounded-2xl max-w-sm w-full p-6 shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <p className="font-display text-lg font-bold mb-2">Complete match?</p>
          <p className="text-sm text-slate-500 mb-6">
            Confirm to save this result.
          </p>
          <div className="flex gap-3 justify-end">
            <button
              type="button"
              onClick={() => setShowCompleteConfirm(false)}
              className="px-4 py-2 rounded-xl glass text-sm font-semibold"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submitComplete}
              className="px-4 py-2 rounded-xl bg-accent-teal text-white text-sm font-semibold"
            >
              Confirm
            </button>
          </div>
        </div>
      </div>,
      document.body,
    );

  const { playerAScore, playerBScore } = playerScoresForMatch(match);

  if (match.status === "Completed") {
    const completedWinnerName =
      match.winnerParticipantId === match.participant1Id
        ? match.playerA
        : match.playerB;
    return (
      <div className="flex flex-col gap-1 text-xs text-slate-600 dark:text-slate-400">
        <span>Winner: {completedWinnerName}</span>
        <span>
          {match.playerA}: {playerAScore ?? "—"} · {match.playerB}:{" "}
          {playerBScore ?? "—"}
        </span>
        <span
          className={`px-2 py-0.5 rounded-full text-xs font-bold w-fit bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300`}
        >
          Completed
        </span>
      </div>
    );
  }

  return (
    <>
      {completeConfirmDialog}
      <div className="flex flex-col gap-2">
      <select
        value={match.status}
        onChange={(e) => {
          const status = e.target.value as MatchStatus;
          void handleSave({ status });
        }}
        className="px-2 py-0.5 rounded border text-xs"
      >
        <option value="Scheduled">Scheduled</option>
        <option value="Live">Live</option>
      </select>
      {match.status === "Live" && (
        <button
          type="button"
          onClick={() => {
            if (window.confirm("Set this match back to Scheduled?")) {
              void handleSave({ status: "Scheduled" });
            }
          }}
          className="text-red-600 dark:text-red-400 text-xs font-semibold hover:underline w-fit"
        >
          End live (Scheduled)
        </button>
      )}
      <select
        value={winnerId}
        onChange={(e) => setWinnerId(e.target.value)}
        className="px-2 py-0.5 rounded border text-xs"
      >
        <option value={match.participant1Id}>{match.playerA}</option>
        <option value={match.participant2Id}>{match.playerB}</option>
      </select>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1 text-xs">
          <span className="text-slate-500 max-w-[7rem] truncate">
            {winnerName}
          </span>
          <input
            type="number"
            value={winnerScore}
            onChange={(e) => setWinnerScore(e.target.value)}
            className="w-16 px-2 py-0.5 rounded border text-xs"
            placeholder="0"
            min={0}
          />
        </label>
        <label className="flex items-center gap-1 text-xs">
          <span className="text-slate-500 max-w-[7rem] truncate">
            {loserName}
          </span>
          <input
            type="number"
            value={loserScore}
            onChange={(e) => setLoserScore(e.target.value)}
            className="w-16 px-2 py-0.5 rounded border text-xs"
            placeholder="optional"
            min={0}
          />
        </label>
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setShowCompleteConfirm(true);
        }}
        className="text-xs text-accent-teal hover:underline text-left"
      >
        Complete match
      </button>
      <span className="text-xs text-slate-500">
        {groupName} · {categoryName}
      </span>
    </div>
    </>
  );
}

function CategoryTabs({
  categories,
  active,
  onChange,
}: {
  categories: string[];
  active: Category;
  onChange: (c: Category) => void;
}) {
  return (
    <div className="flex flex-wrap justify-center gap-2 mb-10">
      {categories.map((cat) => {
        const { icon: Icon } = getCategoryMeta(cat);
        const isActive = active === cat;
        return (
          <button
            key={cat}
            onClick={() => onChange(cat)}
            className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              isActive
                ? "bg-accent-teal text-white shadow-lg shadow-accent-teal/30"
                : "glass text-slate-700 dark:text-slate-300 hover:bg-accent-teal/10"
            }`}
          >
            <Icon className="w-4 h-4" />
            <span className="hidden sm:inline">{cat}</span>
            <span className="sm:hidden">{cat.split(" ")[0]}</span>
          </button>
        );
      })}
    </div>
  );
}

function GroupTabs({
  groups,
  active,
  onChange,
}: {
  groups: TournamentGroup[];
  active: string | null;
  onChange: (groupId: string) => void;
}) {
  return (
    <div className="flex flex-wrap justify-center gap-2 mb-8">
      {groups.map((group) => {
        const isActive = active === group.id;
        return (
          <button
            key={group.id}
            onClick={() => onChange(group.id)}
            className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              isActive
                ? "bg-board-dark text-white shadow-lg shadow-board-dark/30 dark:bg-board-light dark:text-board-dark"
                : "glass text-slate-700 dark:text-slate-300 hover:bg-board/10"
            }`}
          >
            {group.name}
          </button>
        );
      })}
    </div>
  );
}

function MatchProgressSummary({
  progress,
  activeCategory,
}: {
  progress: ReturnType<typeof computeTournamentMatchProgress>;
  activeCategory: Category;
}) {
  if (progress.total.total === 0) return null;

  return (
    <GlassCard hover={false} className="mb-8">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
        <div>
          <h3 className="font-display text-lg font-bold text-slate-900 dark:text-white">
            Match progress
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Completed vs total matches by category
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs font-semibold uppercase tracking-wider text-accent-teal mb-1">
            All categories
          </p>
          <MatchProgressText progress={progress.total} className="text-sm" />
        </div>
      </div>
      <MatchProgressBar progress={progress.total} />

      <div className="mt-6 grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {progress.byCategory.map((cat) => (
          <div
            key={cat.category}
            className={`rounded-xl px-3 py-2.5 ${
              cat.category === activeCategory
                ? "bg-accent-teal/10 ring-1 ring-accent-teal/30"
                : "bg-slate-100/80 dark:bg-slate-800/50"
            }`}
          >
            <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 truncate">
              {cat.category}
            </p>
            <p className="text-sm mt-0.5">
              <span className="font-bold text-slate-900 dark:text-white">
                {formatMatchProgress(cat, { suffix: "" })}
              </span>{" "}
              <span className="text-slate-500 dark:text-slate-400 text-xs">
                completed
              </span>
            </p>
            {cat.total > 0 && (
              <div className="mt-2">
                <MatchProgressBar progress={cat} />
              </div>
            )}
          </div>
        ))}
      </div>
    </GlassCard>
  );
}

function CategoryTournamentSection({
  data,
  categories,
  activeCategory,
  setActiveCategory,
  isLoading,
  adminMode,
  search,
  onMatchUpdate,
}: {
  data: CategoryData[];
  categories: string[];
  activeCategory: Category;
  setActiveCategory: (c: Category) => void;
  isLoading: boolean;
  adminMode: boolean;
  search: string;
  onMatchUpdate: (
    matchId: string,
    update: {
      status?: MatchStatus;
      winnerParticipantId?: string;
      winnerScore?: number;
      loserScore?: number;
    },
  ) => Promise<void>;
}) {
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const categoryData = data.find((d) => d.category === activeCategory);
  const statusColors: Record<MatchStatus, string> = {
    Live: "bg-red-500 text-white animate-pulse",
    Scheduled:
      "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300",
    Completed:
      "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300",
  };

  const filteredGroups = useMemo(() => {
    if (isLoading) return [];
    if (!categoryData) return [];
    const q = search.toLowerCase().trim();
    if (!q) return categoryData.groups;
    return categoryData.groups
      .map((g) => {
        const nameMatch = g.name.toLowerCase().includes(q);
        const playerMatch = g.standings.some((s) =>
          s.name.toLowerCase().includes(q),
        );
        if (nameMatch || playerMatch) return g;
        const matchHit = g.matches.some(
          (m) =>
            m.playerA.toLowerCase().includes(q) ||
            m.playerB.toLowerCase().includes(q),
        );
        return matchHit ? g : null;
      })
      .filter(Boolean) as TournamentGroup[];
  }, [categoryData, search, isLoading]);

  useEffect(() => {
    if (filteredGroups.length === 0) {
      setActiveGroupId(null);
      return;
    }
    setActiveGroupId((current) =>
      current && filteredGroups.some((g) => g.id === current)
        ? current
        : filteredGroups[0].id,
    );
  }, [filteredGroups, activeCategory]);

  const activeGroup = filteredGroups.find((g) => g.id === activeGroupId);
  const matchProgress = useMemo(
    () => computeTournamentMatchProgress(data),
    [data],
  );
  const activeGroupProgress = activeGroup
    ? matchProgressFromMatches(activeGroup.matches)
    : null;
  const isSingles = isSinglesCategory(activeCategory);
  const sortedGroupStandings = activeGroup
    ? sortStandings(activeGroup.standings)
    : [];

  const saveMatch = async (
    match: GroupMatch,
    update: {
      status?: MatchStatus;
      winnerParticipantId?: string;
      winnerScore?: number;
      loserScore?: number;
    },
  ) => {
    await onMatchUpdate(match.id, update);
  };

  return (
    <section
      id="standings"
      className="py-20 bg-slate-50/50 dark:bg-slate-900/30"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeader
          title="Tournament Standings"
          subtitle="Category → Groups → Standings & matches"
          icon={Trophy}
        />

        {adminMode && (
          <div className="flex flex-wrap justify-center gap-3 mb-8">
            <button
              type="button"
              onClick={() => void exportTournamentExcel(data)}
              disabled={!hasAnyGroups(data)}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-accent-teal text-white font-semibold text-sm shadow-lg shadow-accent-teal/25 hover:bg-accent-teal/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Download className="w-4 h-4" />
              Download Excel (group standings)
            </button>
            <button
              type="button"
              onClick={() => void exportMatchScheduleExcel(data)}
              disabled={!hasAnyMatches(data)}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-board-dark dark:bg-board text-white font-semibold text-sm shadow-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Download className="w-4 h-4" />
              Download Excel (match schedule)
            </button>
          </div>
        )}

        <MatchProgressSummary
          progress={matchProgress}
          activeCategory={activeCategory}
        />

        <CategoryTabs
          categories={categories}
          active={activeCategory}
          onChange={setActiveCategory}
        />

        {isLoading && (
          <GlassCard hover={false} className="max-w-3xl mx-auto text-center">
            <div className="flex items-center justify-center gap-3 text-accent-teal mb-3">
              <div className="w-5 h-5 rounded-full border-2 border-accent-teal/30 border-t-accent-teal animate-spin" />
              <span className="font-semibold">Loading standings...</span>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Fetching groups, standings, and matches.
            </p>
          </GlassCard>
        )}

        {!isLoading && filteredGroups.length > 0 && (
          <GroupTabs
            groups={filteredGroups}
            active={activeGroupId}
            onChange={setActiveGroupId}
          />
        )}

        {!isLoading && activeGroup && (
          <motion.div
            key={activeGroup.id}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
          >
            <GlassCard hover={false} className="overflow-hidden p-0">
              <div
                className={`px-6 py-4 bg-gradient-to-r ${getCategoryMeta(activeCategory).color} border-b border-white/20`}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-accent-teal">
                      {activeCategory}
                    </p>
                    <h3 className="font-display text-2xl font-bold">
                      {activeGroup.name} Standings
                    </h3>
                    {activeGroupProgress && activeGroupProgress.total > 0 && (
                      <p className="text-sm mt-1 text-slate-600 dark:text-slate-300">
                        <MatchProgressText progress={activeGroupProgress} />
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="p-6 grid lg:grid-cols-2 gap-8">
                <div>
                  <h4 className="font-display font-semibold mb-3 flex items-center gap-2">
                    <Users className="w-5 h-5 text-accent-teal" />
                    {isSingles ? "Players in group" : "Teams in group"}
                  </h4>
                  <ul className="space-y-2 mb-6">
                    {sortedGroupStandings.map((s, i) => (
                      <li
                        key={s.id}
                        className="flex items-center gap-2 text-slate-700 dark:text-slate-300"
                      >
                        <span className="w-6 h-6 rounded-full bg-board/20 text-xs font-bold flex items-center justify-center">
                          {i + 1}
                        </span>
                        <Circle className="w-2 h-2 fill-board text-board" />
                        {s.participantType === "PLAYER" ? (
                          <PlayerLink
                            name={s.name}
                            employeeId={s.employeeId}
                            adminMode={adminMode}
                          />
                        ) : (
                          s.name
                        )}
                      </li>
                    ))}
                  </ul>

                  <h4 className="font-display font-semibold mb-3 flex items-center gap-2">
                    <Trophy className="w-5 h-5 text-accent-gold" />
                    {isSingles ? "Individual Standings" : "Team Standings"}
                  </h4>
                  <div className="overflow-x-auto rounded-xl glass">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 dark:border-slate-700">
                          <th className="px-3 py-3 font-semibold">#</th>
                          <th className="px-3 py-3 font-semibold">
                            {isSingles ? "Player" : "Team"}
                          </th>
                          <th className="px-3 py-3 text-center font-semibold">
                            Played
                          </th>
                          <th className="px-3 py-3 text-center font-semibold">
                            W
                          </th>
                          <th className="px-3 py-3 text-center font-semibold">
                            L
                          </th>
                          <th className="px-3 py-3 text-center font-semibold">
                            Points
                          </th>
                          <th className="px-3 py-3 text-center font-semibold">
                            Score
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedGroupStandings.map(
                          (entry, idx) => (
                            <tr
                              key={entry.id}
                              className="border-b border-slate-100 dark:border-slate-800 hover:bg-accent-teal/5"
                            >
                              <td className="px-3 py-3">
                                <RankBadge rank={idx + 1} />
                              </td>
                              <td className="px-3 py-3 font-medium">
                                {entry.name}
                              </td>
                              <td className="px-3 py-3 text-center">
                                {entry.matchesPlayed}
                              </td>
                              <td className="px-3 py-3 text-center">
                                {entry.wins}
                              </td>
                              <td className="px-3 py-3 text-center">
                                {entry.losses}
                              </td>
                              <td className="px-3 py-3 text-center">
                                <span className="font-bold text-accent-teal">
                                  {entry.points}
                                </span>
                              </td>
                              <td className="px-3 py-3 text-center">
                                {entry.score}
                              </td>
                            </tr>
                          ),
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div>
                  <h4 className="font-display font-semibold mb-3 flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-accent-teal" />
                    Matches
                  </h4>
                  <div className="space-y-2 max-h-[720px] overflow-y-auto pr-1">
                    {activeGroup.matches.map((match, mi) => {
                      const scores = playerScoresForMatch(match);
                      return (
                        <div
                          key={match.id}
                          className={`flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 p-3 rounded-xl glass text-sm ${
                            match.status === "Live"
                              ? "ring-2 ring-red-500/40"
                              : ""
                          }`}
                        >
                          <span className="text-xs font-mono text-slate-400 w-16">
                            Match {mi + 1}
                          </span>
                          <div className="flex-1 font-medium">
                            {match.playerA}{" "}
                            <span className="text-accent-teal">vs</span>{" "}
                            {match.playerB}
                          </div>
                          <div className="text-xs text-slate-500">
                            {activeGroup.name} · {activeCategory}
                          </div>
                          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
                            {adminMode ? (
                              <MatchAdminControls
                                match={match}
                                groupName={activeGroup.name}
                                categoryName={activeCategory}
                                onSave={saveMatch}
                              />
                            ) : (
                              <div className="flex flex-col gap-1 items-start">
                                <span
                                  className={`px-2 py-0.5 rounded-full text-xs font-bold ${statusColors[match.status]}`}
                                >
                                  {match.status}
                                </span>
                                {match.status === "Completed" && (
                                  <span className="text-xs text-slate-500">
                                    <PlayerLink
                                      name={match.playerA}
                                      employeeId={
                                        match.participant1Type === "PLAYER"
                                          ? match.participant1EmployeeId
                                          : null
                                      }
                                      adminMode={adminMode}
                                      className="text-xs"
                                    />
                                    : {scores.playerAScore ?? "—"} ·{" "}
                                    <PlayerLink
                                      name={match.playerB}
                                      employeeId={
                                        match.participant2Type === "PLAYER"
                                          ? match.participant2EmployeeId
                                          : null
                                      }
                                      adminMode={adminMode}
                                      className="text-xs"
                                    />
                                    : {scores.playerBScore ?? "—"}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </GlassCard>
          </motion.div>
        )}

        {!isLoading && filteredGroups.length === 0 && (
          <p className="text-center text-slate-500 py-12">
            No groups or players match your search in this category.
          </p>
        )}
      </div>
    </section>
  );
}

// ─── Info, Gallery, Footer, Coming Soon ────────────────────────────────────────

function TournamentInfo() {
  const items = [
    { icon: MapPin, label: "Venue", value: "Thoughtworks Hyderabad Office" },
    {
      icon: Users,
      label: "Format",
      value: "Group stage tournament across categories",
    },
    {
      icon: Calendar,
      label: "Start Date",
      value: "12 June, 11:00 AM",
    },
  ];

  return (
    <section id="info" className="py-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeader title="Tournament Info" icon={Info} />
        <div className="grid sm:grid-cols-2 gap-6 max-w-4xl mx-auto">
          {items.map(({ icon: Icon, label, value }) => (
            <GlassCard key={label} className="flex gap-4">
              <div className="w-12 h-12 rounded-xl bg-board/20 flex items-center justify-center flex-shrink-0">
                <Icon className="w-6 h-6 text-board-dark dark:text-board-light" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-500">{label}</p>
                <p className="font-display font-bold text-lg text-slate-900 dark:text-white">
                  {value}
                </p>
              </div>
            </GlassCard>
          ))}
        </div>
      </div>
    </section>
  );
}

function Gallery({ adminMode }: { adminMode: boolean }) {
  const [images, setImages] = useState<ApiGalleryImage[]>([]);
  const [uploading, setUploading] = useState(false);
  const [galleryMessage, setGalleryMessage] = useState("");
  const [galleryError, setGalleryError] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewImages = images.slice(0, GALLERY_PREVIEW_COUNT);

  const loadImages = useCallback(async () => {
    try {
      setImages(await api.getGalleryImages());
    } catch {
      setImages([]);
    }
  }, []);

  useEffect(() => {
    void loadImages();
  }, [loadImages]);

  const handleUpload = async (file: File) => {
    setUploading(true);
    setGalleryMessage("");
    setGalleryError(false);
    try {
      await api.uploadGalleryImage(file);
      setGalleryMessage("Image uploaded");
      await loadImages();
    } catch (e) {
      setGalleryMessage(e instanceof Error ? e.message : "Upload failed");
      setGalleryError(true);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDelete = async (imageId: string) => {
    setGalleryMessage("");
    setGalleryError(false);
    try {
      await api.deleteGalleryImage(imageId);
      setGalleryMessage("Image removed");
      await loadImages();
    } catch (e) {
      setGalleryMessage(e instanceof Error ? e.message : "Delete failed");
      setGalleryError(true);
    }
  };

  return (
    <section id="gallery" className="py-20 bg-slate-50/50 dark:bg-slate-900/30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeader
          title="Tournament Gallery"
          subtitle={
            adminMode
              ? "Upload tournament photos — visible to everyone"
              : images.length > 0
                ? "Tournament moments"
                : "Photos will be added after the tournament"
          }
          icon={Camera}
        />

        {adminMode && (
          <div className="mb-6 flex flex-col sm:flex-row items-center justify-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleUpload(file);
              }}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-accent-teal text-white font-semibold text-sm disabled:opacity-50"
            >
              <ImagePlus className="w-4 h-4" />
              {uploading ? "Uploading..." : "Add Photo"}
            </button>
            {galleryMessage && (
              <p
                className={`text-sm ${galleryError ? "text-red-500" : "text-accent-teal"}`}
              >
                {galleryMessage}
              </p>
            )}
          </div>
        )}

        {previewImages.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {previewImages.map((image) => (
              <motion.div
                key={image.id}
                whileHover={{ scale: 1.02 }}
                className="relative aspect-square rounded-2xl overflow-hidden glass group"
              >
                <img
                  src={galleryImageUrl(image.url_path)}
                  alt={image.filename}
                  className="w-full h-full object-cover"
                />
                {adminMode && (
                  <button
                    onClick={() => void handleDelete(image.id)}
                    className="absolute top-2 right-2 p-2 rounded-lg bg-red-500/90 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Remove image"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {Array.from(
              { length: Math.min(3, GALLERY_PREVIEW_COUNT) },
              (_, i) => (
                <div
                  key={i}
                  className="aspect-square rounded-2xl glass flex flex-col items-center justify-center gap-2 text-slate-400"
                >
                  <Camera className="w-10 h-10 opacity-40" />
                  <span className="text-sm font-medium">No photos yet</span>
                </div>
              ),
            )}
          </div>
        )}

        <div className="mt-8 text-center">
          {images.length > GALLERY_PREVIEW_COUNT && (
            <p className="text-sm text-slate-500 mb-3">
              Showing {GALLERY_PREVIEW_COUNT} of {images.length} photos
            </p>
          )}
          <a
            href={GALLERY_DRIVE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl glass font-semibold text-sm text-accent-teal hover:bg-accent-teal/10 transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
            See more photos on Google Drive
          </a>
        </div>
      </div>
    </section>
  );
}


function Footer() {
  return (
    <footer className="py-12 border-t border-slate-200 dark:border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-4 text-center md:text-left">
            <img
              src={publicAsset("thoughtworks_flamingo_wave.png")}
              alt="Thoughtworks"
              className="w-12 h-12 rounded-lg bg-white/90 p-1 shadow-sm object-contain"
            />
            <div>
              <p className="font-display font-bold text-lg text-slate-900 dark:text-white">
                Designed for Thoughtworks Hyderabad Office
              </p>
              <p className="text-sm text-slate-500 mt-1">
                Carrom Tournament 2026 · Internal Event
              </p>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}

// ─── Search Provider (shared) ──────────────────────────────────────────────────

function GlobalSearch({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="max-w-md mx-auto mb-8">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Search players, groups & matches..."
          className="w-full pl-10 pr-4 py-3 rounded-xl glass focus:ring-2 focus:ring-accent-teal border-0"
        />
        {value && (
          <button
            onClick={() => onChange("")}
            className="absolute right-3 top-1/2 -translate-y-1/2"
          >
            <X className="w-4 h-4 text-slate-400" />
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Main App ──────────────────────────────────────────────────────────────────

export default function App() {
  const [dark, setDark] = useState(() => {
    if (typeof window === "undefined") return false;
    return (
      localStorage.getItem("theme") === "dark" ||
      window.matchMedia("(prefers-color-scheme: dark)").matches
    );
  });
  const [adminMode, setAdminMode] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [globalSearch, setGlobalSearch] = useState("");
  const [activeCategory, setActiveCategory] =
    useState<Category>("Men's Singles");
  const [tournament, setTournament] = useState<CategoryData[]>([]);
  const [apiCategories, setApiCategories] = useState<ApiCategory[]>([]);
  const [players, setPlayers] = useState<ApiPlayer[]>([]);
  const [teams, setTeams] = useState<ApiTeam[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const initialLoadStartedRef = useRef(false);

  const countdown = useCountdown(TOURNAMENT_START);

  useEffect(() => {
    let cancelled = false;
    isAdmin().then((ok) => {
      if (!cancelled) setAdminMode(ok);
    });

    if (supabase) {
      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((event, session) => {
        if (cancelled) return;
        if (event === "SIGNED_OUT" || !session) {
          setAdminMode(false);
          return;
        }
        void isAdmin().then((ok) => {
          if (!cancelled) setAdminMode(ok);
        });
      });
      return () => {
        cancelled = true;
        subscription.unsubscribe();
      };
    }

    return () => {
      cancelled = true;
    };
  }, []);

  const loadTournament = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const data = await fetchTournamentData();
      setTournament(data.tournament);
      setApiCategories(data.categories);
      setPlayers(data.players);
      setTeams(data.teams);
      setLoadError(null);
      setActiveCategory((current) =>
        DISPLAY_CATEGORIES.includes(
          current as (typeof DISPLAY_CATEGORIES)[number],
        )
          ? current
          : DISPLAY_CATEGORIES[0],
      );
    } catch (e) {
      setLoadError(
        e instanceof Error ? e.message : "Failed to load tournament data",
      );
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialLoadStartedRef.current) return;
    initialLoadStartedRef.current = true;
    void loadTournament();
  }, [loadTournament]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("theme", dark ? "dark" : "light");
  }, [dark]);

  const displayTournament = useMemo(
    () =>
      DISPLAY_CATEGORIES.map((name) => {
        const fromApi = tournament.find((c) => c.category === name);
        return (
          fromApi ?? {
            category: name,
            categoryId: "",
            groups: [],
          }
        );
      }),
    [tournament],
  );

  const categoryLabels = useMemo(
    () => displayTournament.map((c) => c.category),
    [displayTournament],
  );
  const matchProgress = useMemo(
    () => computeTournamentMatchProgress(displayTournament),
    [displayTournament],
  );
  const liveMatches = useMemo(
    () => collectLiveMatches(displayTournament),
    [displayTournament],
  );

  const goToStandings = (category?: Category) => {
    if (category) setActiveCategory(category);
    scrollTo("standings");
  };

  const handleAdminLogout = async () => {
    try {
      await signOutAdmin();
    } catch (e) {
      console.error("Admin logout failed:", e);
    } finally {
      setAdminMode(false);
    }
  };

  const handleAdminToggle = async () => {
    if (adminMode) {
      await handleAdminLogout();
      return;
    }
    if (await isAdmin()) {
      setAdminMode(true);
    } else {
      setLoginOpen(true);
    }
  };

  const handleMatchUpdate = async (
    matchId: string,
    update: {
      status?: MatchStatus;
      winnerParticipantId?: string;
      winnerScore?: number;
      loserScore?: number;
    },
  ) => {
    setTournament((prev) =>
      patchMatchInTournament(prev, matchId, {
        status: update.status,
        winnerParticipantId: update.winnerParticipantId,
        winnerScore: update.winnerScore,
        loserScore: update.loserScore,
      }),
    );

    try {
      await api.updateMatch(matchId, {
        status: update.status ? toApiStatus(update.status) : undefined,
        winner_participant_id: update.winnerParticipantId,
        winner_score: update.winnerScore,
        loser_score: update.loserScore,
      });
      await loadTournament(true);

      if (update.status === "Live") {
        requestAnimationFrame(() => {
          document
            .getElementById("live-matches")
            ?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      }
    } catch (e) {
      await loadTournament(true);
      throw e;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-50/80 via-white to-teal-50/30 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 text-slate-900 dark:text-slate-100 transition-colors duration-300">
      <Navbar
        dark={dark}
        toggleTheme={() => setDark((d) => !d)}
        toggleAdmin={handleAdminToggle}
        menuOpen={menuOpen}
        setMenuOpen={setMenuOpen}
      />
      <AdminBanner adminMode={adminMode} onLogout={handleAdminLogout} />

      <Hero countdown={countdown} onViewStandings={() => goToStandings()} />
      <StatsBar
        categoryCount={DISPLAY_CATEGORIES.length}
        playerCount={players.length}
        matchProgress={matchProgress.total}
      />
      <Categories onSelectCategory={goToStandings} />
      <RulesSection />
      <Scoring />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <GlobalSearch value={globalSearch} onChange={setGlobalSearch} />
        {loading && (
          <p className="text-center text-slate-500 mb-8">
            Loading tournament data...
          </p>
        )}
        {loadError && (
          <p className="text-center text-red-500 mb-8">
            {loadError} — ensure the backend is running at{" "}
            {import.meta.env.VITE_API_URL || "http://127.0.0.1:8000"}
          </p>
        )}
        {adminMode && (
          <AdminPanel
            categories={apiCategories}
            players={players}
            teams={teams}
            tournament={tournament}
            onRefresh={loadTournament}
          />
        )}
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <LiveMatchesBanner matches={liveMatches} />
      </div>

      <CategoryTournamentSection
        data={displayTournament}
        categories={categoryLabels}
        activeCategory={activeCategory}
        setActiveCategory={setActiveCategory}
        isLoading={loading}
        adminMode={adminMode}
        search={globalSearch}
        onMatchUpdate={handleMatchUpdate}
      />
      <TournamentInfo />
      <Gallery adminMode={adminMode} />
      <Footer />

      <AdminLoginModal
        open={loginOpen}
        onClose={() => setLoginOpen(false)}
        onSuccess={() => setAdminMode(true)}
      />
    </div>
  );
}
