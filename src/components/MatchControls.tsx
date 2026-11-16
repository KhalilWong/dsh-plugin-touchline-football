import type { MouseEvent as ReactMouseEvent } from 'react';
import type { EngineSnapshot, MatchMode, MatchResponse } from '../types';
import { cn } from '../lib/format';
import { Icon } from './Icon';

interface Props {
  match: MatchResponse;
  snapshot: EngineSnapshot | null;
  mode: MatchMode;
  paused: boolean;
  speed: number;
  showNames: boolean;
  theater: boolean;
  onToggle: () => void;
  onReplay: () => void;
  onLive: () => void;
  onSpeed: (speed: number) => void;
  onSeek: (second: number) => void;
  onToggleNames: () => void;
  onToggleTheater: () => void;
}

const speeds = [1, 4, 8, 16];

export function MatchControls({
  match,
  snapshot,
  mode,
  paused,
  speed,
  showNames,
  theater,
  onToggle,
  onReplay,
  onLive,
  onSpeed,
  onSeek,
  onToggleNames,
  onToggleTheater,
}: Props) {
  const isLiveMatch = match.status.state === 'in';
  const isReplay = mode === 'replay';
  const isPre = match.status.state === 'pre';
  const maxClock = Math.max(5400, match.latestPlayClock ?? 0, match.status.clock || 0);
  const progress = isReplay
    ? snapshot?.progress || 0
    : isPre
      ? 0
      : Math.min(1, (match.status.clock || 0) / maxClock);
  const clock = isPre ? 'PRE' : isReplay ? snapshot?.clockLabel || "0'" : match.status.displayClock || "0'";

  const seek = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!isReplay) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    onSeek(ratio * maxClock);
  };

  return (
    <div className="controls">
      <div className="controls__left">
        <button
          className="play-button"
          onClick={onToggle}
          disabled={isPre}
          aria-label={paused || isPre ? '继续播放' : '暂停'}
        >
          <Icon name={paused || isPre ? 'play' : 'pause'} size={19} />
        </button>
        {!isPre && (
          <button className="control-button" onClick={onReplay} title="从头回放">
            <Icon name="restart" size={16} />
            <span>{isReplay ? '重播' : '回看'}</span>
          </button>
        )}
        {isLiveMatch && (
          <button
            className={cn('control-button', mode === 'live' && 'is-active')}
            onClick={onLive}
            title="回到直播画面"
          >
            <Icon name="radio" size={15} />
            <span>直播</span>
          </button>
        )}
      </div>

      <div className="controls__timeline">
        <div
          className={cn('timeline-track', isReplay && 'is-seekable')}
          onClick={seek}
          role={isReplay ? 'slider' : undefined}
          aria-label={isReplay ? '回放进度' : undefined}
          aria-valuenow={isReplay ? Math.round(progress * 100) : undefined}
          aria-valuemin={0}
          aria-valuemax={100}
          tabIndex={isReplay ? 0 : -1}
        >
          <span className="timeline-track__fill" style={{ width: `${progress * 100}%` }} />
          <span className="timeline-track__knob" style={{ left: `${progress * 100}%` }} />
        </div>
        <div className="timeline-labels">
          <span>0'</span>
          <span className={cn('timeline-labels__now', mode === 'live' && 'is-live')}>
            {mode === 'live' && <i />}
            {clock}
            {isReplay && <em> · {speed}x</em>}
          </span>
          <span>{Math.max(90, Math.ceil(maxClock / 60))}'</span>
        </div>
      </div>

      <div className="controls__right">
        {isReplay ? (
          <div className="speed-pills">
            {speeds.map((value) => (
              <button key={value} className={cn(value === speed && 'is-active')} onClick={() => onSpeed(value)}>
                {value}x
              </button>
            ))}
          </div>
        ) : isPre ? (
          <span className="delay-pill">PRE</span>
        ) : (
          <span className="delay-pill">
            <i />
            5s buffer
          </span>
        )}
        <button
          className={cn('icon-button', showNames && 'is-on')}
          onClick={onToggleNames}
          title="显示球员姓名"
          aria-label="显示球员姓名"
        >
          <Icon name={showNames ? 'eye' : 'eyeOff'} size={16} />
        </button>
        <button
          className={cn('icon-button', theater && 'is-on')}
          onClick={onToggleTheater}
          title="沉浸模式 (F)"
          aria-label="沉浸模式"
        >
          <Icon name={theater ? 'shrink' : 'expand'} size={16} />
        </button>
      </div>
    </div>
  );
}
