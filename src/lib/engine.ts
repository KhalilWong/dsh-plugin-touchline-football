import type {
  EnginePlayer,
  EngineSnapshot,
  MatchMode,
  MatchResponse,
  Play,
  Vec,
} from '../types';

const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, value));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const norm = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N} ]/gu, '')
    .toLowerCase()
    .trim();

interface TrackEvent extends Play {
  t: number;
  duration: number;
  index: number;
}

interface Viewport {
  left: number;
  top: number;
  width: number;
  height: number;
  goalDepth: number;
}

interface BallState {
  pos: Vec;
  target: Vec;
  trail: Vec[];
  lastTrailAt: number;
}

const HOME_GOAL_X = 4.2;
const AWAY_GOAL_X = 95.8;
const isStoppage = (play: Play) => /foul|offside|ball[ -]?out|out of play|injury|yellow[ -]?card|red[ -]?card/i.test(play.type);
const isKickoff = (play: Play) => play.restart === 'kickoff-after-goal' || /kick[ -]?off/i.test(play.type);
const fadeSeconds = 0.16;

function reportedClock(label: string | undefined, seconds: number) {
  if (label && /^\d/.test(label) && /[1-9]/.test(label)) return label;
  return Number.isFinite(seconds) && seconds >= 60 ? `${Math.floor(seconds / 60)}'` : '';
}

function endEventClock(match: MatchResponse) {
  let period = match.status.period;
  let end: Pick<Play, 'period' | 'totalClock' | 'displayClock'> | undefined;
  for (const events of [match.plays, match.timeline]) {
    for (const event of events) {
      period = Math.max(period, event.period);
      if (/^(end-regular-time|end-extra-time|end-overtime|end-match|full-time)$/.test(event.type) &&
          (!end || event.period > end.period || (event.period === end.period && event.totalClock > end.totalClock))) {
        end = event;
      }
    }
  }
  return end && end.period === period ? reportedClock(end.displayClock, end.totalClock) : '';
}

export class MatchEngine {
  match: MatchResponse | null = null;
  players: EnginePlayer[] = [];
  track: TrackEvent[] = [];
  mode: MatchMode = 'pre';
  sim = 0;
  speed = 1;
  playing = false;
  liveDelay = 0;
  private liveEventKey = "";
  private relocating = false;
  private ballOpacity = 1;
  private latestReport: Play | undefined;
  ball: BallState = { pos: { x: 50, y: 50 }, target: { x: 50, y: 50 }, trail: [], lastTrailAt: 0 };
  activeEvent: Play | null = null;
  lastEvent: Play | null = null;
  flash: Play | null = null;
  activePlayer: EnginePlayer | null = null;
  viewport: Viewport = { left: 0, top: 0, width: 1, height: 1, goalDepth: 0 };
  /** True once applyFrame() drives positions: tick() then only advances the clock. */
  tracking = false;
  private hiddenTrackingPlayers = new Set<string>();
  private trackingBallVisible = true;
  private initialized = false;
  private lastGoalId = '';
  private flashUntil = 0;
  private rafClock = 0;
  private lastLiveClock = '';
  private finalClock = '';

  setMatch(match: MatchResponse, followLive = false) {
    const isNew = !this.match || this.match.id !== match.id;
    const oldMode = this.mode;
    const previousPeriod = this.match?.status.period;
    if (isNew) {
      this.lastLiveClock = '';
      this.finalClock = '';
    }
    const clock = reportedClock(match.status.displayClock, match.status.clock);
    if (match.status.state === 'in' && clock) this.lastLiveClock = clock;
    if (match.status.state === 'post') {
      this.finalClock = clock || endEventClock(match) || this.finalClock;
    }
    this.match = match;
    this.buildTrack();
    if (isNew) {
      this.relocating = false;
      this.ballOpacity = 1;
      this.flash = null;
      this.lastGoalId = '';
      this.tracking = false;
      this.buildPlayers();
      this.mode = followLive || match.status.state === 'in' ? 'live' : match.status.state === 'post' ? 'replay' : 'pre';
      this.speed = this.mode === 'replay' ? 8 : 1;
      this.playing = this.mode !== 'pre' && !(followLive && match.status.state === 'post');
      this.sim = this.mode === 'live' ? this.liveTarget() : 0;
      this.ball.trail = [];
      this.updateWorld(0.016, true);
      this.initialized = true;
    } else {
      this.buildPlayers();
      if (match.status.state === 'in') {
        if (oldMode !== 'live' && oldMode !== 'replay') {
          this.mode = 'live';
          this.playing = true;
          this.speed = 1;
        }
        // Repeated snapshots retain the event cursor; only a new event reanchors it.
      } else if (match.status.state === 'post' && oldMode === 'live') {
        if (!followLive) this.mode = 'replay';
        this.playing = false;
      }
      const latest = this.track.at(-1);
      const key = latest ? `${latest.period}:${latest.id}:${latest.t}` : '';
      if (this.mode === 'live' && key !== this.liveEventKey && latest) {
        // A gap between reported actions has no observed ball trajectory.
        this.relocating = !this.liveEventKey || this.lastEvent?.period !== latest.period ||
          dist(this.ball.pos, { x: latest.x!, y: latest.y! }) > 18;
        if (!this.liveEventKey) this.ballOpacity = 0;
        this.sim = latest.t; // Event cursor is independent of the display clock.
        this.ball.trail = [];
      }
      if (previousPeriod !== match.status.period) this.ball.trail = [];
      this.updateWorld(0, false);
    }
    const latest = this.track.at(-1);
    this.liveEventKey = latest ? `${latest.period}:${latest.id}:${latest.t}` : '';
  }

