import { Icon } from './Icon';

interface Props {
  liveCount: number;
  lastUpdated?: string;
  soundOn: boolean;
  onSound: () => void;
  onBoss: () => void;
  onInfo: () => void;
  onMenu?: () => void;
}

function timeLabel(iso?: string) {
  if (!iso) return '--:--:--';
  const date = new Date(iso);
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);
}

export function TopBar({ liveCount, lastUpdated, soundOn, onSound, onBoss, onInfo, onMenu }: Props) {
  return (
    <header className="topbar">
      <button className="mobile-menu-button" onClick={onMenu} aria-label="打开赛程">
        <Icon name="calendar" size={17} />
      </button>
      <div className="brand">
        <span className="brand__mark">
          <span />
          <span />
          <span />
        </span>
        <div className="brand__text">
          <strong>TOUCHLINE</strong>
          <span>比赛指挥台 · 2D LIVE</span>
        </div>
      </div>

      <div className="topbar__center">
        <span className={`live-pill ${liveCount > 0 ? 'is-live' : ''}`}>
          <i />
          {liveCount > 0 ? `${liveCount} 场直播` : '暂无直播'}
        </span>
        <span className="sync-pill">
          <span className="sync-pill__dot" />
          数据同步 {timeLabel(lastUpdated)}
        </span>
      </div>

      <div className="topbar__actions">
        <button
          className={`icon-button ${soundOn ? 'is-on' : ''}`}
          onClick={onSound}
          title={soundOn ? '关闭现场声 (M)' : '开启现场声 (M)'}
          aria-label={soundOn ? '关闭现场声' : '开启现场声'}
        >
          <Icon name={soundOn ? 'volume' : 'volumeOff'} size={17} />
        </button>
        <button className="icon-button" onClick={onInfo} title="数据说明与快捷键" aria-label="数据说明">
          <Icon name="info" size={17} />
        </button>
        <button className="boss-button" onClick={onBoss} title="快速切换到工作界面 (Ctrl+Shift+X)">
          <Icon name="shield" size={16} />
          <span>上班模式</span>
          <kbd>Ctrl ⇧ X</kbd>
        </button>
      </div>
    </header>
  );
}
