import { useMemo, useState } from 'react';
import type { EngineSnapshot, MatchResponse, TimelineEvent } from '../types';
import { cn, eventVerb, statLabel } from '../lib/format';
import { Icon } from './Icon';
import { TeamCrest } from './TeamCrest';

interface Props {
  match: MatchResponse;
  snapshot: EngineSnapshot | null;
  onSeek: (second: number) => void;
}

type Tab = 'stats' | 'events' | 'lineups';

const statKeys = [
  'possessionPct',
  'totalShots',
  'shotsOnTarget',
  'wonCorners',
  'saves',
  'foulsCommitted',
  'yellowCards',
  'redCards',
  'offsides',
  'totalPasses',
  'passPct',
];

function eventIcon(event: TimelineEvent) {
  if (event.goal) return 'goal' as const;
  if (event.yellow || event.red) return 'card' as const;
  if (event.sub) return 'sub' as const;
  if (event.corner) return 'ball' as const;
  return 'whistle' as const;
}

function eventClass(event: TimelineEvent) {
  if (event.goal) return 'is-goal';
  if (event.red) return 'is-red';
  if (event.yellow) return 'is-yellow';
  if (event.sub) return 'is-sub';
  return '';
}

export function StatsPanel({ match, snapshot, onSeek }: Props) {
  const [tab, setTab] = useState<Tab>('stats');
  const stats = useMemo(() => {
    const byKey = new Map(match.stats.map((s) => [s.key, s]));
    return statKeys.map((key) => byKey.get(key)).filter(Boolean) as MatchResponse['stats'];
  }, [match.stats]);
  const possession = stats.find((s) => s.key === 'possessionPct');
  const isReplay = snapshot?.mode === 'replay';
  const sim = snapshot?.simSecond ?? Number.POSITIVE_INFINITY;

  const momentum = useMemo(() => {
    const buckets = Array.from({ length: 18 }, () => ({ home: 0, away: 0 }));
    for (const play of match.plays) {
      if (!play.teamId) continue;
      const bucket = Math.min(17, Math.floor(play.totalClock / 300));
      if (bucket < 0) continue;
      if (play.teamId === match.home.id) buckets[bucket].home += 1;
      else if (play.teamId === match.away.id) buckets[bucket].away += 1;
    }
    const max = Math.max(1, ...buckets.flatMap((bucket) => [bucket.home, bucket.away]));
    const visible = Math.min(18, Math.max(6, Math.ceil((match.status.clock || 0) / 300) + 1));
    return { buckets: buckets.slice(0, visible), max };
  }, [match.plays, match.home.id, match.away.id, match.status.clock]);

  const visibleTimeline = useMemo(() => {
    const all = match.timeline.filter((event) => (isReplay ? event.totalClock <= sim + 1 : true));
    const meaningful = all.filter(
      (event) =>
        event.goal ||
        event.yellow ||
        event.red ||
        event.sub ||
        event.corner ||
        /half|full|kickoff|penalty|var/i.test(event.typeText),
    );
    return (meaningful.length ? meaningful : all).slice().reverse();
  }, [match.timeline, isReplay, sim]);

  return (
    <div className="inspector">
      <div className="inspector__tabs">
        <button className={cn(tab === 'stats' && 'is-active')} onClick={() => setTab('stats')}>
          数据
        </button>
        <button className={cn(tab === 'events' && 'is-active')} onClick={() => setTab('events')}>
          事件
          <span>{visibleTimeline.length}</span>
        </button>
        <button className={cn(tab === 'lineups' && 'is-active')} onClick={() => setTab('lineups')}>
          阵容
        </button>
      </div>

      {tab === 'stats' && (
        <div className="inspector__body stats-view">
          <div className="stats-summary">
            <div className="stats-summary__team">
              <TeamCrest team={match.home} size={30} />
              <span>{match.home.abbr}</span>
            </div>
            <div className="possession">
              <div className="possession__labels">
                <strong>{possession?.homeDisplay || '—'}</strong>
                <span>控球率</span>
                <strong>{possession?.awayDisplay || '—'}</strong>
              </div>
              <div className="possession__bar">
                <span
                  style={{
                    width: `${possession?.home ?? 50}%`,
                    background: match.home.color,
                  }}
                />
                <span
                  style={{
                    width: `${possession?.away ?? 50}%`,
                    background: match.away.color,
                  }}
                />
              </div>
            </div>
            <div className="stats-summary__team stats-summary__team--away">
              <span>{match.away.abbr}</span>
              <TeamCrest team={match.away} size={30} />
            </div>
          </div>

          <div className="stat-list">
            {stats
              .filter((stat) => stat.key !== 'possessionPct')
              .map((stat) => {
                const max = Math.max(stat.home ?? 0, stat.away ?? 0) || 1;
                return (
                  <div className="stat-row" key={stat.key}>
                    <span className="stat-row__value">{stat.homeDisplay}</span>
                    <div className="stat-row__bars">
                      <span className="stat-row__bar stat-row__bar--home">
                        <i style={{ width: `${((stat.home ?? 0) / max) * 100}%`, background: match.home.color }} />
                      </span>
                      <span className="stat-row__label">{statLabel(stat.key, stat.label)}</span>
                      <span className="stat-row__bar stat-row__bar--away">
                        <i style={{ width: `${((stat.away ?? 0) / max) * 100}%`, background: match.away.color }} />
                      </span>
                    </div>
                    <span className="stat-row__value">{stat.awayDisplay}</span>
                  </div>
                );
              })}
          </div>

          {!stats.length && (
            <div className="panel-empty">
              <Icon name="layers" size={20} />
              <strong>比赛数据尚未产生</strong>
              <p>开赛后这里会出现控球、射门和传球数据。</p>
            </div>
          )}

          {momentum.buckets.length > 0 && (
            <div className="momentum">
              <div className="momentum__head">
                <span>比赛节奏</span>
                <em>每 5 分钟事件密度</em>
              </div>
              <div className="momentum__chart">
                {momentum.buckets.map((bucket, index) => (
                  <div className="momentum__bucket" key={index} title={`${index * 5}'–${index * 5 + 5}'`}>
                    <span
                      className="momentum__home"
                      style={{
                        height: `${(bucket.home / momentum.max) * 100}%`,
                        background: match.home.color,
                      }}
                    />
                    <span
                      className="momentum__away"
                      style={{
                        height: `${(bucket.away / momentum.max) * 100}%`,
                        background: match.away.color,
                      }}
                    />
                  </div>
                ))}
              </div>
              <div className="momentum__labels">
                <span>0'</span>
                <span>45'</span>
                <span>90'</span>
              </div>
            </div>
          )}

          <div className="stats-note">
            <Icon name="info" size={13} />
            {isReplay ? '回放模式显示全场技术统计' : '控球与射门来自实时技术统计'}；球员位置由阵型和事件推演。
          </div>
        </div>
      )}

      {tab === 'events' && (
        <div className="inspector__body events-view">
          <div className="panel-heading">
            <span>关键事件</span>
            <em>{isReplay ? '点击跳转' : '实时'}</em>
          </div>
          <div className="event-list">
            {visibleTimeline.map((event) => (
              <button
                key={`${event.id}-${event.totalClock}`}
                className={cn('event-row', eventClass(event))}
                onClick={() => event.totalClock > 0 && onSeek(Math.max(0, event.totalClock - 2))}
                title={event.totalClock > 0 ? '回看这个时刻' : undefined}
              >
                <span className="event-row__minute">{event.displayClock || `${Math.floor(event.totalClock / 60)}'`}</span>
                <span className={`event-row__icon ${eventClass(event)}`}>
                  <Icon name={eventIcon(event)} size={15} />
                </span>
                <span className="event-row__body">
                  <strong>{event.goal ? '进球' : event.red ? '红牌' : event.yellow ? '黄牌' : event.sub ? '换人' : eventVerb(event.type, event.typeText)}</strong>
                  <em>{event.playerName || event.text || match.league.name}</em>
                  {event.goal && event.scoring && <span className="event-row__score">比分改写</span>}
                </span>
              </button>
            ))}
            {!visibleTimeline.length && (
              <div className="panel-empty">
                <Icon name="radio" size={20} />
                <strong>还没有关键事件</strong>
                <p>进球、红黄牌和换人会出现在这里。</p>
              </div>
            )}
          </div>
          <div className="panel-hint">点击事件可进入回放，查看当时的 2D 画面。</div>
        </div>
      )}

      {tab === 'lineups' && (
        <div className="inspector__body lineups-view">
          <div className="panel-heading">
            <span>首发阵容</span>
            <em>{match.lineups.home.formation} / {match.lineups.away.formation}</em>
          </div>
          <div className="lineup-grid">
            {(['home', 'away'] as const).map((side) => {
              const team = match[side];
              const lineup = match.lineups[side];
              return (
                <section className="lineup" key={side}>
                  <div className="lineup__head">
                    <TeamCrest team={team} size={24} />
                    <div>
                      <strong>{team.shortName}</strong>
                      <span>{lineup.formation || '4-3-3'}</span>
                    </div>
                  </div>
                  <div className="lineup__list">
                    {lineup.starters.map((player) => (
                      <div className="lineup__player" key={`${side}-${player.id || player.jersey}`}>
                        <span className="lineup__num" style={{ borderColor: team.color }}>
                          {player.jersey}
                        </span>
                        <span className="lineup__name">{player.name}</span>
                        <em>{player.positionAbbr}</em>
                      </div>
                    ))}
                  </div>
                  {lineup.synthetic && <span className="lineup__note">阵容未公布 · 展示默认阵型</span>}
                </section>
              );
            })}
          </div>
          <div className="panel-hint">
            阵型位置来自赛前名单；比赛中的球员移动由球权、事件参与者和阵型共同推演。
          </div>
        </div>
      )}
    </div>
  );
}
