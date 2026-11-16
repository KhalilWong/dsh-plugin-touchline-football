export type MatchState = 'pre' | 'in' | 'post';

export interface Team {
  id: string;
  name: string;
  shortName: string;
  abbr: string;
  color: string;
  altColor: string;
  logo: string | null;
  score: number;
  shootoutScore: number;
  winner: boolean;
  form: string;
  homeAway: 'home' | 'away';
}

export interface MatchStatus {
  state: MatchState;
  completed: boolean;
  name: string;
  description: string;
  detail: string;
  shortDetail: string;
  clock: number;
  displayClock: string;
  period: number;
}

export interface MatchSummary {
  id: string;
  date: string;
  leagueName: string;
  leagueId: string | null;
  venue: string;
  city: string;
  country: string;
  status: MatchStatus;
  home: Team;
  away: Team;
  broadcasts: string[];
  hasPlayByPlay: boolean;
}

export interface ScoreboardResponse {
  date: string;
  fetchedAt: string;
  count: number;
  liveCount: number;
  matches: MatchSummary[];
  cached?: boolean;
  stale?: boolean;
  warning?: string;
}

export interface Player {
  id: string;
  name: string;
  shortName: string;
  jersey: string;
  position: string;
  positionAbbr: string;
  formationPlace: string;
  starter: boolean;
  subbedIn?: boolean;
  subbedOut?: boolean;
  slotX: number;
  slotY: number;
  lineIndex: number;
}

export interface Lineup {
  teamId: string;
  formation: string;
  starters: Player[];
  benchCount: number;
  available: boolean;
  synthetic?: boolean;
}

export interface Stat {
  key: string;
  label: string;
  home: number | null;
  away: number | null;
  homeDisplay: string;
  awayDisplay: string;
}

export interface Play {
  id: string;
  order: number;
  type: string;
  typeText: string;
  text: string;
  shortText: string;
  clock: number;
  totalClock: number;
  displayClock: string;
  addedClock: number;
  period: number;
  teamId: string | null;
  playerName: string;
  jersey: string;
  x: number | null;
  y: number | null;
  x2: number | null;
  y2: number | null;
  scoring: boolean;
  goal: boolean;
  yellow: boolean;
  red: boolean;
  sub: boolean;
  shot: boolean;
  corner: boolean;
  foul: boolean;
  offside: boolean;
  save: boolean;
  penalty: boolean;
  ownGoal: boolean;
  shootout: boolean;
  wallclock?: string | null;
  homeScore?: number | null;
  awayScore?: number | null;
}

export interface TimelineEvent {
  id: string;
  type: string;
  typeText: string;
  text: string;
  shortText: string;
  clock: number;
  totalClock: number;
  displayClock: string;
  addedClock: number;
  period: number;
  teamId: string | null;
  playerName: string;
  jersey: string;
  x: number | null;
  y: number | null;
  x2: number | null;
  y2: number | null;
  scoring: boolean;
  goal: boolean;
  yellow: boolean;
  red: boolean;
  sub: boolean;
  shot: boolean;
  corner: boolean;
  foul: boolean;
  offside: boolean;
  save: boolean;
  penalty: boolean;
  ownGoal: boolean;
  shootout: boolean;
}

export interface CommentaryItem {
  id: string;
  sequence: number;
  clock: number;
  displayClock: string;
  text: string;
  type: string;
  teamId: string | null;
  playerName: string;
  x: number | null;
  y: number | null;
  x2: number | null;
  y2: number | null;
  scoring: boolean;
}

export interface MatchResponse {
  id: string;
  league: { id: string; name: string; slug: string; abbr: string };
  date: string;
  venue: { name: string; city: string; country: string };
  status: MatchStatus;
  statusLabel: string;
  home: Team;
  away: Team;
  lineups: { home: Lineup; away: Lineup };
  stats: Stat[];
  timeline: TimelineEvent[];
  commentary: CommentaryItem[];
  plays: Play[];
  playCount: number;
  latestPlayClock: number | null;
  latestPlay: Play | null;
  playsError: string | null;
  source: {
    provider: string;
    summaryUrl: string;
    fetchedAt: string;
    playByPlay: boolean;
    tracksBall: boolean;
  };
  cached?: boolean;
  stale?: boolean;
  warning?: string;
  fetchedAt?: string;
}

export type MatchMode = 'live' | 'replay' | 'pre';

export interface Vec {
  x: number;
  y: number;
}

export interface EnginePlayer {
  id: string;
  teamId: string;
  side: 'home' | 'away';
  name: string;
  shortName: string;
  jersey: string;
  role: string;
  base: Vec;
  pos: Vec;
  target: Vec;
  active: boolean;
  hasBall: boolean;
}

export interface EngineSnapshot {
  mode: MatchMode;
  simSecond: number;
  clockLabel: string;
  periodLabel: string;
  score: { home: number; away: number };
  event: Play | null;
  lastEvent: Play | null;
  flash: Play | null;
  possession: 'home' | 'away' | null;
  playing: boolean;
  speed: number;
  progress: number;
  activePlayer: EnginePlayer | null;
  lastUpdated: string;
}