  /**
   * Feed one tracking frame: real positions for the ball and (optionally) the
   * 22 players, in pitch units 0..100.
   *
   * Nothing in the live path calls this — live data here is event-based. It is
   * the seam for a replay of open tracking data (Metrica / SkillCorner) or a
   * licensed live tracker, which can drive the same renderer without the
   * event-driven inference in `tick()`.
   */
  applyFrame(frame: {
    ball?: Vec;
    players?: Array<{ id?: string; name?: string; x: number; y: number; visible?: boolean }>;
  }) {
    this.tracking = true;
    this.trackingBallVisible = !!frame.ball;
    if (!frame.ball) this.ball.trail = [];
    this.hiddenTrackingPlayers.clear();
    if (frame.ball) {
      this.ball.pos = { x: frame.ball.x, y: frame.ball.y };
      this.ball.target = { ...this.ball.pos };
      this.ball.trail.push({ ...this.ball.pos });
      if (this.ball.trail.length > 22) this.ball.trail.shift();
    }
    const list = frame.players ?? [];
    if (!list.length) return;
    const byId = new Map<string, { x: number; y: number; visible?: boolean }>();
    for (const entry of list) {
      if (entry.id) byId.set(entry.id, entry);
      if (entry.name) byId.set(entry.name, entry);
    }
    this.players.forEach((player, index) => {
      const next = byId.get(player.id) ?? byId.get(player.name) ?? list[index];
      if (!next || next.visible === false) { this.hiddenTrackingPlayers.add(player.id); return; }
      player.pos = { x: next.x, y: next.y };
      player.target = { ...player.pos };
    });
  }

  private buildTrack() {
    if (!this.match) return;
    this.latestReport = undefined;
    for (const play of this.match.plays) {
      const previous = this.latestReport;
      if (!previous || play.period > previous.period || (play.period === previous.period &&
          (play.totalClock > previous.totalClock || (play.totalClock === previous.totalClock && play.order >= previous.order)))) {
        this.latestReport = play;
      }
    }
    const unique = new Map(this.match.plays.filter(play => Number.isFinite(play.x) && Number.isFinite(play.y) && Number.isFinite(play.totalClock)).map(play => [play.id,play]));
    const plays = [...unique.values()].sort((a,b) => a.period-b.period || a.totalClock-b.totalClock || a.order-b.order);
    const track: TrackEvent[] = [];
    for (let i = 0; i < plays.length; i += 1) {
      const play = plays[i];
      const next = plays[i + 1];
      const gap = next ? Math.max(0, next.totalClock - play.totalClock) : 2;
      const passLike = /pass|cross|throw|clear|aerial|touch|take/i.test(play.type);
      const shotLike = play.shot || /shot|goal/i.test(play.type);
      let duration = shotLike ? 0.85 : passLike ? 1.15 : 0.55;
      duration = Math.min(duration, Math.max(0.2, gap * 0.9));
      track.push({ ...play, t: play.totalClock, duration, index: i });
    }
    this.track = track;
  }

  private buildPlayers() {
    if (!this.match) return;
    const previous = new Map(this.players.map((p) => [`${p.side}:${p.id || p.jersey}:${p.name}`, p]));
    const players: EnginePlayer[] = [];
    for (const side of ['home', 'away'] as const) {
      const team = this.match[side];
      const lineup = this.match.lineups[side];
      lineup.starters.forEach((player, index) => {
        const isKeeper = /^(g|gk)$/i.test(player.positionAbbr);
        const baseX = isKeeper ? (side === 'home' ? HOME_GOAL_X : AWAY_GOAL_X) : side === 'home' ? player.slotX : 100 - player.slotX;
        const baseY = isKeeper ? 50 : player.slotY;
        const p: EnginePlayer = {
          id: player.id || `${side}-${index}`,
          teamId: team.id,
          side,
          name: player.name,
          shortName: player.shortName || player.name,
          jersey: player.jersey || String(index + 1),
          role: player.positionAbbr || player.position || '',
          base: { x: baseX, y: baseY },
          pos: { x: baseX, y: baseY },
          target: { x: baseX, y: baseY },
          active: false,
          hasBall: false,
        };
        const old = previous.get(`${side}:${p.id || p.jersey}:${p.name}`);
        if (old) p.pos = { ...old.pos };
        players.push(p);
      });
    }
    this.players = players;
  }

