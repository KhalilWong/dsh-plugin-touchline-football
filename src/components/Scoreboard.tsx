import type { EngineSnapshot, MatchResponse } from '../types';
import { kickoffTime, phaseLabel } from '../lib/format';
import { Icon } from './Icon';
import { TeamCrest } from './TeamCrest';

interface Props {
  match: MatchResponse;
  snapshot: EngineSnapshot | null;
}

export function Scoreboard({ match, snapshot }: Props) {
  const mode = snapshot?.mode || (match.status.state === 'in' ? 'live' : match.status.state === 'post' ? 'replay' : 'pre');
  const replaying = mode === 'replay';
  const score = replaying && snapshot ? snapshot.score : { home: match.home.score, away: match.away.score };
  const clock = snapshot?.clockLabel || match.status.displayClock;
  const isLive = match.status.state === 'in';
  const isPre = match.status.state === 'pre';
  const period = snapshot?.periodLabel || phaseLabel(match.status);

  return (
    <section className="scoreboard">
      <div className="scoreboard__meta">
        <span className="scoreboard__league">
          <Icon name="layers" size={13} />
          {match.league.name}
        </span>
        <span className="scoreboard__venue">
          {match.venue.name || '比赛场地'}
          {match.venue.city ? ` · ${match.venue.city}` : ''}
        </span>
        <span className={`mode-chip ${mode}`}>
          {mode === 'live' ? (
            <>
              <i />
              LIVE
            </>
          ) : mode === 'replay' ? (
            'REPLAY'
          ) : (
            'PRE-MATCH'
          )}
        </span>
      </div>

      <div className="scoreboard__main">
        <div className="score-team score-team--home">
          <TeamCrest team={match.home} size={54} />
          <div className="score-team__text">
            <span className="score-team__tag">HOME</span>
            <strong>{match.home.name}</strong>
            <span className="score-team__sub">
              {match.lineups.home.formation || '4-3-3'} · {match.home.abbr}
            </span>
          </div>
        </div>

        <div className="scoreboard__center">
          <div className={`score-digits ${mode}`}>
            <span>{score.home}</span>
            <span className="score-digits__sep">:</span>
            <span>{score.away}</span>
          </div>
          <div className="score-clock">
            {isPre ? (
              <>
                <span className="score-clock__time">{kickoffTime(match.date)}</span>
                <span className="score-clock__phase">开赛</span>
              </>
            ) : (
              <>
                <span className="score-clock__time">{clock}</span>
                <span className="score-clock__phase">
                  {isLive ? period : mode === 'replay' ? '回放' : '全场'}
                </span>
              </>
            )}
          </div>
        </div>

        <div className="score-team score-team--away">
          <div className="score-team__text">
            <span className="score-team__tag">AWAY</span>
            <strong>{match.away.name}</strong>
            <span className="score-team__sub">
              {match.lineups.away.formation || '4-3-3'} · {match.away.abbr}
            </span>
          </div>
          <TeamCrest team={match.away} size={54} />
        </div>
      </div>

      <div className="scoreboard__strip">
        <span>
          <b style={{ background: match.home.color }} />
          {match.home.form ? `近况 ${match.home.form.split('').join(' ')}` : match.home.shortName}
        </span>
        <span className="scoreboard__strip-center">
          {isLive ? '2D 实时映射 · 5s 缓冲' : '2D 战术视角'}
        </span>
        <span>
          {match.away.form ? `近况 ${match.away.form.split('').join(' ')}` : match.away.shortName}
          <b style={{ background: match.away.color }} />
        </span>
      </div>
    </section>
  );
}
