// Shapes shared by the API routes and the Mini App.

export const YEARS = [
  { value: "1", label: "1st year" },
  { value: "2", label: "2nd year" },
  { value: "3", label: "3rd year" },
  { value: "4", label: "4th year" },
  { value: "masters", label: "Master's" },
] as const;

export type Year = (typeof YEARS)[number]["value"];

export const BACHELOR_YEARS = YEARS.filter((y) => y.value !== "masters");

export const MAJORS = {
  bachelors: [
    "AI in Business",
    "Business Administration",
    "Business and Technology",
    "Computer Science",
    "Cybersecurity",
    "Data Science",
    "Finance and FinTech",
    "Industrial Engineering",
    "International Trade",
    "International Relations & Diplomacy",
    "Marketing & Communication",
    "Software Engineering",
    "Tourism",
  ],
  masters: ["AI and Business Transformation", "Global Management", "MBA", "TESOL"],
} as const;

export type Degree = keyof typeof MAJORS;
export const ALL_MAJORS: readonly string[] = [...MAJORS.bachelors, ...MAJORS.masters];
export const degreeOfMajor = (major: string): Degree | null =>
  (MAJORS.bachelors as readonly string[]).includes(major) ? "bachelors" : (MAJORS.masters as readonly string[]).includes(major) ? "masters" : null;

export const yearLabel = (y: string) => YEARS.find((o) => o.value === y)?.label ?? y;

export type SeasonStatus = "registration" | "active" | "finished";

export interface Profile {
  id: string;
  name: string;
  major: string;
  year: Year;
  username: string | null;
  banned: boolean;
}

export interface MeResponse {
  leagueName: string;
  telegramId: number;
  firstName: string;
  lastName: string | null;
  player: Profile | null;
  isAdmin: boolean;
  dev: boolean;
}

export interface Season {
  id: string;
  name: string;
  status: SeasonStatus;
  registrationOpen: boolean;
  registrationClosesAt: string | null;
  gamesPerMatch: number;
  /** Players can join now: not finished, registration open, deadline (if any) not passed. */
  acceptingPlayers: boolean;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface SeasonListItem {
  id: string;
  name: string;
  status: SeasonStatus;
}

export interface LeaguePlayer {
  id: string;
  name: string;
  major: string;
  year: Year;
  username: string | null;
}

export interface Match {
  id: string;
  day: number;
  /** YYYY-MM-DD */
  dayDate: string | null;
  /** Order of play within the day. */
  round: number;
  player1Id: string;
  player2Id: string;
  score1: number | null;
  score2: number | null;
  playedAt: string | null;
}

export interface StandingRow {
  playerId: string;
  position: number;
  played: number;
  wins: number;
  losses: number;
  points: number;
  scoreFor: number;
  scoreAgainst: number;
  /** Last results, most recent first. */
  form: ("W" | "L")[];
}

export interface LeagueResponse {
  seasons: SeasonListItem[];
  season: Season | null;
  players: LeaguePlayer[];
  matches: Match[];
  standings: StandingRow[];
  me: { playerId: string | null; joined: boolean };
}

export interface AdminPlayer extends Profile {
  telegramId: number;
  createdAt: string;
}

export type AdminAction =
  | { action: "createSeason"; name: string; closesAt: string | null; gamesPerMatch: number }
  | { action: "updateSeason"; seasonId: string; name?: string; registrationOpen?: boolean; closesAt?: string | null; gamesPerMatch?: number }
  | { action: "startSeason"; seasonId: string }
  | { action: "addMatchDay"; seasonId: string; date: string; playerIds: string[]; mode: "perPlayer" | "total"; count: number; notify: boolean }
  | { action: "removeMatchDay"; seasonId: string; day: number }
  | { action: "finishSeason"; seasonId: string }
  | { action: "deleteSeason"; seasonId: string }
  | { action: "addToSeason"; seasonId: string; playerId: string }
  | { action: "removeFromSeason"; seasonId: string; playerId: string }
  | { action: "setScore"; matchId: string; score1: number | null; score2: number | null }
  | { action: "updatePlayer"; playerId: string; name: string; major: string; year: Year }
  | { action: "setBanned"; playerId: string; banned: boolean };