  private currentTrackIndex() {
    if (!this.track.length) return -1;
    let low = 0;
    let high = this.track.length - 1;
    let answer = -1;
    while (low <= high) {
      const mid = (low + high) >> 1;
      if (this.track[mid].t <= this.sim + 0.001) {
        answer = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    return answer;
  }

  private eventBall(event: TrackEvent | undefined, sim: number): Vec {
    if (!event) return { x: 50, y: 50 };
    const start = { x: clamp(event.x ?? 50, 1, 99), y: clamp(event.y ?? 50, 1, 99) };
    if (event.x2 == null || event.y2 == null || !Number.isFinite(event.x2) || !Number.isFinite(event.y2) ||
        (this.mode === 'live' && isStoppage(event))) return start;
    const end = { x: clamp(event.x2, 1, 99), y: clamp(event.y2, 1, 99) };
    const local = Math.max(0, sim - event.t);
    if (local < event.duration) {
      const t = easeInOut(clamp(local / event.duration, 0, 1));
      return { x: lerp(start.x, end.x, t), y: lerp(start.y, end.y, t) };
    }
    // An event location is not a continuous tracking feed. Never roll beyond
    // its endpoint or invent a path across unknown intervals.
    return end;
  }

  private liveTarget() {
    if (!this.match) return 0;
    if (this.track.length) return Math.max(0, this.track[this.track.length - 1].t - this.liveDelay);
    return Math.max(0, (this.match.status.clock || 0) - this.liveDelay);
  }

  private scoreAt(sim: number) {
    if (!this.match) return { home: 0, away: 0 };
    if (this.mode === 'live') {
      return { home: this.match.home.score, away: this.match.away.score };
    }
    let home = 0;
    let away = 0;
    for (const event of this.track) {
      if (event.t > sim) break;
      if (!event.goal) continue;
      if (event.homeScore !== null && event.homeScore !== undefined && event.awayScore !== null && event.awayScore !== undefined) {
        home = event.homeScore ?? home;
        away = event.awayScore ?? away;
      } else if (event.ownGoal) {
        if (event.teamId === this.match.home.id) away += 1;
        else home += 1;
      } else if (event.teamId === this.match.home.id) {
        home += 1;
      } else if (event.teamId === this.match.away.id) {
        away += 1;
      }
    }
    return { home, away };
  }

  private clockLabel() {
    if (!this.match) return "0'";
    if (this.mode === 'pre') return this.match.status.displayClock || "0'";
    if (this.mode === 'live') {
      if (this.match.status.state === 'post') {
        if (this.finalClock) return '终场 · ' + this.finalClock;
        return this.lastLiveClock ? '终场 · 最近 ' + this.lastLiveClock : '终场';
      }
      if (this.match.status.name === 'STATUS_HALFTIME') return '中场';
      return this.match.status.displayClock || `${Math.floor(this.match.status.clock / 60)}'`;
    }
    const minute = Math.floor(this.sim / 60);
    return `${minute}'`;
  }

  private periodLabel() {
    if (!this.match) return '';
    if (this.mode === 'live') return this.match.status.description || '进行中';
    if (this.sim < 2700) return '上半场';
    if (this.sim < 5400) return '下半场';
    return '加时';
  }

  tick(dt: number) {
    if (!this.match) return;
    if (this.tracking) {
      // Positions come from the replay/tracker through applyFrame(); the engine
      // only keeps its own clock for effects.
      this.rafClock += dt;
      return;
    }
    if (!this.initialized) {
      this.updateWorld(dt, true);
      this.initialized = true;
      return;
    }
    this.rafClock += dt;
    if (this.mode === 'live' && (this.match.status.state === 'post' || this.match.stale || this.match.playsError ||
        this.track.at(-1)?.period !== this.match.status.period ||
        /half.?time|break|suspend|delay/i.test(this.match.status.name))) {
      // Stop easing the drawn positions as well as the event cursor.
      if (this.flash && this.rafClock > this.flashUntil) this.flash = null;
      return;
    }
    if (this.playing && this.mode !== 'pre') {
      if (this.mode === 'live') {
        const latest = this.track.at(-1);
        if (this.latestReport && isKickoff(this.latestReport) && this.latestReport.id !== latest?.id) {
          this.ballOpacity = 0;
          this.ball.trail = [];
          this.flash = null;
          this.updatePlayers(dt, false);
          return;
        }
        if (this.latestReport && isStoppage(this.latestReport) && this.latestReport.id !== latest?.id) {
          if (this.flash && this.rafClock > this.flashUntil) this.flash = null;
          return;
        }
        if (this.relocating && latest) {
          this.ballOpacity = Math.max(0, this.ballOpacity - dt / fadeSeconds);
          if (this.ballOpacity === 0) {
            this.ball.pos = this.eventBall(latest, latest.t);
            this.ball.trail = [];
            this.relocating = false;
          }
          return;
        }
        this.ballOpacity = Math.min(1, this.ballOpacity + dt / fadeSeconds);
        if (latest && latest.period === this.match.status.period) {
          this.sim = Math.min(latest.t + latest.duration, this.sim + dt);
        }
      } else {
        const max = this.maxClock();
        if (this.sim < max + 1.5) {
          this.sim = Math.min(max + 1.5, this.sim + dt * this.speed);
        } else {
          this.playing = false;
        }
      }
    }
    this.updateWorld(dt, false);
  }

  maxClock() {
    if (this.track.length) return this.track[this.track.length - 1].t;
    return this.match?.status.clock || 0;
  }

  private updateWorld(dt: number, snap: boolean) {
    if (!this.match) return;
    const index = this.currentTrackIndex();
    const event = this.mode === 'live' ? this.track.at(-1) : index >= 0 ? this.track[index] : undefined;
    this.activeEvent = event || null;
    this.lastEvent = event || null;
    this.ball.target = this.eventBall(event, this.sim);

    if (snap) {
      this.ball.pos = { ...this.ball.target };
      this.ball.trail = [{ ...this.ball.pos }];
    } else {
      // Exponential ease with a hard speed cap: when a poll brings an event
      // far from the current ball spot, the ball travels there at a sprint
      // instead of lurching a fifth of the pitch in one frame.
      const k = 1 - Math.exp(-dt * 16);
      const dx = this.ball.target.x - this.ball.pos.x;
      const dy = this.ball.target.y - this.ball.pos.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 1e-4) {
        const step = Math.min(dist * k, 24 * dt);
        this.ball.pos.x += (dx / dist) * step;
        this.ball.pos.y += (dy / dist) * step;
      }
      if (this.rafClock - this.ball.lastTrailAt > 0.07) {
        this.ball.lastTrailAt = this.rafClock;
        this.ball.trail.push({ ...this.ball.pos });
        if (this.ball.trail.length > 22) this.ball.trail.shift();
      }
    }

    if (event && event.goal && this.lastGoalId !== event.id) {
      this.lastGoalId = event.id;
      this.flash = event;
      this.flashUntil = this.rafClock + 4.2;
    }
    if (this.flash && this.rafClock > this.flashUntil) this.flash = null;

    if (this.mode === 'live' && event && (isStoppage(event) || event.goal) && !snap) {
      this.activePlayer = null;
      for (const player of this.players) {
        player.active = false;
        player.hasBall = false;
      }
    } else {
      this.updatePlayers(dt, snap);
    }
  }

  private findPlayer(teamId: string | null, name: string, jersey: string) {
    if (!teamId) return null;
    const n = norm(name);
    const candidates = this.players.filter((p) => p.teamId === teamId);
    if (!candidates.length) return null;
    if (jersey) {
      const byJersey = candidates.find((p) => p.jersey === jersey);
      if (byJersey) return byJersey;
    }
    if (!n) return null;
    const exact = candidates.find((p) => norm(p.name) === n);
    if (exact) return exact;
    const last = n.split(' ').slice(-1)[0];
    return candidates.find((p) => norm(p.name).includes(last)) || null;
  }

  private updatePlayers(dt: number, snap: boolean) {
    if (!this.match) return;
    const ball = this.ball.pos;
    const event = this.activeEvent;
    const live = this.mode === 'live';
    const kickoff = live && this.latestReport && isKickoff(this.latestReport);
    const actor = event && !kickoff ? this.findPlayer(event.teamId, event.playerName, event.jersey) : null;
    for (const p of this.players) {
      const keeper = /^(g|gk)$/i.test(p.role);
      p.active = p === actor;
      p.hasBall = p === actor && dist(p.pos,ball) < 3;
      if (kickoff) {
        const depth = p.side === 'home' ? p.base.x : 100 - p.base.x;
        const kickoffDepth = keeper ? depth : 4 + depth * 0.45;
        p.target = { x: p.side === 'home' ? kickoffDepth : 100 - kickoffDepth, y: p.base.y };
      } else if (keeper) {
        const goalX = p.side === 'home' ? HOME_GOAL_X : AWAY_GOAL_X;
        p.target = {
          x: goalX + (p.side === 'home' ? 1.2 : -1.2) * ((ball.x - 50) / 50),
          y: clamp(50 + (ball.y - 50) * 0.22, 42, 58),
        };
      } else {
        const shift = (ball.x - 50) * (live ? 0.12 : 0.23);
        const compactY = 50 + (p.base.y - 50) * 0.88;
        p.target = {
          x: clamp(p.base.x + shift, 7, 93),
          y: clamp(compactY + (ball.y - 50) * (live ? 0.05 : 0.1), 6, 94),
        };
      }
    }

    if (actor && (!live || !/^(g|gk)$/i.test(actor.role))) {
      actor.target.x = lerp(actor.target.x, event?.x ?? ball.x, 0.68);
      actor.target.y = lerp(actor.target.y, event?.y ?? ball.y, 0.68);
      actor.active = true;
    }
    const k = snap ? 1 : 1 - Math.exp(-dt * 6.5);
    for (const p of this.players) {
      p.target.x = clamp(p.target.x, 3, 97);
      p.target.y = clamp(p.target.y, 4, 96);
      // Keep each inferred player near their formation, with a physical speed cap.
      const offset = dist(p.base,p.target);
      const radius = live ? 10 : 18;
      if (!kickoff && offset > radius) {
        p.target.x = p.base.x + (p.target.x-p.base.x)*radius/offset;
        p.target.y = p.base.y + (p.target.y-p.base.y)*radius/offset;
      }
      const dx=p.target.x-p.pos.x, dy=p.target.y-p.pos.y, distance=Math.hypot(dx,dy);
      const step=snap ? distance : Math.min(distance*k,6*dt);
      if(distance>1e-6){p.pos.x+=dx/distance*step;p.pos.y+=dy/distance*step;}
    }
    this.activePlayer = actor;
  }

  setMode(mode: MatchMode) {
    this.ballOpacity = 1;
    this.relocating = false;
    this.mode = mode;
    this.speed = mode === 'replay' ? 8 : 1;
    if (mode === 'live') {
      this.sim = this.liveTarget();
      this.playing = this.match?.status.state === 'in';
    } else if (mode === 'replay') {
      this.sim = 0;
      this.playing = true;
    } else {
      this.sim = 0;
      this.playing = false;
    }
    this.lastGoalId = '';
    this.updateWorld(0.016, true);
  }

  goLive() {
    this.setMode('live');
  }

  restartReplay(speed = 8) {
    this.mode = 'replay';
    this.speed = speed;
    this.sim = 0;
    this.playing = true;
    this.lastGoalId = '';
    this.ball.trail = [];
    this.updateWorld(0.016, true);
  }

  jumpToReplay(second: number, speed = 8) {
    this.mode = 'replay';
    this.speed = speed;
    this.playing = true;
    this.lastGoalId = '';
    this.seek(second);
  }

  seek(second: number) {
    this.sim = clamp(second, 0, this.maxClock() + 1);
    this.updateWorld(0.016, true);
  }

  setSpeed(speed: number) {
    this.speed = speed;
  }

  setPlaying(playing: boolean) {
    this.playing = playing;
  }

  togglePlaying() {
    this.playing = !this.playing;
    return this.playing;
  }

  snapshot(): EngineSnapshot {
    if (!this.match) {
      return {
        mode: 'pre',
        simSecond: 0,
        clockLabel: "0'",
        periodLabel: '',
        score: { home: 0, away: 0 },
        event: null,
        lastEvent: null,
        flash: null,
        possession: null,
        playing: false,
        speed: 1,
        progress: 0,
        activePlayer: null,
        lastUpdated: '',
      };
    }
    const score = this.scoreAt(this.sim);
    const possession =
      this.activeEvent?.teamId === this.match.home.id
        ? 'home'
        : this.activeEvent?.teamId === this.match.away.id
          ? 'away'
          : null;
    return {
      mode: this.mode,
      simSecond: this.sim,
      clockLabel: this.clockLabel(),
      periodLabel: this.periodLabel(),
      score,
      event: this.activeEvent,
      lastEvent: this.lastEvent,
      flash: this.flash,
      possession,
      playing: this.playing,
      speed: this.speed,
      progress: this.maxClock() > 0 ? clamp(this.sim / this.maxClock(), 0, 1) : 0,
      activePlayer: this.activePlayer,
      lastUpdated: this.match.fetchedAt || this.match.source?.fetchedAt || '',
    };
  }

  getPitchPoint(clientX: number, clientY: number, rect: DOMRect): Vec | null {
    const v = this.viewport;
    const x = clientX - rect.left - v.left;
    const y = clientY - rect.top - v.top;
    if (x < 0 || y < 0 || x > v.width || y > v.height) return null;
    return { x: (x / v.width) * 100, y: (y / v.height) * 100 };
  }

  pickPlayer(clientX: number, clientY: number, rect: DOMRect): EnginePlayer | null {
    const point = this.getPitchPoint(clientX, clientY, rect);
    if (!point) return null;
    let best: EnginePlayer | null = null;
    let bestDist = 7;
    for (const p of this.players) {
      const d = Math.hypot(p.pos.x - point.x, p.pos.y - point.y);
      if (d < bestDist) {
        best = p;
        bestDist = d;
      }
    }
    return best;
  }

  draw(ctx: CanvasRenderingContext2D, cssWidth: number, cssHeight: number, options: { showNames: boolean; hoveredId?: string }) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssWidth, cssHeight);
    const v = computeViewport(cssWidth, cssHeight);
    this.viewport = v;
    const px = (x: number) => v.left + (x / 100) * v.width;
    const py = (y: number) => v.top + (y / 100) * v.height;

