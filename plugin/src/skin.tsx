/**
 * Touchline — browser half: one match, two faces.
 *
 *  - a floating window (`shell.overlay`) carries the picture: drag to move,
 *    three sizes, and its own live-match menu;
 *  - a one-line pill under the composer carries the status: clock and score at
 *    a glance, a click to show or hide the window, and a `▾` to switch match.
 *
 * Both read one store, so the pill and the window never disagree. The shell
 * itself is untouched: nothing is painted over the pitch and no host surface is
 * restyled. Live matches only; with none on the board both faces disappear.
 *
 * @module dsh-plugin-touchline/client
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MatchEngine, registerTeamColor } from '../../src/lib/engine';
import type { EngineSnapshot, MatchResponse, MatchSummary, TimelineEvent } from '../../src/types';
import { clockLabel, createReplayMatch, frameAt, replayEnd, advanceReplay, replayChapters, type ReplayFile } from '../../src/replay/format';
import widgetCss from './skin.css?inline';

const API = '/api/touchline';
const LIVE_POLL_MS = 30_000;
const MATCH_POLL_MS = 5_000;

const SIZES = [
  { width: 400, height: 268 },
  { width: 540, height: 352 },
  { width: 760, height: 486 },
];
const DEFAULT_SIZE = 1;

const STORE = {
  pos: 'dsh.touchline.position',
  size: 'dsh.touchline.size',
  open: 'dsh.touchline.open',
  events: 'dsh.touchline.events',
};

/** Height of the key-event log under the pitch. */
const EVENTS_HEIGHT = 128;
/** Boss key: hide window and pill at once, press again to bring them back. */
const BOSS_KEY = { code: 'KeyX', label: 'Ctrl+Shift+X' };

function readStored<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

function writeStored(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode: keep the session-only value */
  }
}

interface ReplayEntry {
  id: string;
  title: string;
  duration: number;
  fps: number;
}

interface LiveView {
  matches: MatchSummary[];
  selectedId: string | null;
  match: MatchResponse | null;
  snapshot: EngineSnapshot | null;
  error: string | null;
  windowOpen: boolean;
  eventsOpen: boolean;
  hidden: boolean;
  hasCoordinates: boolean;
  replays: ReplayEntry[];
  mode: 'live' | 'replay';
  replayTitle: string;
  replayClock: string;
  replayPlaying: boolean;
  replayBallMissing?: boolean;
  replaySeconds?: number;
  replayPeriod?: number;
}

const view: LiveView = {
  matches: [],
  selectedId: null,
  match: null,
  snapshot: null,
  error: null,
  windowOpen: readStored<boolean>(STORE.open, true),
  eventsOpen: readStored<boolean>(STORE.events, true),
  hidden: false,
  hasCoordinates: true,
  replays: [],
  mode: 'live',
  replayTitle: '',
  replayClock: '0:00',
  replayPlaying: false,
};

/** Playback state for a loaded replay file (module-scoped, like `view`). */
const playback = {
  updatedAt: 0,
  file: null as ReplayFile | null,
  index: 0,
  playing: false,
};

const listeners = new Set<() => void>();

