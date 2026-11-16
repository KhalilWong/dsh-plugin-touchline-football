import type { EngineSnapshot, MatchResponse } from '../types';
import { eventVerb } from '../lib/format';
import { Icon } from './Icon';

interface Props {
  match: MatchResponse;
  snapshot: EngineSnapshot | null;
}

export function CommentaryTicker({ match, snapshot }: Props) {
  const isReplay = snapshot?.mode === 'replay';
  const sim = snapshot?.simSecond ?? Number.POSITIVE_INFINITY;
  const matchEnd = (match.latestPlayClock ?? match.status.clock ?? 0) - 15;
  const liveCommentary = match.commentary.filter((item) => {
    if (!isReplay) return true;
    if (item.clock > sim + 1) return false;
    if (/^match ends/i.test(item.text) && sim < matchEnd) return false;
    return true;
  });
  const latest = liveCommentary[liveCommentary.length - 1];
  const previous = liveCommentary[liveCommentary.length - 2];
  const recentPlays = match.plays
    .filter((play) => play.text && (isReplay ? play.totalClock <= sim + 1 : true))
    .slice(-5)
    .reverse();

  const fallbackText =
    latest?.text ||
    (match.status.state === 'pre'
      ? '双方球员正在热身，比赛即将开始。'
      : '等待比赛事件…');

  return (
    <div className="ticker">
      <div className="ticker__label">
        <span className={match.status.state === 'in' ? 'is-live' : ''}>
          <Icon name="radio" size={13} />
          {match.status.state === 'in' ? 'LIVE FEED' : isReplay ? 'REPLAY FEED' : 'MATCH FEED'}
        </span>
      </div>
      <div className="ticker__main">
        <span className="ticker__minute">{latest?.displayClock || snapshot?.clockLabel || "0'"}</span>
        <p>{fallbackText}</p>
        {previous && <span className="ticker__prev">{previous.text}</span>}
      </div>
      <div className="ticker__events">
        {recentPlays.slice(0, 4).map((play) => (
          <span key={`${play.id}-${play.order}`} className="ticker__event">
            <b>{play.displayClock || `${Math.floor(play.totalClock / 60)}'`}</b>
            {eventVerb(play.type, play.typeText)}
          </span>
        ))}
      </div>
    </div>
  );
}