    drawAmbient(ctx, v, cssWidth, cssHeight);
    drawPitch(ctx, v);
    const opacity = !this.tracking && this.mode === 'live' ? this.ballOpacity : 1;
    ctx.save();
    ctx.globalAlpha = opacity;
    drawBallTrail(ctx, this.ball.trail, px, py, v);
    ctx.restore();

    if (this.flash && !this.relocating && opacity === 1) {
      const p = this.ball.pos;
      const age = Math.max(0, 4.2 - (this.flashUntil - this.rafClock));
      const pulse = 1 + Math.sin(age * 8) * 0.12;
      ctx.save();
      const grad = ctx.createRadialGradient(px(p.x), py(p.y), 0, px(p.x), py(p.y), v.height * 0.32 * pulse);
      grad.addColorStop(0, 'rgba(222, 255, 106, .30)');
      grad.addColorStop(0.5, 'rgba(222, 255, 106, .08)');
      grad.addColorStop(1, 'rgba(222, 255, 106, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(v.left, v.top, v.width, v.height);
      ctx.restore();
    }

    for (const player of this.players) {
      if (this.tracking && this.hiddenTrackingPlayers.has(player.id)) continue;
      drawPlayer(ctx, player, px, py, v, options.showNames, options.hoveredId === player.id);
    }
    ctx.save();
    ctx.globalAlpha = opacity;
    if (this.tracking ? this.trackingBallVisible : this.track.length > 0) drawBall(ctx, this.ball.pos, px, py, v, this.flash !== null);
    ctx.restore();

    if (this.mode !== 'pre' && this.track.length) {
      drawPlaybackHud(ctx, this, v, px, py);
    }
  }
}

