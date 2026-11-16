import { Icon } from './Icon';

interface Props {
  open: boolean;
  onClose: () => void;
}

const shortcuts = [
  ['Ctrl + Shift + X', '瞬间切到工作表格'],
  ['Space', '暂停 / 继续画面'],
  ['F', '沉浸式 2D 球场'],
  ['M', '现场声开关'],
  ['Esc', '关闭面板 / 退出沉浸'],
];

export function InfoModal({ open, onClose }: Props) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-label="关于 Touchline">
        <button className="modal__close" onClick={onClose} aria-label="关闭">
          <Icon name="close" size={18} />
        </button>
        <span className="eyebrow">ABOUT THE FEED</span>
        <h2>真实比赛，映射成一张 2D 战术板。</h2>
        <p className="modal__lead">
          Touchline 读取真实比赛的比分、时间、事件和球权坐标，用早期足球经理式的 2D 画面呈现。
          它不假装是电视直播，而是把比赛压缩成一眼能看懂的空间信息。
        </p>

        <div className="modal__grid">
          <section>
            <span className="modal__num">01</span>
            <h3>数据是真的</h3>
            <p>
              比分、比赛时间、红黄牌、换人、射门和传球事件来自 ESPN 公开足球数据接口，无需 API Key。
              直播时每 12 秒同步一次。
            </p>
          </section>
          <section>
            <span className="modal__num">02</span>
            <h3>球的位置是真的</h3>
            <p>
              事件流包含每一次传球、争顶、射门的球场坐标。球在 2D 画面中的移动，直接使用这些坐标，
              并按事件时间插值。
            </p>
          </section>
          <section>
            <span className="modal__num">03</span>
            <h3>球员位置是推演</h3>
            <p>
              公开数据没有 22 人的光学追踪坐标。球员以真实首发阵型为骨架，根据球的位置、事件参与者和
              攻防方向移动，因此是“战术推演”，不是逐帧追踪。
            </p>
          </section>
          <section>
            <span className="modal__num">04</span>
            <h3>班味模式</h3>
            <p>
              按 Ctrl + Shift + X，页面会立刻变成一张季度运营复盘表。再按一次回来。
              页面标题和图标也会同步变化。
            </p>
          </section>
        </div>

        <div className="modal__lower">
          <div className="shortcut-list">
            <h3>快捷键</h3>
            {shortcuts.map(([key, label]) => (
              <div key={key}>
                <kbd>{key}</kbd>
                <span>{label}</span>
              </div>
            ))}
          </div>
          <div className="modal__note">
            <Icon name="info" size={16} />
            <p>
              这是一个个人观赛工具。数据源可能延迟或短暂不可用；2D 球员位置仅用于氛围和空间理解，
              不应作为战术分析依据。
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
