import { useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { EnginePlayer, EngineSnapshot, MatchMode, MatchResponse } from '../types';
import { MatchEngine, registerTeamColor } from '../lib/engine';
import { teamTextColor } from '../lib/format';

interface Props {
  match: MatchResponse;
  mode: MatchMode;
  showNames: boolean;
  active: boolean;
  onSnapshot: (snapshot: EngineSnapshot) => void;
  onEngine: (engine: MatchEngine) => void;
}

interface HoverState {
  player: EnginePlayer;
  x: number;
  y: number;
}

export function PitchCanvas({
  match,
  mode,
  showNames,
  active,
  onSnapshot,
  onEngine,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<MatchEngine | null>(null);
  const [hover, setHover] = useState<HoverState | null>(null);
  const hoverIdRef = useRef<string | undefined>(undefined);
  const snapshotRef = useRef(onSnapshot);
  const namesRef = useRef(showNames);
  const activeRef = useRef(active);

  if (!engineRef.current) engineRef.current = new MatchEngine();
  const engine = engineRef.current;

  snapshotRef.current = onSnapshot;
  namesRef.current = showNames;
  activeRef.current = active;

  useEffect(() => {
    onEngine(engine);
  }, [engine, onEngine]);

  useEffect(() => {
    registerTeamColor(match.home.id, match.home.color);
    registerTeamColor(match.away.id, match.away.color);
    engine.setMatch(match);
    snapshotRef.current(engine.snapshot());
  }, [engine, match]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = 0;
    let height = 0;
    const dpr = Math.min(2, window.devicePixelRatio || 1);

    const resize = () => {
      const rect = wrap.getBoundingClientRect();
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(wrap);

    let frame = 0;
    let last = performance.now();
    let lastSnapshot = 0;
    const loop = (now: number) => {
      const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
      last = now;
      if (activeRef.current) {
        engine.tick(dt);
        engine.draw(ctx, width, height, { showNames: namesRef.current, hoveredId: hoverIdRef.current });
        if (now - lastSnapshot > 180) {
          lastSnapshot = now;
          snapshotRef.current(engine.snapshot());
        }
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [engine]);

  const teams = useMemo(
    () => ({ home: match.home, away: match.away }),
    [match.home, match.away],
  );

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    const player = engine.pickPlayer(event.clientX, event.clientY, rect);
    if (!player) {
      if (hoverIdRef.current) {
        hoverIdRef.current = undefined;
        setHover(null);
      }
      return;
    }
    if (hoverIdRef.current !== player.id) {
      hoverIdRef.current = player.id;
      const v = engine.viewport;
      setHover({
        player,
        x: v.left + (player.pos.x / 100) * v.width,
        y: v.top + (player.pos.y / 100) * v.height - 14,
      });
    }
  };

  const clearHover = () => {
    hoverIdRef.current = undefined;
    setHover(null);
  };

  return (
    <div
      ref={wrapRef}
      className="pitch-wrap"
      onPointerMove={handlePointerMove}
      onPointerLeave={clearHover}
    >
      <canvas ref={canvasRef} className="pitch-canvas" />

      <div className="pitch-badge pitch-badge--left">
        <span className="pitch-badge__dot" />
        BALL TRACK
        <em>{mode === 'live' ? 'LIVE' : mode === 'replay' ? 'REPLAY' : 'SETUP'}</em>
      </div>
      <div className="pitch-badge pitch-badge--right">
        <span style={{ background: teams.home.color }} />
        <span style={{ background: teams.away.color }} />
        {teams.home.abbr} · {teams.away.abbr}
      </div>

      {hover && (
        <div className="player-tooltip" style={{ left: hover.x, top: hover.y }}>
          <span
            className="player-tooltip__dot"
            style={{ background: hover.player.side === 'home' ? teams.home.color : teams.away.color }}
          >
            {hover.player.jersey}
          </span>
          <div>
            <strong>{hover.player.name}</strong>
            <em>
              {hover.player.role || '球员'} ·{' '}
              {hover.player.side === 'home' ? teams.home.shortName : teams.away.shortName}
            </em>
          </div>
          <span
            className="player-tooltip__num"
            style={{
              color: teamTextColor(hover.player.side === 'home' ? teams.home.color : teams.away.color),
              background: hover.player.side === 'home' ? teams.home.color : teams.away.color,
            }}
          >
            {hover.player.jersey}
          </span>
        </div>
      )}

      {match.status.state === 'pre' && (
        <div className="pitch-preoverlay">
          <span>PRE-MATCH</span>
          <strong>等待开球</strong>
          <em>开赛后自动进入实时映射</em>
        </div>
      )}
    </div>
  );
}