function update(patch: Partial<LiveView>) {
  Object.assign(view, patch);
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function setWindowOpen(open: boolean) {
  writeStored(STORE.open, open);
  update({ windowOpen: open });
}

function toggleEvents(open: boolean) {
  writeStored(STORE.events, open);
  update({ eventsOpen: open });
}

function isBossCombo(event: KeyboardEvent) {
  return (
    (event.ctrlKey || event.metaKey) && event.shiftKey && event.code === BOSS_KEY.code
  );
}

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { cache: 'no-store', signal, headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return (await response.json()) as T;
}

/**
 * Live matches for today. Prefers the filtered route; a host still running an
 * older build answers on the full board, so the window keeps working without a
 * host restart after the upgrade.
 */
async function fetchLive(): Promise<MatchSummary[]> {
  try {
    const data = await getJson<{ matches?: MatchSummary[] }>(`${API}/live`);
    return Array.isArray(data.matches) ? data.matches : [];
  } catch {
    const data = await getJson<{ matches?: MatchSummary[] }>(`${API}/scoreboard`);
    return (Array.isArray(data.matches) ? data.matches : []).filter(
      (item) => item?.status?.state === 'in',
    );
  }
}

/** Polling and engine state, independent of any DOM: both faces can unmount. */
class LiveFeed {
  engine = new MatchEngine();
  private timers = new Set<number>();
  private matchTimer: number | undefined;
  private generation = 0;
  private disposed = false;
  private matchController: AbortController | undefined;
  private failures = 0;

  start() {
    void this.probe();
    void this.pollLive();
    void this.loadReplays();
  }

  /** Replay files placed next to the project (`data/replay`), if the host has any. */
  async loadReplays() {
    try {
      const data = await getJson<{ replays?: ReplayEntry[] }>(`${API}/replays`);
      if (!this.disposed) update({ replays: Array.isArray(data.replays) ? data.replays : [] });
    } catch {
      /* host without replay support: the menu simply has no replay section */
    }
  }

  /** Ask the host which source it runs and whether it carries pitch positions. */
  private async probe() {
    try {
      const info = await getJson<{ capabilities?: { coordinates?: boolean } }>(`${API}/health`);
      if (!this.disposed) {
        update({ hasCoordinates: info?.capabilities?.coordinates !== false });
      }
    } catch {
      /* older host build: assume coordinates, the live call decides */
    }
  }

  dispose() {
    this.disposed = true;
    this.cancelMatch();
    for (const timer of this.timers) window.clearTimeout(timer);
    this.timers.clear();
    playback.file = null;
    playback.playing = false;
    playback.index = 0;
    update({ selectedId: null, match: null, snapshot: null, mode: 'live',
      replayTitle: '', replayClock: '0:00', replayPlaying: false, hidden: false, error: null });
  }

  private cancelMatch() {
    this.generation += 1;
    this.matchController?.abort();
    this.matchController = undefined;
    this.failures = 0;
    if (this.matchTimer !== undefined) window.clearTimeout(this.matchTimer);
    this.matchTimer = undefined;
  }

  select(id: string) {
    if (this.disposed) return;
    const wasReplay = view.mode === 'replay';
    this.cancelMatch();
    if (wasReplay) {
      playback.file = null;
      playback.playing = false;
      update({ mode: 'live', replayTitle: '', replayPlaying: false });
    }
    update({ selectedId: id, match: null, snapshot: null, error: null });
    this.engine = new MatchEngine();
    void this.pollMatch();
  }

  /** Load one replay JSON and switch the window into replay mode. */
  async playReplay(id: string) {
    if (this.disposed) return;
    this.cancelMatch();
    const generation = this.generation;
    try {
      const file = await getJson<ReplayFile>(`${API}/replay?id=${encodeURIComponent(id)}`);
      if (this.disposed || generation !== this.generation) return;
      this.cancelMatch();
      const engine = new MatchEngine();
      engine.setMatch(createReplayMatch(file));
      registerTeamColor(file.teams[0].id, file.teams[0].color);
      registerTeamColor(file.teams[1].id, file.teams[1].color);
      this.engine = engine;
      playback.file = file;
      playback.index = 0;
      playback.updatedAt = typeof performance !== 'undefined' ? performance.now() : 0;
      playback.playing = true;
      update({
        mode: 'replay',
        replayTitle: file.title,
        replayClock: clockLabel(file, 0),
        replaySeconds: 0,
        replayPeriod: file.periods?.[0] ?? 1,
        replayBallMissing: !frameAt(file,0).ball,
        replayPlaying: true,
        windowOpen: true,
        match: null,
        snapshot: null,
        error: null,
      });
    } catch (error) {
      if (this.disposed || generation !== this.generation) return;
      update({ error: error instanceof Error ? error.message : String(error) });
      if (view.mode === 'live') void this.pollMatch();
    }
  }

  private schedule(run: () => void, ms: number) {
    const timer = window.setTimeout(() => {
      this.timers.delete(timer);
      run();
    }, ms);
    this.timers.add(timer);
  }

  private async pollLive() {
    if (this.disposed) return;
    try {
      const matches = await fetchLive();
      if (this.disposed) return;
      const stillLive =
        view.selectedId !== null && matches.some((item) => item.id === view.selectedId);
      update({ matches });
      if (!stillLive && view.mode === 'live') {
        const next = matches[0];
        if (next) this.select(next.id);
        else {
          this.cancelMatch();
          update({ selectedId: null, match: null, snapshot: null });
        }
      }
    } catch (error) {
      if (!this.disposed) {
        update({ error: error instanceof Error ? error.message : String(error) });
      }
    } finally {
      if (!this.disposed) this.schedule(() => void this.pollLive(), LIVE_POLL_MS);
    }
  }

  private async pollMatch() {
    const id = view.selectedId;
    const generation = this.generation;
    if (!id || this.disposed || view.mode !== 'live') return;
    const current = () => !this.disposed && view.mode === 'live' &&
      view.selectedId === id && generation === this.generation;
    const started = Date.now();
    this.matchController = new AbortController();
    try {
      const signal = AbortSignal.any([this.matchController.signal,AbortSignal.timeout(15000)]);
      const match = await getJson<MatchResponse>(`${API}/match?id=${encodeURIComponent(id)}`, signal);
      if (!current()) return;
      if (view.match?.fetchedAt && match.fetchedAt && Date.parse(match.fetchedAt)<Date.parse(view.match.fetchedAt)) return;
      // A play feed failure must not erase the last known event positions.
      if (match.playsError && !match.plays.length && view.match?.id === match.id) match.plays = view.match.plays;
      this.engine.setMatch(match);
      this.failures = match.stale || match.playsError ? this.failures + 1 : 0;
      update({ match, error: match.stale ? '数据源暂不可用，保留最后位置' : match.playsError ? '事件数据暂不可用，保留最后位置' : null });
    } catch (error) {
      if (current()) {
        this.failures++;
        if (view.match) view.match.stale = true;
        update({ error: error instanceof Error ? error.message : String(error) });
      }
    } finally {
      if (current()) {
        const interval = Math.min(30000, MATCH_POLL_MS * 2 ** Math.min(this.failures,3));
        this.matchTimer = window.setTimeout(() => void this.pollMatch(), Math.max(1000, interval-(Date.now()-started)));
      }
    }
  }
}

let feed: LiveFeed | null = null;

/* ------------------------------------------------------------- shared bits */

function currentMatch(state: LiveView) {
  return (
    state.match ?? state.matches.find((item) => item.id === state.selectedId) ?? state.matches[0]
  );
}

/* --------------------------------------------------------- key moments */

type KeyKind = 'goal' | 'own' | 'penalty' | 'yellow' | 'red' | 'sub' | 'break';

interface KeyMoment {
  key: string;
  kind: KeyKind;
  clock: string;
  teamId: string | null;
  player: string;
  score: { home: number; away: number } | null;
}

function momentKind(event: TimelineEvent): KeyKind | null {
  const type = event.type.toLowerCase();
  const label = `${event.type} ${event.typeText}`.toLowerCase();
  if (label.includes('own goal')) return 'own';
  if (label.includes('penalty')) return 'penalty';
  if (type.startsWith('goal') || label.includes('goal')) return 'goal';
  if (label.includes('yellow')) return 'yellow';
  if (label.includes('red')) return 'red';
  if (label.includes('substitution')) return 'sub';
  if (
    label.includes('halftime') ||
    label.includes('full time') ||
    label.includes('fulltime')
  ) {
    return 'break';
  }
  return null;
}

/**
 * The key-event log an FM match view carries: goals with the running score,
 * cards and substitutions. The feed reports some moments twice (commentary and
 * play detail), so rows are folded by clock, player and team.
 */
function keyMoments(match: MatchResponse | null): KeyMoment[] {
  if (!match) return [];
  const ordered = (match.timeline ?? [])
    .map((event, index) => ({ event, index }))
    .sort((a, b) => a.event.totalClock - b.event.totalClock || a.index - b.index);

  const rows: KeyMoment[] = [];
  const seen = new Set<string>();
  let home = 0;
  let away = 0;

  for (const { event } of ordered) {
    const kind = momentKind(event);
    if (!kind) continue;

    const scoring = kind === 'goal' || kind === 'own' || kind === 'penalty';
    const fingerprint = scoring
      ? `G|${event.displayClock}|${event.playerName}|${event.teamId}`
      : kind === 'break'
        ? `B|${event.displayClock}`
        : `${kind}|${event.displayClock}|${event.playerName}|${event.teamId}`;
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);

    if (scoring && event.goal) {
      const side =
        kind === 'own'
          ? event.teamId === match.home.id
            ? 'away'
            : 'home'
          : event.teamId === match.home.id
            ? 'home'
            : 'away';
      if (side === 'home') home += 1;
      else away += 1;
    }

    rows.push({
      key: fingerprint,
      kind,
      clock: event.displayClock,
      teamId: event.teamId,
      player:
        kind === 'break'
          ? event.typeText || '半场'
          : event.playerName || event.shortText || event.text,
      score: scoring && event.goal ? { home, away } : null,
    });
  }
  return rows;
}