function computeViewport(w: number, h: number): Viewport {
  const padX = Math.max(20, w * 0.035);
  const padY = Math.max(16, h * 0.055);
  const availW = Math.max(1, w - padX * 2);
  const availH = Math.max(1, h - padY * 2);
  const aspect = 105 / 68;
  let width = availW;
  let height = width / aspect;
  if (height > availH) {
    height = availH;
    width = height * aspect;
  }
  const left = (w - width) / 2;
  const top = (h - height) / 2;
  return { left, top, width, height, goalDepth: Math.max(7, width * 0.018) };
}

function drawAmbient(ctx: CanvasRenderingContext2D, v: Viewport, w: number, h: number) {
  const bg = ctx.createRadialGradient(w / 2, h / 2, v.height * 0.2, w / 2, h / 2, Math.max(w, h) * 0.8);
  bg.addColorStop(0, '#111b15');
  bg.addColorStop(0.65, '#0b120f');
  bg.addColorStop(1, '#070c0a');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  ctx.save();
  ctx.strokeStyle = 'rgba(186, 214, 147, .05)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 7; i += 1) {
    const inset = 22 + i * 13;
    ctx.beginPath();
    ctx.roundRect(v.left - inset, v.top - inset * 0.5, v.width + inset * 2, v.height + inset, 10);
    ctx.stroke();
  }
  ctx.restore();
}

