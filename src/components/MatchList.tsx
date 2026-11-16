import { useEffect, useMemo, useRef, useState } from 'react';
import type { MatchSummary, ScoreboardResponse } from '../types';
import { dateKeyLocal, kickoffTime, longDateLabel, shortDateLabel, shiftDateKey, cn } from '../lib/format';
import { Icon } from './Icon';

type Filter = 'live' | 'upcoming' | 'finished' | 'all';

interface Props {
  dateKey: string;
  onDateChange: (key: string) => void;
  scoreboard: ScoreboardResponse | null;
  loading: boolean;
  error: string | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onRefresh: () => void;
  onCloseMobile?: () => void;
}

const filters: Array<{ key: Filter; label: string }> = [
  { key: 'live', label: '直播' },
  { key: 'upcoming', label: '即将' },
  { key: 'finished', label: '赛果' },
  { key: 'all', label: '全部' },
];

function stateGroup(match: MatchSummary) {
  if (match.status.state === 'in') return '直播中';
  if (match.status.state === 'post') return '已结束';
  return '即将开始';
}

export function MatchList({
  dateKey,
  onDateChange,
  scoreboard,
  loading,
  error,
  selectedId,
  onSelect,
  onRefresh,
  onCloseMobile,
}: Props) {
  const [filter, setFilter] = useState<Filter>('upcoming');
  const [query, setQuery] = useState('');
  const initializedDate = useRef('');
  const lastScrolled = useRef('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    initializedDate.current = '';
    setQuery('');
  }, [dateKey]);

  useEffect(() => {
    if (!scoreboard || scoreboard.date !== dateKey || initializedDate.current === dateKey) return;
    initializedDate.current = dateKey;
    const hasUpcoming = scoreboard.matches.some((match) => match.status.state === 'pre');
    const hasFinished = scoreboard.matches.some((match) => match.status.state === 'post');
    setFilter(
      scoreboard.liveCount > 0 ? 'live' : hasUpcoming ? 'upcoming' : hasFinished ? 'finished' : 'all',
    );
  }, [scoreboard, dateKey]);

  useEffect(() => {
    if (!selectedId) return;
    const token = `${selectedId}:${filter}`;
    if (lastScrolled.current === token) return;
    const timer = window.setTimeout(() => {
      const row = scrollRef.current?.querySelector<HTMLElement>(`[data-match-id="${selectedId}"]`);
      if (!row) return;
      row.scrollIntoView({ block: 'center' });
      lastScrolled.current = token;
    }, 100);
    return () => window.clearTimeout(timer);
  }, [selectedId, filter, scoreboard]);

  const counts = useMemo(() => {
    const matches = scoreboard?.matches || [];
    return {
      live: matches.filter((m) => m.status.state === 'in').length,
      upcoming: matches.filter((m) => m.status.state === 'pre').length,
      finished: matches.filter((m) => m.status.state === 'post').length,
      all: matches.length,
    };
  }, [scoreboard]);

  const filtered = useMemo(() => {
    const matches = scoreboard?.matches || [];
    const q = query.trim().toLowerCase();
    return matches.filter((match) => {
      if (filter === 'live' && match.status.state !== 'in') return false;
      if (filter === 'upcoming' && match.status.state !== 'pre') return false;
      if (filter === 'finished' && match.status.state !== 'post') return false;
      if (!q) return true;
      return [match.home.name, match.away.name, match.leagueName, match.home.abbr, match.away.abbr]
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [scoreboard, filter, query]);

  const grouped = useMemo(() => {
    const map = new Map<string, MatchSummary[]>();
    for (const match of filtered) {
      const key = match.leagueName || 'Football';
      if (!map.has(key)) map.set(key, []);
      map.get(key)?.push(match);
    }
    return [...map.entries()];
  }, [filtered]);

  const preview = useMemo(() => {
    if (!scoreboard || filter !== 'live' || query.trim()) return { upcoming: [], finished: [] };
    return {
      upcoming: scoreboard.matches.filter((match) => match.status.state === 'pre').slice(0, 5),
      finished: scoreboard.matches.filter((match) => match.status.state === 'post').slice(0, 2),
    };
  }, [scoreboard, filter, query]);

  return (
    <div className="matchlist">
      <div className="matchlist__head">
        <div>
          <span className="eyebrow">MATCHDAY</span>
          <h2>{longDateLabel(dateKey)}</h2>
        </div>
        <div className="date-nav">
          <button onClick={() => onDateChange(shiftDateKey(dateKey, -1))} aria-label="前一天">
            <Icon name="left" size={16} />
          </button>
          <button className="date-nav__today" onClick={() => onDateChange(dateKeyLocal())} title="回到今天">
            今天
          </button>
          <button onClick={() => onDateChange(shiftDateKey(dateKey, 1))} aria-label="后一天">
            <Icon name="right" size={16} />
          </button>
        </div>
      </div>

      <div className="matchlist__toolbar">
        <div className="tabs tabs--compact">
          {filters.map((item) => (
            <button
              key={item.key}
              className={cn('tab', filter === item.key && 'is-active')}
              onClick={() => setFilter(item.key)}
            >
              {item.label}
              <span>{counts[item.key]}</span>
            </button>
          ))}
        </div>
        <button className="icon-button icon-button--small" onClick={onRefresh} title="刷新赛程" aria-label="刷新赛程">
          <Icon name="restart" size={14} />
        </button>
      </div>

      <label className="search">
        <Icon name="search" size={15} />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索球队 / 联赛" />
        {query && (
          <button onClick={() => setQuery('')} aria-label="清空搜索">
            <Icon name="close" size={13} />
          </button>
        )}
      </label>

      {scoreboard?.stale && (
        <div className="data-warning">
          <span />
          数据源响应较慢，正在展示最近一次快照
        </div>
      )}

      <div className="matchlist__scroll" ref={scrollRef}>
        {loading && !scoreboard && (
          <div className="list-skeleton">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="skeleton-row">
                <span />
                <span />
              </div>
            ))}
          </div>
        )}

        {error && !scoreboard && (
          <div className="empty-card">
            <Icon name="radio" size={22} />
            <strong>没有连上赛程</strong>
            <p>{error}</p>
            <button onClick={onRefresh}>重试</button>
          </div>
        )}

        {scoreboard && filtered.length === 0 && (
          <div className="empty-card">
            <Icon name="calendar" size={22} />
            <strong>{filter === 'live' ? '这个时段没有直播' : '没有符合条件的比赛'}</strong>
            <p>{filter === 'live' ? '看看即将开始的场次，或者切换到其他日期。' : '换个筛选条件试试。'}</p>
            {filter === 'live' && (
              <button onClick={() => setFilter('upcoming')}>查看即将开始</button>
            )}
          </div>
        )}

        {grouped.map(([league, matches]) => (
          <section className="league-group" key={league}>
            <div className="league-group__head">
              <span>{league}</span>
              <em>{matches.length}</em>
            </div>
            {matches.map((match) => (
              <MatchRow
                key={match.id}
                match={match}
                selected={selectedId === match.id}
                onSelect={() => {
                  onSelect(match.id);
                  onCloseMobile?.();
                }}
              />
            ))}
          </section>
        ))}

        {filter === 'live' && !query.trim() && preview.upcoming.length > 0 && (
          <section className="preview-group">
            <div className="preview-group__head">
              <span>接下来</span>
              <button onClick={() => setFilter('upcoming')}>全部 {counts.upcoming} 场 →</button>
            </div>
            {preview.upcoming.map((match) => (
              <MatchRow
                key={match.id}
                match={match}
                selected={selectedId === match.id}
                compact
                onSelect={() => {
                  onSelect(match.id);
                  onCloseMobile?.();
                }}
              />
            ))}
          </section>
        )}

        {filter === 'live' && !query.trim() && preview.finished.length > 0 && (
          <section className="preview-group">
            <div className="preview-group__head">
              <span>最近赛果</span>
              <button onClick={() => setFilter('finished')}>全部 {counts.finished} 场 →</button>
            </div>
            {preview.finished.map((match) => (
              <MatchRow
                key={match.id}
                match={match}
                selected={selectedId === match.id}
                compact
                onSelect={() => {
                  onSelect(match.id);
                  onCloseMobile?.();
                }}
              />
            ))}
          </section>
        )}

        {scoreboard && filtered.length > 0 && (
          <div className="matchlist__foot">
            <span>{shortDateLabel(dateKey)} · {filtered.length} 场比赛</span>
            <span>数据 ESPN</span>
          </div>
        )}
      </div>
    </div>
  );
}

function MatchRow({
  match,
  selected,
  compact,
  onSelect,
}: {
  match: MatchSummary;
  selected: boolean;
  compact?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      className={cn('match-row', compact && 'is-compact', selected && 'is-selected')}
      data-match-id={match.id}
      onClick={onSelect}
    >
      <span className={`match-row__state ${match.status.state}`}>
        {match.status.state === 'in' ? (
          <>
            <i />
            {match.status.displayClock || 'LIVE'}
          </>
        ) : match.status.state === 'post' ? (
          'FT'
        ) : (
          kickoffTime(match.date)
        )}
      </span>
      <span className="match-row__teams">
        <span>
          <b style={{ background: match.home.color }} />
          <span className="match-row__name">{match.home.shortName}</span>
          <strong>{match.status.state === 'pre' ? '—' : match.home.score}</strong>
        </span>
        <span>
          <b style={{ background: match.away.color }} />
          <span className="match-row__name">{match.away.shortName}</span>
          <strong>{match.status.state === 'pre' ? '—' : match.away.score}</strong>
        </span>
      </span>
      <span className={`match-row__badge ${match.status.state}`}>{stateGroup(match)}</span>
    </button>
  );
}