const MOMENT_ICON: Record<KeyKind, string> = {
  goal: '⚽',
  own: '⚽',
  penalty: '⚽',
  yellow: '🟨',
  red: '🟥',
  sub: '⇄',
  break: '—',
};

function MatchEvents({ match }: { match: MatchResponse | null }) {
  const rows = useMemo(() => keyMoments(match), [match]);
  const listRef = useRef<HTMLDivElement | null>(null);
  const stickRef = useRef(true);

  useEffect(() => {
    const list = listRef.current;
    if (list && stickRef.current) list.scrollTop = list.scrollHeight;
  }, [rows.length]);

  const onScroll = () => {
    const list = listRef.current;
    if (!list) return;
    stickRef.current = list.scrollHeight - list.scrollTop - list.clientHeight < 48;
  };

  return (
    <div className="tl-events">
      <div className="tl-events__head">
        <span>关键事件</span>
        <em>{rows.length ? `${rows.length}` : '等待中'}</em>
      </div>
      <div className="tl-events__list" ref={listRef} onScroll={onScroll}>
        {rows.length === 0 ? (
          <div className="tl-events__empty">比赛刚开始，还没有关键事件</div>
        ) : (
          rows.map((row) => {
            if (row.kind === 'break') {
              return (
                <div className="tl-ev tl-ev--break" key={row.key}>
                  <span>{row.clock}</span>
                  <em>{row.player}</em>
                </div>
              );
            }
            const team =
              match && row.teamId
                ? row.teamId === match.home.id
                  ? match.home
                  : row.teamId === match.away.id
                    ? match.away
                    : null
                : null;
            return (
              <div className={`tl-ev tl-ev--${row.kind}`} key={row.key}>
                <span className="tl-ev__min">{row.clock}</span>
                <span className="tl-ev__icon" aria-hidden="true">
                  {MOMENT_ICON[row.kind]}
                </span>
                <span className="tl-ev__team">
                  <i style={{ background: team?.color ?? '#6b7d63' }} />
                  {team?.abbr ?? '·'}
                </span>
                <span className="tl-ev__who">{row.player}</span>
                {row.score ? (
                  <span className="tl-ev__score">
                    {row.score.home}–{row.score.away}
                  </span>
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}


function MatchList({
  state,
  onPick,
}: {
  state: LiveView;
  onPick: (id: string) => void;
}) {
  return (
    <>
      <div className="tl-menu__head">
        正在直播 · {state.matches.length}
        {state.error ? <em>· 连接不稳定</em> : null}
      </div>
      {state.matches.map((item) => (
        <button
          type="button"
          role="menuitemradio"
          aria-checked={item.id === state.selectedId}
          key={item.id}
          className={`tl-item${item.id === state.selectedId ? ' is-active' : ''}`}
          onClick={() => onPick(item.id)}
        >
          <span className="tl-item__league">{item.leagueName}</span>
          <span className="tl-item__row">
            <span className="tl-item__team">
              <i style={{ background: item.home.color }} />
              {item.home.shortName}
            </span>
            <b>
              {item.home.score} – {item.away.score}
            </b>
            <span className="tl-item__team tl-item__team--away">
              {item.away.shortName}
              <i style={{ background: item.away.color }} />
            </span>
          </span>
          <span className="tl-item__clock">
            {item.status.displayClock}
            {item.status.shortDetail ? ` · ${item.status.shortDetail}` : ''}
          </span>
        </button>
      ))}
    </>
  );
}

/* ----------------------------------------------------------------- window */

interface Point {
  x: number;
  y: number;
}

function MatchWindow() {
  const [state, setState] = useState<LiveView>({ ...view });
  const [open, setOpen] = useState(false);
  const [sizeIndex, setSizeIndex] = useState<number>(() => {
    const stored = readStored<number>(STORE.size, DEFAULT_SIZE);
    return Number.isInteger(stored) && stored >= 0 && stored < SIZES.length ? stored : DEFAULT_SIZE;
  });
  const [pos, setPos] = useState<Point>(() => {
    const stored = readStored<Point | null>(STORE.pos, null);
    if (stored) return stored;
    const startSize = SIZES[sizeIndex] ?? SIZES[DEFAULT_SIZE];
    return {
      x: window.innerWidth - startSize.width - 24,
      y: window.innerHeight - startSize.height - 24,
    };
  });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const posRef = useRef<Point>(pos);
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);

  const size = SIZES[sizeIndex];
  const width = size.width;
  const isReplayMode = state.mode === 'replay' && playback.file !== null;
  // The window can stay mounted while returning null. Start/stop drawing when
  // its actual canvas appears/disappears, including replay and boss-key changes.
  const canvasReady = !state.hidden && state.windowOpen &&
    (isReplayMode || state.matches.length > 0) && (isReplayMode || state.hasCoordinates);
  const height = size.height + (state.eventsOpen && !isReplayMode ? EVENTS_HEIGHT : 0);
  const widthRef = useRef(width);
  const heightRef = useRef(height);
  widthRef.current = width;
  heightRef.current = height;

  useEffect(() => {
    setState({ ...view });
    return subscribe(() => setState({ ...view }));
  }, []);

  useEffect(() => {
    posRef.current = pos;
  }, [pos]);

  const clampPoint = useCallback((point: Point): Point => {
    const maxX = Math.max(8, window.innerWidth - widthRef.current - 8);
    const maxY = Math.max(8, window.innerHeight - heightRef.current - 8);
    return {
      x: Math.min(Math.max(8, point.x), maxX),
      y: Math.min(Math.max(8, point.y), maxY),
    };
  }, []);

  useEffect(() => {
    setPos((current) => clampPoint(current));
    const onResize = () => setPos((current) => clampPoint(current));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [width, height, clampPoint]);

  useEffect(() => {
    if (!canvasReady) return;
    const canvas = canvasRef.current;
    const host = canvas?.parentElement;
    if (!canvas || !host) return;
    const painter = canvas.getContext('2d');
    if (!painter) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let w = 1;
    let h = 1;
    const resize = () => {
      const rect = host.getBoundingClientRect();
      w = Math.max(1, rect.width);
      h = Math.max(1, rect.height);
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(host);

    let frame = 0;
    let last = performance.now();
    const resetClock = () => { last = performance.now(); };
    document.addEventListener('visibilitychange', resetClock);
    let lastPublish = 0;
    const loop = (now: number) => {
      frame = requestAnimationFrame(loop);
      const elapsed = Math.max(0, (now - Math.max(last, playback.updatedAt)) / 1000);
      const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
      last = now;
      if (document.hidden || !feed || !feed.engine.match) return;

      if (view.mode === 'replay' && playback.file) {
        const file = playback.file;
        const total = replayEnd(file);
        if (playback.playing) {
          playback.index = advanceReplay(file, playback.index, elapsed);
          if (playback.index >= total) playback.playing = false;
        }
        const replayFrame = frameAt(file, playback.index);
        feed.engine.applyFrame(replayFrame);
        feed.engine.draw(painter, w, h, { showNames: false });
        if (now - lastPublish > 450 || (view.replayPlaying && !playback.playing)) {
          lastPublish = now;
          update({
            replayClock: clockLabel(file, playback.index),
            replayPlaying: playback.playing,
            replayBallMissing: !replayFrame.ball,
            replaySeconds: playback.index / file.fps,
            replayPeriod: file.periods?.[Math.min((file.periods?.length ?? 1)-1, Math.floor(playback.index))] ?? 1,
          });
        }
        return;
      }

      feed.engine.tick(dt);
      feed.engine.draw(painter, w, h, { showNames: false });
      if (now - lastPublish > 900) {
        lastPublish = now;
        update({ snapshot: feed.engine.snapshot() });
      }
    };
    frame = requestAnimationFrame(loop);
    return () => {
      document.removeEventListener('visibilitychange', resetClock);
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [canvasReady, sizeIndex]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('button')) return;
    const base = posRef.current;
    dragRef.current = { dx: event.clientX - base.x, dy: event.clientY - base.y };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    setPos(clampPoint({ x: event.clientX - drag.dx, y: event.clientY - drag.dy }));
  };

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      /* pointer already released */
    }
    writeStored(STORE.pos, posRef.current);
  };

  const chapters = useMemo(() => playback.file ? replayChapters(playback.file) : [], [state.replayTitle, state.mode]);
  const isReplay = isReplayMode;
  if (state.hidden || !state.windowOpen) return null;
  if (!isReplay && !state.matches.length) return null;

  const selected = isReplay ? null : currentMatch(state);
  const snapshot = state.snapshot;
  const clock = isReplay
    ? state.replayClock
    : (snapshot?.clockLabel ?? selected?.status.displayClock ?? "0'");
  const homeScore = isReplay ? 0 : (snapshot?.score.home ?? selected?.home.score ?? 0);
  const awayScore = isReplay ? 0 : (snapshot?.score.away ?? selected?.away.score ?? 0);

  const cycleSize = () => {
    const next = (sizeIndex + 1) % SIZES.length;
    setSizeIndex(next);
    writeStored(STORE.size, next);
  };

  const toggleReplay = () => {
    if (!playback.file) return;
    const total = replayEnd(playback.file);
    if (!playback.playing && playback.index >= total) playback.index = 0;
    playback.updatedAt = performance.now();
    playback.playing = !playback.playing;
    update({ replayPlaying: playback.playing });
  };

  const seekReplay = (seconds: number) => {
    const file = playback.file;
    if (!file || !Number.isFinite(seconds)) return;
    playback.index = Math.max(0, Math.min(replayEnd(file), seconds * file.fps));
    playback.updatedAt = performance.now();
    update({ replayClock: clockLabel(file,playback.index), replaySeconds: playback.index/file.fps,
      replayPeriod: file.periods?.[Math.min((file.periods?.length ?? 1)-1,Math.floor(playback.index))] ?? 1,
      replayBallMissing: !frameAt(file,playback.index).ball });
  };

  return (
    <div
      className="tl-window"
      style={{ left: pos.x, top: pos.y, width, height }}
      data-dsh-touchline-window=""
    >
      <div
        className="tl-head"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <span className={`tl-dot${state.error ? ' is-stale' : ''}${isReplay ? ' is-replay' : ''}`} />
        <span className="tl-clock">{clock}</span>
        {isReplay ? (
          <span className="tl-replay-title" title={state.replayTitle}>
            回放 · {state.replayTitle}{state.replayBallMissing ? ' · 球位置缺失' : ''}
          </span>
        ) : (
          <span className="tl-vs">
            <em>{selected!.home.abbr}</em>
            <b>
              {homeScore}–{awayScore}
            </b>
            <em>{selected!.away.abbr}</em>
          </span>
        )}
        <span className="tl-actions">
          {isReplay ? (
            <button type="button" className="tl-icon" title="播放 / 暂停" onClick={toggleReplay}>
              {state.replayPlaying ? '❚❚' : '▶'}
            </button>
          ) : (
            <button
              type="button"
              className={`tl-icon${state.eventsOpen ? ' is-on' : ''}`}
              title="关键事件记录"
              aria-expanded={state.eventsOpen}
              onClick={() => toggleEvents(!state.eventsOpen)}
            >
              ≡
            </button>
          )}
          <button type="button" className="tl-icon" title="切换窗口尺寸" onClick={cycleSize}>
            ⤢
          </button>
          <button
            type="button"
            className="tl-icon"
            title={`收到胶囊（${BOSS_KEY.label} 一键隐藏）`}
            onClick={() => setWindowOpen(false)}
          >
            –
          </button>
          <button
            type="button"
            className="tl-icon"
            title="切换直播 / 回放"
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
          >
            ▾
          </button>
        </span>
      </div>

      {state.hasCoordinates || isReplay ? (
        <div className="tl-body">
          <canvas ref={canvasRef} />
        </div>
      ) : (
        <div className="tl-body tl-body--muted">
          当前数据源只有比分和事件，没有球场坐标
        </div>
      )}

      {isReplay && playback.file && <div className="tl-replay-controls">
        <span>{state.replayPeriod === 2 ? '下半场' : state.replayPeriod === 1 ? '上半场' : `第 ${state.replayPeriod} 节`}</span>
        <input type="range" aria-label="回放进度" min={0} max={playback.file.duration} step={0.1}
          value={state.replaySeconds ?? 0} onChange={e => seekReplay(Number(e.target.value))} />
        <select aria-label="回放片段" value="" onChange={e => seekReplay(Number(e.target.value))}>
          <option value="" disabled>跳转片段</option>
          {chapters.map((chapter,i) => <option key={i} value={chapter.seconds}>{clockLabel(playback.file!,chapter.seconds*playback.file!.fps)} · {chapter.label}</option>)}
        </select>
      </div>}
      {!isReplay && <div className="tl-live-quality" role="status">
        事件推演 · {state.error ? '同步异常，保留最后位置' : !state.match?.plays.some(p => Number.isFinite(p.x) && Number.isFinite(p.y)) ? '等待坐标' : state.match?.stale ? '数据已过期' : `最近同步 ${Math.max(0,Math.floor((Date.now()-Date.parse(state.match?.fetchedAt || state.match?.source?.fetchedAt || new Date().toISOString()))/1000))} 秒前`}
      </div>}
      {state.eventsOpen && !isReplay && <MatchEvents match={state.match} />}

      {open && (
        <div className="tl-menu" role="menu" aria-label="直播与回放">
          <MatchList
            state={state}
            onPick={(id) => {
              feed?.select(id);
              setOpen(false);
            }}
          />
          {state.replays.length > 0 && (
            <>
              <div className="tl-menu__head tl-menu__head--replay">回放</div>
              {state.replays.map((entry) => (
                <button
                  type="button"
                  key={entry.id}
                  className={`tl-item${isReplay && playback.file?.id === entry.id ? ' is-active' : ''}`}
                  onClick={() => {
                    void feed?.playReplay(entry.id);
                    setOpen(false);
                  }}
                >
                  <span className="tl-item__league">本地文件</span>
                  <span className="tl-item__row">
                    <span className="tl-item__team">{entry.title}</span>
                    <b>{Math.round(entry.duration)}s</b>
                  </span>
                  <span className="tl-item__clock">
                    {entry.fps} fps · 逐帧追踪
                  </span>
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------- pill */

function MatchPill() {
  const [state, setState] = useState<LiveView>({ ...view });
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ right: number; bottom: number } | null>(null);
  const pillRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setState({ ...view });
    return subscribe(() => setState({ ...view }));
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  const toggleMenu = () => {
    if (open) {
      setOpen(false);
      return;
    }
    const rect = pillRef.current?.getBoundingClientRect();
    if (rect) {
      setMenuPos({
        right: Math.max(8, window.innerWidth - rect.right),
        bottom: Math.max(8, window.innerHeight - rect.top + 8),
      });
    }
    setOpen(true);
  };

  const isReplay = state.mode === 'replay' && playback.file !== null;
  if (state.hidden) return null;
  /* Keep the pill reachable when nothing is live, as long as replays exist. */
  if (!isReplay && !state.matches.length && !state.replays.length) return null;

  const selected = isReplay ? null : currentMatch(state);
  const snapshot = state.snapshot;
  const clock = isReplay
    ? state.replayClock
    : (snapshot?.clockLabel ?? selected?.status.displayClock ?? "--");

  return (
    <div className="tl-dock" ref={pillRef}>
      <div className={`tl-pill${state.windowOpen ? '' : ' is-off'}`}>
        <button
          type="button"
          className="tl-pill__main"
          title={`${state.windowOpen ? '隐藏比赛小窗' : '显示比赛小窗'}（${BOSS_KEY.label} 一键隐藏/恢复）`}
          aria-pressed={state.windowOpen}
          onClick={() => setWindowOpen(!state.windowOpen)}
        >
          <span className="tl-dot" />
          <span className="tl-clock">{clock}</span>
          {isReplay ? (
            <span className="tl-team">回放 · {state.replayTitle.slice(0, 18)}</span>
          ) : selected ? (
            <>
              <span className="tl-team">{selected.home.abbr}</span>
              <strong className="tl-score">
                {snapshot?.score.home ?? selected.home.score ?? 0}–
                {snapshot?.score.away ?? selected.away.score ?? 0}
              </strong>
              <span className="tl-team">{selected.away.abbr}</span>
            </>
          ) : (
            <span className="tl-team">暂无直播</span>
          )}
        </button>
        <button
          type="button"
          className="tl-pill__menu"
          title="切换直播 / 回放"
          aria-expanded={open}
          onClick={toggleMenu}
        >
          ▾
        </button>
      </div>

      {open && menuPos && (
        <div
          className="tl-menu tl-menu--fixed"
          role="menu"
          aria-label="直播与回放"
          style={{ right: menuPos.right, bottom: menuPos.bottom }}
        >
          <MatchList
            state={state}
            onPick={(id) => {
              feed?.select(id);
              setOpen(false);
            }}
          />
          {state.replays.length > 0 && (
            <>
              <div className="tl-menu__head tl-menu__head--replay">回放</div>
              {state.replays.map((entry) => (
                <button
                  type="button"
                  key={entry.id}
                  className={`tl-item${isReplay && playback.file?.id === entry.id ? ' is-active' : ''}`}
                  onClick={() => {
                    void feed?.playReplay(entry.id);
                    setOpen(false);
                  }}
                >
                  <span className="tl-item__league">本地文件</span>
                  <span className="tl-item__row">
                    <span className="tl-item__team">{entry.title}</span>
                    <b>{Math.round(entry.duration)}s</b>
                  </span>
                  <span className="tl-item__clock">
                    {entry.fps} fps · 逐帧追踪
                  </span>
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- plugin */

export function apply(ctx: any) {
  const style = document.createElement('style');
  style.id = 'dsh-touchline-widget';
  style.textContent = widgetCss;
  document.head.append(style);

  feed = new LiveFeed();
  feed.start();

  /* Boss key: one stroke hides the window and the pill; the same stroke brings
     the previous state back. It stays out of localStorage on purpose. */
  const onKeyDown = (event: KeyboardEvent) => {
    if (!isBossCombo(event)) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.repeat) return;
    update({ hidden: !view.hidden });
  };
  window.addEventListener('keydown', onKeyDown, true);

  ctx.slots.inject('shell.overlay', () =>
    ctx.slots.register(
      { name: 'shell.overlay', id: 'touchline-window', order: 40, label: () => 'Touchline' },
      MatchWindow,
    ),
  );

  ctx.slots.inject('conversation.composer.dock', () =>
    ctx.slots.register(
      { name: 'conversation.composer.dock', id: 'touchline-pill', order: 20, label: () => 'Touchline' },
      MatchPill,
    ),
  );

  ctx.effect(() => () => {
    window.removeEventListener('keydown', onKeyDown, true);
    style.remove();
    feed?.dispose();
    feed = null;
  });
}

export const inject = ['slots'];