function drawPitch(ctx: CanvasRenderingContext2D, v: Viewport) {
  const { left, top, width, height } = v;
  const line = 'rgba(238, 241, 223, .62)';
  const lw = Math.max(1.1, width * 0.0014);

  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,.55)';
  ctx.shadowBlur = Math.max(10, width * 0.02);
  ctx.shadowOffsetY = 7;
  ctx.fillStyle = '#1c5b33';
  ctx.beginPath();
  ctx.roundRect(left, top, width, height, Math.max(3, width * 0.004));
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.roundRect(left, top, width, height, Math.max(3, width * 0.004));
  ctx.clip();

  const stripes = 12;
  for (let i = 0; i < stripes; i += 1) {
    ctx.fillStyle = i % 2 === 0 ? '#205f36' : '#1d5932';
    ctx.fillRect(left + (i * width) / stripes, top, width / stripes + 1, height);
  }
  const light = ctx.createLinearGradient(0, top, 0, top + height);
  light.addColorStop(0, 'rgba(255,255,255,.05)');
  light.addColorStop(0.4, 'rgba(255,255,255,0)');
  light.addColorStop(1, 'rgba(0,0,0,.18)');
  ctx.fillStyle = light;
  ctx.fillRect(left, top, width, height);

  const dot = ctx.createRadialGradient(left + width / 2, top + height / 2, 0, left + width / 2, top + height / 2, width * 0.7);
  dot.addColorStop(0, 'rgba(255,255,255,.04)');
  dot.addColorStop(1, 'rgba(0,0,0,.14)');
  ctx.fillStyle = dot;
  ctx.fillRect(left, top, width, height);
  ctx.restore();

  const mx = (m: number) => left + (m / 105) * width;
  const my = (m: number) => top + (m / 68) * height;
  ctx.lineWidth = lw;
  ctx.strokeStyle = line;
  ctx.fillStyle = line;

  ctx.beginPath();
  ctx.roundRect(left, top, width, height, Math.max(3, width * 0.004));
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(mx(52.5), top);
  ctx.lineTo(mx(52.5), top + height);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(mx(52.5), my(34), height * (9.15 / 68), 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(mx(52.5), my(34), Math.max(1.5, width * 0.0022), 0, Math.PI * 2);
  ctx.fill();

  const penaltyW = width * (16.5 / 105);
  const penaltyH = height * (40.32 / 68);
  const sixW = width * (5.5 / 105);
  const sixH = height * (18.32 / 68);

  for (const side of ['left', 'right'] as const) {
    const isLeft = side === 'left';
    const boxX = isLeft ? left : left + width - penaltyW;
    ctx.strokeRect(boxX, my(34) - penaltyH / 2, penaltyW, penaltyH);
    ctx.strokeRect(isLeft ? left : left + width - sixW, my(34) - sixH / 2, sixW, sixH);
    const spotX = isLeft ? mx(11) : mx(94);
    ctx.beginPath();
    ctx.arc(spotX, my(34), Math.max(1.4, width * 0.002), 0, Math.PI * 2);
    ctx.fill();
    const arcR = height * (9.15 / 68);
    ctx.beginPath();
    if (isLeft) ctx.arc(spotX, my(34), arcR, -0.94, 0.94);
    else ctx.arc(spotX, my(34), arcR, Math.PI - 0.94, Math.PI + 0.94);
    ctx.stroke();
  }

  const arcR = height * (1 / 68);
  for (const [cx, cy, a0, a1] of [
    [left, top, 0, Math.PI / 2],
    [left + width, top, Math.PI / 2, Math.PI],
    [left, top + height, -Math.PI / 2, 0],
    [left + width, top + height, Math.PI, Math.PI * 1.5],
  ] as const) {
    ctx.beginPath();
    ctx.arc(cx, cy, arcR, a0, a1);
    ctx.stroke();
  }

  const goalH = height * (7.32 / 68);
  const depth = v.goalDepth;
  for (const side of ['left', 'right'] as const) {
    const isLeft = side === 'left';
    const x = isLeft ? left - depth : left + width;
    ctx.fillStyle = 'rgba(235, 240, 220, .13)';
    ctx.fillRect(x, my(34) - goalH / 2, depth, goalH);
    ctx.strokeStyle = 'rgba(244, 246, 235, .78)';
    ctx.lineWidth = Math.max(1, lw);
    ctx.strokeRect(x, my(34) - goalH / 2, depth, goalH);
    ctx.strokeStyle = 'rgba(244, 246, 235, .2)';
    ctx.lineWidth = 0.6;
    for (let i = 1; i < 5; i += 1) {
      ctx.beginPath();
      ctx.moveTo(x + (depth * i) / 5, my(34) - goalH / 2);
      ctx.lineTo(x + (depth * i) / 5, my(34) + goalH / 2);
      ctx.stroke();
    }
    for (let i = 1; i < 4; i += 1) {
      ctx.beginPath();
      ctx.moveTo(x, my(34) - goalH / 2 + (goalH * i) / 4);
      ctx.lineTo(x + depth, my(34) - goalH / 2 + (goalH * i) / 4);
      ctx.stroke();
    }
    ctx.strokeStyle = line;
  }

  ctx.save();
  ctx.globalAlpha = 0.06;
  ctx.fillStyle = '#eaffd0';
  const spacing = Math.max(8, width * 0.012);
  for (let x = left + spacing; x < left + width; x += spacing * 1.7) {
    for (let y = top + spacing; y < top + height; y += spacing * 1.9) {
      const n = Math.sin(x * 0.7 + y * 0.3) * 0.5 + 0.5;
      if (n > 0.55) ctx.fillRect(x, y, 0.7, 0.7);
    }
  }
  ctx.restore();

  ctx.save();
  ctx.font = `600 ${Math.max(8, width * 0.008)}px "Bahnschrift", "Arial Narrow", sans-serif`;
  ctx.fillStyle = 'rgba(235, 246, 220, .22)';
  ctx.textAlign = 'center';
  ctx.fillText('TOUCHLINE / 2D MATCH VIEW', left + width / 2, top + height - Math.max(6, height * 0.018));
  ctx.restore();
}

