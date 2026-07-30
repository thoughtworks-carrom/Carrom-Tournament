import type { CategoryData, PlayerStanding } from "./tournament";

export type KnockoutMatchFormat =
  | { type: "best-of"; boards: 3 | 5 }
  | { type: "points-or-boards"; pointsToWin: 25; maxBoards: 8 };

export const FORMAT_BO3: KnockoutMatchFormat = { type: "best-of", boards: 3 };
export const FORMAT_BO5: KnockoutMatchFormat = { type: "best-of", boards: 5 };
export const FORMAT_POINTS_OR_BOARDS: KnockoutMatchFormat = {
  type: "points-or-boards",
  pointsToWin: 25,
  maxBoards: 8,
};

export function formatLabel(format: KnockoutMatchFormat): string {
  if (format.type === "best-of") return `Best of ${format.boards} boards`;
  return "25 points or 8 boards";
}

export interface BracketSlot {
  label: string;
  name: string;
  employeeId?: string | null;
}

export interface BracketMatch {
  id: string;
  round: string;
  label: string;
  format: KnockoutMatchFormat;
  slotA: BracketSlot;
  slotB: BracketSlot;
  slotASource?: string;
  slotBSource?: string;
  slotASourceSide?: "winner" | "loser";
  slotBSourceSide?: "winner" | "loser";
}

