/**
 * Replay file format — the bridge between open tracking data (Metrica /
 * other tracking sources) and the engine. The bundled converter supports Metrica CSV.
 *
 * v3 stores all roster identities and optional appearance intervals; stride is players.length*2+2.
 * v1/v2 remain compatible with 22 players.
 * One file is a flat array of frames. In v1/v2 player order is fixed: the first eleven
 * entries are the home team, the next eleven the away team, each in the order
 * the `players` array declares. Every frame stores 22 × (x, y) then the ball,
 * all in pitch-percent units (out-of-bounds positions are allowed).
 * v2 uses null for missing coordinates; legacy files use (-1, -1) for missing ball.
 */
import type { Lineup, MatchResponse, Player, Team } from '../types';

export const PLAYERS = 22;
export const STRIDE = PLAYERS * 2 + 2;

export interface ReplayTeam {
  id: string;
  name: string;
  abbr: string;
  color: string;
}

export interface ReplayPlayer {
  id: string;
  name: string;
  jersey: string;
  teamId: string;
  activeFrom?: number;
  activeUntil?: number;
}

export interface ReplayFile {
  id: string;
  title: string;
  source: string;
  fps: number;
  duration: number;
  teams: [ReplayTeam, ReplayTeam];
  players: ReplayPlayer[];
  hasBall: boolean;
  frames: Array<number | null>;
  formatVersion?: number;
  periods?: number[];
  substitutions?: Array<{time: number; teamId: string; out: string; in: string; source: string}>;
}

export function playerCount(replay: ReplayFile): number {
  return (replay.formatVersion ?? 1) >= 3 ? replay.players.length : PLAYERS;
}

export function frameCount(replay: ReplayFile): number {
  return Math.floor(replay.frames.length / (playerCount(replay) * 2 + 2));
}

/** Sample a fractional frame; never interpolate through missing data or a period boundary. */
export function frameAt(replay: ReplayFile, index: number) {
  const count = frameCount(replay), slots = playerCount(replay), stride = slots * 2 + 2;
  const value = Math.max(0, Math.min(Number.isFinite(index) ? index : 0, count - 1));
  const left = Math.floor(value), right = Math.min(count - 1, left + 1);
  const alpha = value - left;
  const samePeriod = !replay.periods || replay.periods[left] === replay.periods[right];
  const read = (frame: number, slot: number): { x: number; y: number } | undefined => {
    const x = replay.frames[frame * stride + slot * 2], y = replay.frames[frame * stride + slot * 2 + 1];
    if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) return;
    if (slot === slots && (replay.formatVersion ?? 1) < 2 && x === -1 && y === -1) return;
    return { x, y };
  };
  const position = (slot: number) => {
    const member = replay.players[slot];
    const seconds = value / replay.fps;
    if (slot < slots && member && (seconds < (member.activeFrom ?? 0) || seconds >= (member.activeUntil ?? Infinity))) return;
    const a = read(left, slot), b = read(right, slot);
    if (!a) return;
    if (alpha === 0 || !samePeriod || !b) return a;
    return { x: a.x + (b.x-a.x)*alpha, y: a.y+(b.y-a.y)*alpha };
  };
  const players = Array.from({ length: slots }, (_, slot) => {
    const p = position(slot);
    return p ? { ...p, id: replay.players[slot]?.id, visible: true } : { id: replay.players[slot]?.id, x: 0, y: 0, visible: false };
  });
  return { players, ball: replay.hasBall ? position(slots) : undefined };
}

/** Include the final sample's display interval; old files remain compatible. */
export function replayEnd(replay: ReplayFile): number {
  const count = frameCount(replay);
  return Math.max(0, Math.min(count, replay.duration > 0 ? replay.duration * replay.fps : count));
}

export function advanceReplay(replay: ReplayFile, index: number, elapsedSeconds: number, speed = 1): number {
  return Math.min(replayEnd(replay), Math.max(0, index) + Math.max(0, elapsedSeconds) * replay.fps * speed);
}