function drawBallTrail(
  ctx: CanvasRenderingContext2D,
  trail: Vec[],
  px: (x: number) => number,
  py: (y: number) => number,
  v: Viewport,
) {
  if (trail.length < 2) return;
  ctx.save();
  for (let i = 0; i < trail.length; i += 1) {
    const p = trail[i];
    const a = (i / trail.length) * 0.2;
    ctx.fillStyle = `rgba(239, 255, 180, ${a})`;
    ctx.beginPath();
    ctx.arc(px(p.x), py(p.y), Math.max(1, v.height * 0.003), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawPlayer(
  ctx: CanvasRenderingContext2D,
  p: EnginePlayer,
  px: (x: number) => number,
  py: (y: number) => number,
  v: Viewport,
  showNames: boolean,
  hovered: boolean,
) {
  const r = Math.max(7.5, Math.min(13, v.height * 0.019));
  const x = px(p.pos.x);
  const y = py(p.pos.y);
  const color = p.teamId ? teamColor(p.teamId, p.side) : '#8a9a86';
  const textColor = readableOn(color);

  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,.3)';
  ctx.beginPath();
  ctx.ellipse(x, y + r * 0.62, r * 0.9, r * 0.45, 0, 0, Math.PI * 2);
  ctx.fill();

  if (p.active) {
    const pulse = 1 + Math.sin(performance.now() / 180) * 0.12;
    ctx.strokeStyle = 'rgba(224, 255, 107, .38)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, r * 1.9 * pulse, 0, Math.PI * 2);
    ctx.stroke();
  }
  if (hovered) {
    ctx.strokeStyle = 'rgba(255,255,255,.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, r * 1.65, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.fillStyle = color;
  ctx.strokeStyle = p.active ? '#e3ff77' : 'rgba(248, 247, 235, .78)';
  ctx.lineWidth = p.active ? 2 : 1.2;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = textColor;
  ctx.font = `700 ${Math.max(8, r * 1.02)}px "Bahnschrift", "Arial Narrow", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(p.jersey, x, y + 0.5);

  if (showNames || p.active || hovered) {
    const label = shortLabel(p.shortName || p.name);
    ctx.font = `600 ${Math.max(7, v.height * 0.0125)}px "Bahnschrift", "Arial Narrow", sans-serif`;
    const metrics = ctx.measureText(label);
    const lw = metrics.width + 8;
    const lh = Math.max(12, v.height * 0.02);
    const ly = y + r + 4;
    ctx.fillStyle = 'rgba(7, 13, 10, .78)';
    ctx.beginPath();
    ctx.roundRect(x - lw / 2, ly, lw, lh, 3);
    ctx.fill();
    ctx.fillStyle = 'rgba(243, 241, 225, .9)';
    ctx.fillText(label, x, ly + lh / 2 + 0.5);
  }
  ctx.restore();
}

function drawBall(
  ctx: CanvasRenderingContext2D,
  pos: Vec,
  px: (x: number) => number,
  py: (y: number) => number,
  v: Viewport,
  hot: boolean,
) {
  const x = px(pos.x);
  const y = py(pos.y);
  const r = Math.max(3.3, Math.min(6.2, v.height * 0.0085));
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,.35)';
  ctx.beginPath();
  ctx.ellipse(x + 1.2, y + r * 0.9, r * 0.95, r * 0.48, 0, 0, Math.PI * 2);
  ctx.fill();

  if (hot) {
    ctx.strokeStyle = 'rgba(224, 255, 107, .75)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, r * 2.4 + Math.sin(performance.now() / 100) * 2, 0, Math.PI * 2);
    ctx.stroke();
  }

  const grad = ctx.createRadialGradient(x - r * 0.3, y - r * 0.35, 0, x, y, r);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(1, '#d8ddcf');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(25, 36, 28, .55)';
  ctx.lineWidth = 0.8;
  ctx.stroke();

  ctx.fillStyle = '#27332a';
  ctx.beginPath();
  ctx.arc(x, y, r * 0.22, 0, Math.PI * 2);
  ctx.fill();
  for (let i = 0; i < 5; i += 1) {
    const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
    ctx.beginPath();
    ctx.arc(x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.55, r * 0.16, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawPlaybackHud(
  ctx: CanvasRenderingContext2D,
  engine: MatchEngine,
  v: Viewport,
  px: (x: number) => number,
  py: (y: number) => number,
) {
  const event = engine.activeEvent;
  if (!event) return;
  const color = event.teamId === engine.match?.home.id ? '#e8ff8a' : '#ffd98a';
  if ((event.shot || event.goal) && event.x2 != null && event.y2 != null && Number.isFinite(event.x2) && Number.isFinite(event.y2)) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.38;
    ctx.setLineDash([4, 5]);
    ctx.lineWidth = 1;
    const start = { x: px(event.x ?? 50), y: py(event.y ?? 50) };
    const end = { x: px(event.x2 ?? 50), y: py(event.y2 ?? 50) };
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
    ctx.restore();
  }
  const minute = engine.mode === 'live' ? engine.match?.status.displayClock : `${Math.floor(engine.sim / 60)}'`;
  ctx.save();
  ctx.font = '600 10px "Bahnschrift", "Arial Narrow", sans-serif';
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(8, 14, 10, .62)';
  ctx.beginPath();
  ctx.roundRect(v.left + 10, v.top + 10, 72, 20, 4);
  ctx.fill();
  ctx.fillStyle = 'rgba(231, 244, 209, .8)';
  ctx.fillText(`${engine.mode === 'live' ? 'LIVE' : 'REPLAY'}  ${minute || ''}`, v.left + 17, v.top + 24);
  ctx.restore();
}

function teamColor(teamId: string, side: 'home' | 'away') {
  const colors = colorCache.get(teamId);
  if (colors) return colors;
  return side === 'home' ? '#d7b35b' : '#5b8fd7';
}

const colorCache = new Map<string, string>();
export function registerTeamColor(teamId: string, color: string) {
  colorCache.set(teamId, color);
}

function readableOn(hex: string) {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return '#0e130f';
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 165 ? '#0e130f' : '#f7f5e9';
}

function shortLabel(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 10);
  return `${parts[0][0]}. ${parts.slice(1).join(' ').slice(0, 11)}`;
}

function dist(a: Vec, b: Vec) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