export interface KnockoutBracket {
  title: string;
  subtitle: string;
  rounds: { name: string; matches: BracketMatch[] }[];
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

function groupFinisher(
  category: CategoryData,
  groupName: string,
  rank: number,
): BracketSlot {
  const group = category.groups.find((g) => g.name === groupName);
  const sorted = sortStandings(group?.standings ?? []);
  const player = sorted[rank - 1];
  const suffix = rank === 1 ? "1st" : rank === 2 ? "2nd" : `${rank}th`;
  return {
    label: `${groupName} ${suffix}`,
    name: player?.name ?? "TBD",
    employeeId: player?.employeeId,
  };
}

const MS_CROSSOVERS: [string, string][] = [
  ["Group A", "Group B"],
  ["Group C", "Group D"],
  ["Group E", "Group F"],
  ["Group G", "Group H"],
];

function msR1Id(gA: string, gB: string, leg: 1 | 2) {
  return `ms-r1-${gA.replace(/\s/g, "")}-${gB.replace(/\s/g, "")}-${leg}`;
}

export function buildMensSinglesKnockout(
  category: CategoryData | undefined,
): KnockoutBracket {
  const cat = category ?? { category: "Men's Singles", categoryId: "", groups: [] };

  const r1: BracketMatch[] = [];
  for (const [gA, gB] of MS_CROSSOVERS) {
    r1.push({
      id: msR1Id(gA, gB, 1),
      round: "Round 1",
      label: `${gA} 1st vs ${gB} 2nd`,
      format: FORMAT_BO3,
      slotA: groupFinisher(cat, gA, 1),
      slotB: groupFinisher(cat, gB, 2),
    });
    r1.push({
      id: msR1Id(gA, gB, 2),
      round: "Round 1",
      label: `${gB} 1st vs ${gA} 2nd`,
      format: FORMAT_BO3,
      slotA: groupFinisher(cat, gB, 1),
      slotB: groupFinisher(cat, gA, 2),
    });
  }

  const r2: BracketMatch[] = [
    {
      id: "ms-r2-ab-cd-1",
      round: "Quarterfinals",
      label: "Quarterfinal · AB × CD leg 1",
      format: FORMAT_BO3,
      slotA: { label: "TBD", name: "TBD" },
      slotB: { label: "TBD", name: "TBD" },
      slotASource: msR1Id("Group A", "Group B", 1),
      slotBSource: msR1Id("Group C", "Group D", 1),
    },
    {
      id: "ms-r2-ab-cd-2",
      round: "Quarterfinals",
      label: "Quarterfinal · AB × CD leg 2",
      format: FORMAT_BO3,
      slotA: { label: "TBD", name: "TBD" },
      slotB: { label: "TBD", name: "TBD" },
      slotASource: msR1Id("Group A", "Group B", 2),
      slotBSource: msR1Id("Group C", "Group D", 2),
    },
    {
      id: "ms-r2-ef-gh-1",
      round: "Quarterfinals",
      label: "Quarterfinal · EF × GH leg 1",
      format: FORMAT_BO3,
      slotA: { label: "TBD", name: "TBD" },
      slotB: { label: "TBD", name: "TBD" },
      slotASource: msR1Id("Group E", "Group F", 1),
      slotBSource: msR1Id("Group G", "Group H", 1),
    },
    {
      id: "ms-r2-ef-gh-2",
      round: "Quarterfinals",
      label: "Quarterfinal · EF × GH leg 2",
      format: FORMAT_BO3,
      slotA: { label: "TBD", name: "TBD" },
      slotB: { label: "TBD", name: "TBD" },
      slotASource: msR1Id("Group E", "Group F", 2),
      slotBSource: msR1Id("Group G", "Group H", 2),
    },
  ];

  const r3: BracketMatch[] = [
    {
      id: "ms-sf-1",
      round: "Semi-final",
      label: "Semi-final 1",
      format: FORMAT_BO5,
      slotA: { label: "TBD", name: "TBD" },
      slotB: { label: "TBD", name: "TBD" },
      slotASource: "ms-r2-ab-cd-1",
      slotBSource: "ms-r2-ab-cd-2",
    },
    {
      id: "ms-sf-2",
      round: "Semi-final",
      label: "Semi-final 2",
      format: FORMAT_BO5,
      slotA: { label: "TBD", name: "TBD" },
      slotB: { label: "TBD", name: "TBD" },
      slotASource: "ms-r2-ef-gh-1",
      slotBSource: "ms-r2-ef-gh-2",
    },
  ];

  const r4: BracketMatch[] = [
    {
      id: "ms-final",
      round: "Final",
      label: "Championship Final",
      format: FORMAT_POINTS_OR_BOARDS,
      slotA: { label: "TBD", name: "TBD" },
      slotB: { label: "TBD", name: "TBD" },
      slotASource: "ms-sf-1",
      slotBSource: "ms-sf-2",
    },
  ];

  return {
    title: "Men's Singles Knockout",
    subtitle: "",
    rounds: [
      { name: "Round 1", matches: r1 },
      { name: "Round 2", matches: r2 },
      { name: "Semi-finals", matches: r3 },
      { name: "Final", matches: r4 },
    ],
  };
}

function topFour(category: CategoryData): BracketSlot[] {
  const group = category.groups[0];
  const sorted = sortStandings(group?.standings ?? []);
  const labels = ["1st", "2nd", "3rd", "4th"];
  return labels.map((lbl, i) => ({
    label: `Table ${lbl}`,
    name: sorted[i]?.name ?? "TBD",
    employeeId: sorted[i]?.employeeId,
  }));
}

export function buildMensDoublesKnockout(
  category: CategoryData | undefined,
): KnockoutBracket {
  const cat = category ?? { category: "Men's Doubles", categoryId: "", groups: [] };

  const MD_CROSSOVERS: [string, string][] = [
    ["Group A", "Group B"],
    ["Group C", "Group D"],
  ];

  function mdR1Id(gA: string, gB: string, leg: 1 | 2) {
    return `md-r1-${gA.replace(/\s/g, "")}-${gB.replace(/\s/g, "")}-${leg}`;
  }

  const r1: BracketMatch[] = [];
  for (const [gA, gB] of MD_CROSSOVERS) {
    r1.push({
      id: mdR1Id(gA, gB, 1),
      round: "Round 1",
      label: `${gA} 1st vs ${gB} 2nd`,
      format: FORMAT_BO3,
      slotA: groupFinisher(cat, gA, 1),
      slotB: groupFinisher(cat, gB, 2),
    });
    r1.push({
      id: mdR1Id(gA, gB, 2),
      round: "Round 1",
      label: `${gB} 1st vs ${gA} 2nd`,
      format: FORMAT_BO3,
      slotA: groupFinisher(cat, gB, 1),
      slotB: groupFinisher(cat, gA, 2),
    });
  }

  const r2: BracketMatch[] = [
    {
      id: "md-r2-ab-cd-1",
      round: "Semifinals",
      label: "Semifinal · AB × CD leg 1",
      format: FORMAT_BO5,
      slotA: { label: "TBD", name: "TBD" },
      slotB: { label: "TBD", name: "TBD" },
      slotASource: mdR1Id("Group A", "Group B", 1),
      slotBSource: mdR1Id("Group C", "Group D", 1),
    },
    {
      id: "md-r2-ab-cd-2",
      round: "Semifinals",
      label: "Semifinal · AB × CD leg 2",
      format: FORMAT_BO5,
      slotA: { label: "TBD", name: "TBD" },
      slotB: { label: "TBD", name: "TBD" },
      slotASource: mdR1Id("Group A", "Group B", 2),
      slotBSource: mdR1Id("Group C", "Group D", 2),
    },
  ];

  const r3: BracketMatch[] = [
    {
      id: "md-final",
      round: "Final",
      label: "Championship Final",
      format: FORMAT_POINTS_OR_BOARDS,
      slotA: { label: "TBD", name: "TBD" },
      slotB: { label: "TBD", name: "TBD" },
      slotASource: "md-r2-ab-cd-1",
      slotBSource: "md-r2-ab-cd-2",
    },
  ];

  return {
    title: "Men's Doubles Knockout",
    subtitle: "",
    rounds: [
      { name: "Round 1", matches: r1 },
      { name: "Semifinals", matches: r2 },
      { name: "Final", matches: r3 },
    ],
  };
}

export function buildWomensSinglesKnockout(
  category: CategoryData | undefined,
): KnockoutBracket {
  const cat = category ?? { category: "Women's Singles", categoryId: "", groups: [] };
  const [first, second, third, fourth] = topFour(cat);

  return {
    title: "Women's Singles Playoffs",
    subtitle: "",
    rounds: [
      {
        name: "Playoffs",
        matches: [
          {
            id: "ws-q1",
            round: "Qualifier 1",
            label: "Qualifier 1",
            format: FORMAT_BO3,
            slotA: first,
            slotB: second,
          },
          {
            id: "ws-elim",
            round: "Eliminator",
            label: "Eliminator",
            format: FORMAT_BO3,
            slotA: third,
            slotB: fourth,
          },
          {
            id: "ws-q2",
            round: "Qualifier 2",
            label: "Qualifier 2",
            format: FORMAT_BO3,
            slotA: { label: "TBD", name: "TBD" },
            slotB: { label: "TBD", name: "TBD" },
            slotASource: "ws-q1",
            slotASourceSide: "loser",
            slotBSource: "ws-elim",
          },
          {
            id: "ws-final",
            round: "Final",
            label: "Final",
            format: FORMAT_POINTS_OR_BOARDS,
            slotA: { label: "TBD", name: "TBD" },
            slotB: { label: "TBD", name: "TBD" },
            slotASource: "ws-q1",
            slotBSource: "ws-q2",
          },
        ],
      },
    ],
  };
}

/** All knockout fixture ids for DB seeding and sync. */
export function allKnockoutFixtures(): { id: string; category: string }[] {
  const empty = { category: "", categoryId: "", groups: [] } as CategoryData;
  const brackets = [
    { category: "Men's Singles", bracket: buildMensSinglesKnockout(empty) },
    { category: "Men's Doubles", bracket: buildMensDoublesKnockout(empty) },
    { category: "Women's Singles", bracket: buildWomensSinglesKnockout(empty) },
  ];
  const fixtures: { id: string; category: string }[] = [];
  for (const { category, bracket } of brackets) {
    for (const round of bracket.rounds) {
      for (const match of round.matches) {
        fixtures.push({ id: match.id, category });
      }
    }
  }
  return fixtures;
}