export function replayChapters(replay: ReplayFile) {
  const chapters = [{ seconds: 0, label: '开场' }];
  replay.periods?.forEach((period, i, periods) => {
    if (i > 0 && period !== periods[i - 1]) chapters.push({ seconds: i / replay.fps, label: `第 ${period} 节开始` });
  });
  for (const sub of replay.substitutions ?? []) {
    const outgoing = replay.players.find(p => p.id === sub.out);
    const incoming = replay.players.find(p => p.id === sub.in);
    const team = replay.teams.find(t => t.id === sub.teamId);
    chapters.push({ seconds: Math.max(0,sub.time - 1), label: `${team?.abbr ?? ''} ${outgoing?.jersey}→${incoming?.jersey} 换人前（追踪推断）` });
    chapters.push({ seconds: Math.min(replay.duration,sub.time + .1), label: `${team?.abbr ?? ''} ${outgoing?.jersey}→${incoming?.jersey} 换人后（追踪推断）` });
  }
  chapters.push({ seconds: Math.max(0,replay.duration - 2), label: '终场前' });
  return chapters.sort((a,b) => a.seconds-b.seconds);
}

/** 4-4-2 skeleton, used only to place players before the first frame lands. */
const SLOTS: Array<[number, number]> = [
  [5, 50],
  [18, 18],
  [16, 38],
  [16, 62],
  [18, 82],
  [38, 16],
  [36, 38],
  [36, 62],
  [38, 84],
  [66, 34],
  [66, 66],
];

function teamOf(team: ReplayTeam, side: 'home' | 'away'): Team {
  return {
    id: team.id,
    name: team.name,
    shortName: team.name,
    abbr: team.abbr,
    color: team.color,
    altColor: '#f0eee4',
    logo: null,
    score: 0,
    shootoutScore: 0,
    winner: false,
    form: '',
    homeAway: side,
  };
}

function lineupOf(replay: ReplayFile, side: 'home' | 'away'): Lineup {
  const index = side === 'home' ? 0 : 1;
  const team = replay.teams[index];
  const all = replay.players.filter((player) => player.teamId === team.id);
  const members = (replay.formatVersion ?? 1) >= 3 ? all : all.slice(0, 11);
  const starters: Player[] = members.map((member, slot) => {
    const [sx, sy] = SLOTS[slot % SLOTS.length];
    return {
      id: member.id,
      name: member.name,
      shortName: member.name,
      jersey: member.jersey,
      position: 'MF',
      positionAbbr: slot === 0 ? 'GK' : 'MF',
      formationPlace: String(slot + 1),
      starter: true,
      slotX: side === 'home' ? sx : 100 - sx,
      slotY: sy,
      lineIndex: Math.min(3, Math.floor(slot / 3)),
    };
  });
  return {
    teamId: team.id,
    formation: '4-4-2',
    starters,
    benchCount: 0,
    available: true,
  };
}

/** Replay-only lineup contains every tracked identity; frame visibility controls who is on pitch. */
export function createReplayMatch(replay: ReplayFile): MatchResponse {
  const home = teamOf(replay.teams[0], 'home');
  const away = teamOf(replay.teams[1], 'away');
  return {
    id: replay.id,
    league: { id: 'replay', name: replay.title, slug: 'replay', abbr: 'RPL' },
    date: new Date(0).toISOString(),
    venue: { name: '', city: '', country: '' },
    status: {
      state: 'in',
      completed: false,
      name: 'STATUS_IN_PROGRESS',
      description: '',
      detail: '',
      shortDetail: '',
      clock: 0,
      displayClock: "0'",
      period: 1,
    },
    statusLabel: '',
    home,
    away,
    lineups: { home: lineupOf(replay, 'home'), away: lineupOf(replay, 'away') },
    stats: [],
    timeline: [],
    commentary: [],
    plays: [],
    playCount: 0,
    latestPlayClock: null,
    latestPlay: null,
    playsError: null,
    source: {
      provider: replay.source,
      summaryUrl: '',
      fetchedAt: new Date(0).toISOString(),
      playByPlay: false,
      tracksBall: replay.hasBall,
    },
  };
}

export function clockLabel(replay: ReplayFile, index: number): string {
  const seconds = Math.min(replayEnd(replay), Math.max(0, index)) / replay.fps + 1e-8;
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60);
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}
