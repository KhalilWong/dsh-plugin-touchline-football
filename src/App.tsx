import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { EngineSnapshot, MatchMode, MatchResponse, Play } from './types';
import { fetchMatch, fetchScoreboard } from './lib/api';
import { MatchEngine } from './lib/engine';
import { MatchAudio } from './lib/sound';
import { cn, dateKeyLocal } from './lib/format';
import { TopBar } from './components/TopBar';
import { MatchList } from './components/MatchList';
import { Scoreboard } from './components/Scoreboard';
import { PitchCanvas } from './components/PitchCanvas';
import { MatchControls } from './components/MatchControls';
import { StatsPanel } from './components/StatsPanel';
import { CommentaryTicker } from './components/CommentaryTicker';
import { BossMode } from './components/BossMode';
import { InfoModal } from './components/InfoModal';
import { Icon } from './components/Icon';
import { TeamCrest } from './components/TeamCrest';

const ORIGINAL_TITLE = 'Touchline · 本地调试';
const BOSS_TITLE = 'Q3 Operations Review — Northbridge Advisory';

function initialFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return {
    date: params.get('date') || dateKeyLocal(),
    match: params.get('match'),
  };
}

export default function App({ standalone = true }: { standalone?: boolean } = {}) {
  const initial = useMemo(
    () => (standalone ? initialFromUrl() : { date: dateKeyLocal(), match: null }),
    [standalone],
  );
  const [dateKey, setDateKey] = useState(initial.date);
  const [selectedId, setSelectedId] = useState<string | null>(initial.match);
  const [scoreboard, setScoreboard] = useState<Awaited<ReturnType<typeof fetchScoreboard>> | null>(null);
  const [scoreLoading, setScoreLoading] = useState(true);
  const [scoreError, setScoreError] = useState<string | null>(null);
  const [match, setMatch] = useState<MatchResponse | null>(null);
  const [matchLoading, setMatchLoading] = useState(false);
  const [matchError, setMatchError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<EngineSnapshot | null>(null);
  const [mode, setMode] = useState<MatchMode>('pre');
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [showNames, setShowNames] = useState(false);
  const [theater, setTheater] = useState(false);
  const [boss, setBoss] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [soundOn, setSoundOn] = useState(false);
  const [mobileList, setMobileList] = useState(false);
  const [goalBanner, setGoalBanner] = useState<Play | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [visible, setVisible] = useState(!document.hidden);

  const engineRef = useRef<MatchEngine | null>(null);
  const audioRef = useRef<MatchAudio | null>(null);
  const lastFlashRef = useRef('');
  const flashTimerRef = useRef<number | null>(null);

  // Scoreboard loading + 30s refresh.
  useEffect(() => {
    const controller = new AbortController();
    let alive = true;
    let timer: number | undefined;
    const load = async (initialLoad: boolean) => {
      if (initialLoad) setScoreLoading(true);
      try {
        const data = await fetchScoreboard(dateKey, controller.signal);
        if (!alive) return;
        setScoreboard(data);
        setScoreError(null);
      } catch (error) {
        if (!alive || controller.signal.aborted) return;
        setScoreError(error instanceof Error ? error.message : '赛程加载失败');
      } finally {
        if (alive && initialLoad) setScoreLoading(false);
      }
      if (alive) timer = window.setTimeout(() => load(false), 30_000);
    };
    load(true);
    return () => {
      alive = false;
      controller.abort();
      if (timer) window.clearTimeout(timer);
    };
  }, [dateKey, refreshKey]);

  // Keep a valid selection for the current day.
  useEffect(() => {
    if (!scoreboard || scoreboard.date !== dateKey) return;
    const hasSelected = selectedId && scoreboard.matches.some((item) => item.id === selectedId);
    if (hasSelected) return;
    const next =
      scoreboard.matches.find((item) => item.status.state === 'in') ||
      scoreboard.matches.find((item) => item.status.state === 'pre') ||
      scoreboard.matches[0];
    setSelectedId(next?.id ?? null);
  }, [scoreboard, selectedId, dateKey]);

  // Match loading + live polling.
  useEffect(() => {
    if (!selectedId) {
      setMatch(null);
      setSnapshot(null);
      setMatchLoading(false);
      setMatchError(null);
      return;
    }
    const controller = new AbortController();
    let alive = true;
    let timer: number | undefined;
    setMatch((current) => (current && current.id === selectedId ? current : null));
    const load = async (initialLoad: boolean) => {
      if (initialLoad) {
        setMatchLoading(true);
        setMatchError(null);
      }
      try {
        const data = await fetchMatch(selectedId, controller.signal);
        if (!alive) return;
        setMatch(data);
        setMatchError(null);
        if (initialLoad) {
          const nextMode: MatchMode =
            data.status.state === 'in' ? 'live' : data.status.state === 'post' ? 'replay' : 'pre';
          setMode(nextMode);
          setSpeed(nextMode === 'replay' ? 8 : 1);
          setPaused(false);
          lastFlashRef.current = '';
        }
        const delay = data.status.state === 'in' ? 12_000 : data.status.state === 'pre' ? 45_000 : 60_000;
        if (alive) timer = window.setTimeout(() => load(false), delay);
      } catch (error) {
        if (!alive || controller.signal.aborted) return;
        setMatchError(error instanceof Error ? error.message : '比赛加载失败');
        if (alive) timer = window.setTimeout(() => load(false), 18_000);
      } finally {
        if (alive && initialLoad) setMatchLoading(false);
      }
    };
    load(true);
    return () => {
      alive = false;
      controller.abort();
      if (timer) window.clearTimeout(timer);
    };
  }, [selectedId, refreshKey]);

  // URL state (standalone page only: a host panel must not rewrite the app URL).
  useEffect(() => {
    if (!standalone) return;
    const params = new URLSearchParams(window.location.search);
    params.set('date', dateKey);
    if (selectedId) params.set('match', selectedId);
    else params.delete('match');
    const next = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState(null, '', next);
  }, [dateKey, selectedId]);

  // Detect live -> finished to park the replay at the final frame.
  useEffect(() => {
    if (match?.status.state === 'in' && mode === 'pre') {
      setMode('live');
      setSpeed(1);
      setPaused(false);
    }
    if (match?.status.state === 'post' && mode === 'live') {
      const engine = engineRef.current;
      if (engine) {
        engine.mode = 'replay';
        engine.setPlaying(false);
      }
      setMode('replay');
      setPaused(true);
    }
  }, [match?.status.state, mode]);

  // Browser tab title + favicon stealth. In host-panel mode the tab belongs to
  // the host app, so only the boss key swaps it and leaving the panel restores it.
  useEffect(() => {
    const originalTitle = document.title;
    const icon = document.querySelector<HTMLLinkElement>("link[rel='icon']");
    const originalIcon = icon?.href || '';
    document.title = boss ? BOSS_TITLE : standalone ? ORIGINAL_TITLE : originalTitle;
    if (icon) {
      icon.href = boss
        ? "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='6' fill='%23217346'/%3E%3Ctext x='32' y='42' text-anchor='middle' font-family='Arial' font-weight='700' font-size='32' fill='white'%3EX%3C/text%3E%3C/svg%3E"
        : originalIcon;
    }
    return () => {
      document.title = originalTitle;
      if (icon) icon.href = originalIcon;
    };
  }, [boss, standalone]);

  useEffect(() => {
    const onVisibility = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  useEffect(() => {
    audioRef.current?.setMuted(boss);
  }, [boss]);

  // Goal banner + sound.
  useEffect(() => {
    const flash = snapshot?.flash;
    if (!flash || flash.id === lastFlashRef.current) return;
    lastFlashRef.current = flash.id;
    setGoalBanner(flash);
    if (soundOn) audioRef.current?.goal();
    if (flashTimerRef.current) window.clearTimeout(flashTimerRef.current);
    flashTimerRef.current = window.setTimeout(() => setGoalBanner(null), 4_600);
    return () => {
      if (flashTimerRef.current) window.clearTimeout(flashTimerRef.current);
    };
  }, [snapshot?.flash?.id, soundOn]);

  const togglePlay = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    if (engine.mode === 'replay' && engine.sim >= engine.maxClock() - 0.5) {
      engine.restartReplay(8);
      setMode('replay');
      setSpeed(8);
      setPaused(false);
      return;
    }
    const playing = engine.togglePlaying();
    setPaused(!playing);
  }, []);

  const handleReplay = useCallback(() => {
    engineRef.current?.restartReplay(8);
    setMode('replay');
    setSpeed(8);
    setPaused(false);
  }, []);

  const handleLive = useCallback(() => {
    engineRef.current?.goLive();
    setMode('live');
    setSpeed(1);
    setPaused(false);
  }, []);

  const handleSpeed = useCallback((value: number) => {
    engineRef.current?.setSpeed(value);
    setSpeed(value);
  }, []);

  const handleSeek = useCallback((second: number) => {
    engineRef.current?.jumpToReplay(second, 8);
    setMode('replay');
    setSpeed(8);
    setPaused(false);
  }, []);

  const toggleSound = useCallback(async () => {
    if (!audioRef.current) audioRef.current = new MatchAudio();
    const next = !soundOn;
    await audioRef.current.setEnabled(next);
    audioRef.current.setMuted(boss);
    setSoundOn(next);
  }, [soundOn, boss]);

  const handleDateChange = useCallback((nextDate: string) => {
    setDateKey(nextDate);
    setScoreboard(null);
    setSelectedId(null);
    setMatch(null);
    setSnapshot(null);
    setMatchError(null);
    setGoalBanner(null);
    setMobileList(false);
  }, []);

  const handleSelect = useCallback((id: string) => {
    lastFlashRef.current = '';
    setGoalBanner(null);
    setSelectedId(id);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.code === 'KeyX') {
        event.preventDefault();
        setBoss((value) => !value);
        return;
      }
      if (event.key === 'Escape') {
        if (boss) {
          setBoss(false);
          return;
        }
        if (infoOpen) {
          setInfoOpen(false);
          return;
        }
        if (theater) {
          setTheater(false);
          return;
        }
      }
      if (boss) return;
      const target = event.target as HTMLElement | null;
      if (target?.matches('input, textarea, select')) return;
      if (event.code === 'Space' && target?.tagName !== 'BUTTON') {
        event.preventDefault();
        togglePlay();
        return;
      }
      if (event.key.toLowerCase() === 'f') {
        event.preventDefault();
        setTheater((value) => !value);
        return;
      }
      if (event.key.toLowerCase() === 'm') {
        event.preventDefault();
        void toggleSound();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [boss, infoOpen, theater, togglePlay, toggleSound]);

  const active = !boss && visible;
  const pausedUi = snapshot ? !snapshot.playing : paused;
  const homeBanner = match && goalBanner?.teamId === match.home.id;
  const bannerTeam = match ? (homeBanner ? match.home : match.away) : null;

  return (
    <div className={cn('app-shell', theater && 'is-theater', boss && 'is-boss')}>
      <TopBar
        liveCount={scoreboard?.liveCount || 0}
        lastUpdated={scoreboard?.fetchedAt || match?.fetchedAt}
        soundOn={soundOn}
        onSound={() => void toggleSound()}
        onBoss={() => setBoss(true)}
        onInfo={() => setInfoOpen(true)}
        onMenu={() => setMobileList(true)}
      />

      <div className="app-body">
        <aside className={cn('sidebar', mobileList && 'is-open')}>
          <MatchList
            dateKey={dateKey}
            onDateChange={handleDateChange}
            scoreboard={scoreboard}
            loading={scoreLoading}
            error={scoreError}
            selectedId={selectedId}
            onSelect={handleSelect}
            onRefresh={() => setRefreshKey((value) => value + 1)}
            onCloseMobile={() => setMobileList(false)}
          />
        </aside>
        {mobileList && <button className="sidebar-scrim" onClick={() => setMobileList(false)} aria-label="关闭赛程" />}

        <main className="stage">
          {match ? (
            <>
              <Scoreboard match={match} snapshot={snapshot} />
              <section className="pitch-panel">
                <div className="pitch-panel__head">
                  <div>
                    <span className="eyebrow">2D MATCH VIEW</span>
                    <strong>实时空间映射</strong>
                  </div>
                  <div className="pitch-panel__hints">
                    <span>
                      <i className="dot dot--home" style={{ background: match.home.color }} />
                      {match.home.abbr}
                    </span>
                    <span>
                      <i className="dot dot--away" style={{ background: match.away.color }} />
                      {match.away.abbr}
                    </span>
                    <em>悬停球员查看位置</em>
                  </div>
                </div>

                <div className="pitch-stage">
                  <PitchCanvas
                    match={match}
                    mode={mode}
                    showNames={showNames}
                    active={active}
                    onSnapshot={setSnapshot}
                    onEngine={(engine) => {
                      engineRef.current = engine;
                    }}
                  />

                  {goalBanner && bannerTeam && (
                    <div
                      className="goal-banner"
                      style={{ '--goal-color': bannerTeam.color } as CSSProperties}
                    >
                      <span className="goal-banner__kicker">GOAL</span>
                      <div className="goal-banner__main">
                        <TeamCrest team={bannerTeam} size={38} />
                        <div>
                          <strong>{bannerTeam.shortName}</strong>
                          <em>{goalBanner.playerName || '进球'}</em>
                        </div>
                        <b>{snapshot?.score.home ?? 0} : {snapshot?.score.away ?? 0}</b>
                      </div>
                      <span className="goal-banner__minute">{goalBanner.displayClock || snapshot?.clockLabel}</span>
                    </div>
                  )}
                </div>

                <MatchControls
                  match={match}
                  snapshot={snapshot}
                  mode={mode}
                  paused={pausedUi}
                  speed={speed}
                  showNames={showNames}
                  theater={theater}
                  onToggle={togglePlay}
                  onReplay={handleReplay}
                  onLive={handleLive}
                  onSpeed={handleSpeed}
                  onSeek={handleSeek}
                  onToggleNames={() => setShowNames((value) => !value)}
                  onToggleTheater={() => setTheater((value) => !value)}
                />
                <CommentaryTicker match={match} snapshot={snapshot} />
              </section>
            </>
          ) : (
            <div className="stage-empty">
              {matchLoading ? (
                <>
                  <div className="loading-mark">
                    <span />
                    <span />
                    <span />
                  </div>
                  <h2>正在接入比赛数据</h2>
                  <p>从 ESPN 拉取比分、事件和球场坐标…</p>
                </>
              ) : matchError ? (
                <div className="error-card">
                  <Icon name="radio" size={28} />
                  <h2>数据没有接上</h2>
                  <p>{matchError}</p>
                  <button onClick={() => setRefreshKey((value) => value + 1)}>重试</button>
                </div>
              ) : (
                <div className="error-card">
                  <Icon name="calendar" size={28} />
                  <h2>选择一场比赛</h2>
                  <p>从左侧赛程里挑一场，开始 2D 比赛画面。</p>
                </div>
              )}
            </div>
          )}
        </main>

        <aside className="right-rail">
          {match ? (
            <StatsPanel match={match} snapshot={snapshot} onSeek={handleSeek} />
          ) : (
            <div className="rail-placeholder">
              <Icon name="layers" size={22} />
              <span>数据面板</span>
            </div>
          )}
        </aside>
      </div>

      <BossMode open={boss} onClose={() => setBoss(false)} />
      <InfoModal open={infoOpen} onClose={() => setInfoOpen(false)} />
    </div>
  );
}
