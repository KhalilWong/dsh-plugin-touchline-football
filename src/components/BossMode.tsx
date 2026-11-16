import { useEffect, useState } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
}

const rows = [
  ['CC-1042', 'Commercial Ops', 'J. Whitfield', 42, 1280000, 1194000, -86000, 0.93, 'On track'],
  ['CC-1043', 'Client Delivery', 'M. Okafor', 68, 2140000, 2218000, 78000, 1.04, 'Watch'],
  ['CC-1044', 'Data & Insights', 'R. Chen', 24, 940000, 887000, -53000, 0.94, 'On track'],
  ['CC-1045', 'Platform Eng.', 'S. Iyer', 57, 1980000, 2044000, 64000, 1.03, 'Watch'],
  ['CC-1046', 'Revenue Enablement', 'A. Dubois', 19, 760000, 712000, -48000, 0.94, 'On track'],
  ['CC-1047', 'People Operations', 'K. Mensah', 16, 590000, 602000, 12000, 1.02, 'On track'],
  ['CC-1048', 'Finance Shared Svcs', 'L. Park', 22, 810000, 798000, -12000, 0.99, 'On track'],
  ['CC-1049', 'Risk & Compliance', 'D. Alvarez', 14, 640000, 671000, 31000, 1.05, 'Watch'],
  ['CC-1050', 'Marketing Studio', 'H. Nakamura', 31, 1120000, 1089000, -31000, 0.97, 'On track'],
  ['CC-1051', 'Customer Success', 'T. Brennan', 46, 1460000, 1572000, 112000, 1.08, 'Action'],
  ['CC-1052', 'Solutions Architecture', 'P. Novak', 28, 1310000, 1288000, -22000, 0.98, 'On track'],
  ['CC-1053', 'Procurement', 'E. Larsson', 12, 480000, 466000, -14000, 0.97, 'On track'],
  ['CC-1054', 'Workplace', 'N. Haddad', 18, 620000, 641000, 21000, 1.03, 'Watch'],
  ['CC-1055', 'Strategy Office', 'C. Bennett', 9, 510000, 498000, -12000, 0.98, 'On track'],
  ['CC-1056', 'Legal Counsel', 'F. Rossi', 11, 570000, 589000, 19000, 1.03, 'Watch'],
  ['CC-1057', 'Talent Acquisition', 'G. Silva', 15, 520000, 511000, -9000, 0.98, 'On track'],
  ['CC-1058', 'IT Service Desk', 'B. Kowalski', 26, 730000, 744000, 14000, 1.02, 'On track'],
  ['CC-1059', 'Executive Office', 'V. Sinclair', 6, 640000, 631000, -9000, 0.99, 'On track'],
];

const columns = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

function fmtMoney(n: number) {
  return n.toLocaleString('en-GB');
}

export function BossMode({ open, onClose }: Props) {
  const [toast, setToast] = useState(false);

  useEffect(() => {
    if (!open) return;
    setToast(true);
    const timer = setTimeout(() => setToast(false), 2600);
    return () => clearTimeout(timer);
  }, [open]);

  if (!open) return null;

  return (
    <div className="boss" role="dialog" aria-label="Operations review spreadsheet">
      <div className="boss__titlebar">
        <div className="boss__excel-mark">
          <span>X</span>
        </div>
        <div className="boss__filename">
          <strong>Northbridge Advisory — Q3 Operations Review.xlsx</strong>
          <span>Saved to SharePoint · AutoSave on</span>
        </div>
        <div className="boss__title-actions">
          <span>—</span>
          <span>□</span>
          <span>×</span>
        </div>
      </div>

      <div className="boss__tabs">
        {['File', 'Home', 'Insert', 'Page Layout', 'Formulas', 'Data', 'Review', 'View', 'Help'].map((tab, i) => (
          <span key={tab} className={i === 1 ? 'is-active' : ''}>
            {tab}
          </span>
        ))}
      </div>

      <div className="boss__ribbon">
        <div className="ribbon-group">
          <span className="ribbon-icon">📋</span>
          <small>Paste</small>
        </div>
        <div className="ribbon-sep" />
        <div className="ribbon-group ribbon-group--font">
          <select aria-label="Font" defaultValue="Calibri">
            <option>Calibri</option>
            <option>Aptos</option>
          </select>
          <select aria-label="Size" defaultValue="11">
            <option>11</option>
            <option>12</option>
          </select>
          <div className="ribbon-buttons">
            <b>B</b>
            <i>I</i>
            <u>U</u>
            <span className="ribbon-color">A</span>
          </div>
        </div>
        <div className="ribbon-sep" />
        <div className="ribbon-group">
          <span className="ribbon-icon">≡</span>
          <small>Alignment</small>
        </div>
        <div className="ribbon-group">
          <span className="ribbon-icon">%</span>
          <small>Number</small>
        </div>
        <div className="ribbon-sep" />
        <div className="ribbon-group">
          <span className="ribbon-icon">Σ</span>
          <small>AutoSum</small>
        </div>
        <div className="ribbon-group">
          <span className="ribbon-icon">▦</span>
          <small>Table</small>
        </div>
        <div className="ribbon-spacer" />
        <div className="ribbon-user">
          <span>JW</span>
          <small>Editing</small>
        </div>
      </div>

      <div className="boss__formula">
        <span className="boss__namebox">G12</span>
        <span className="boss__fx">fx</span>
        <span className="boss__formula-text">=SUM($E$3:$E$20)-SUM($F$3:$F$20)</span>
        <span className="boss__formula-right">Ready</span>
      </div>

      <div className="boss__sheet">
        <div className="boss__main">
          <div className="boss__sheet-caption">
            <h1>FY26 Q3 — Operations Review</h1>
            <p>Cost centre performance · Management pack v4 · Period ending 30 September 2026</p>
          </div>
          <div className="boss__grid-wrap">
          <table className="boss__grid">
            <colgroup>
              <col style={{ width: '3%' }} />
              <col style={{ width: '9%' }} />
              <col style={{ width: '20%' }} />
              <col style={{ width: '14%' }} />
              <col style={{ width: '6%' }} />
              <col style={{ width: '12%' }} />
              <col style={{ width: '12%' }} />
              <col style={{ width: '12%' }} />
              <col style={{ width: '12%' }} />
            </colgroup>
            <thead>
              <tr>
                <th className="corner" />
                {columns.map((col) => (
                  <th key={col}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <th>1</th>
                <td colSpan={8} className="sheet-title">
                  Northbridge Advisory Group — Q3 FY26 Operations Review
                </td>
              </tr>
              <tr>
                <th>2</th>
                <td colSpan={8} className="sheet-sub">
                  All figures in GBP · Prepared by Finance Business Partnering · Internal only
                </td>
              </tr>
              <tr className="sheet-header">
                <th>3</th>
                <td>Cost centre</td>
                <td>Function</td>
                <td>Owner</td>
                <td className="num">Headcount</td>
                <td className="num">Budget</td>
                <td className="num">Actual</td>
                <td className="num">Variance</td>
                <td className="num">Util.</td>
              </tr>
              {rows.map((row, index) => {
                const rowNumber = index + 4;
                const variance = Number(row[6]);
                return (
                  <tr key={rowNumber}>
                    <th>{rowNumber}</th>
                    <td>{row[0]}</td>
                    <td>{row[1]}</td>
                    <td>{row[2]}</td>
                    <td className="num">{row[3]}</td>
                    <td className="num">{fmtMoney(Number(row[4]))}</td>
                    <td className="num">{fmtMoney(Number(row[5]))}</td>
                    <td className={`num ${variance > 0 ? 'neg' : 'pos'}`}>
                      {variance > 0 ? '+' : ''}
                      {fmtMoney(variance)}
                    </td>
                    <td className={`num ${Number(row[7]) > 1.05 ? 'neg' : ''}`}>
                      {Math.round(Number(row[7]) * 100)}%
                    </td>
                  </tr>
                );
              })}
              <tr className="sheet-total">
                <th>22</th>
                <td colSpan={3}>Total operations</td>
                <td className="num">462</td>
                <td className="num">18,510,000</td>
                <td className="num">18,842,000</td>
                <td className="num neg">+332,000</td>
                <td className="num">101.8%</td>
              </tr>
              <tr>
                <th>23</th>
                <td colSpan={8} />
              </tr>
              <tr>
                <th>24</th>
                <td colSpan={8} className="sheet-note">
                  Commentary: Two cost centres require Q4 remediation plans. Customer Success overrun driven by
                  backfill and extended onboarding; Risk & Compliance reflects delayed contractor start.
                </td>
              </tr>
            </tbody>
          </table>
          </div>
        </div>
        <div className="boss__chart">
          <div className="boss__chart-head">
            <span>Variance by function</span>
            <small>GBP ’000</small>
          </div>
          {rows.slice(0, 9).map((row) => {
            const variance = Number(row[6]) / 1000;
            const width = Math.min(100, Math.abs(variance) / 1.2);
            return (
              <div className="boss__bar" key={row[0]}>
                <span>{String(row[1]).split(' ')[0]}</span>
                <i className={variance > 0 ? 'neg' : 'pos'} style={{ width: `${width}%` }} />
                <em>{variance > 0 ? '+' : ''}{variance.toFixed(0)}</em>
              </div>
            );
          })}
        </div>
      </div>

      <div className="boss__sheet-tabs">
        <span className="is-active">Summary</span>
        <span>Headcount</span>
        <span>Vendors</span>
        <span>Q3 Board</span>
        <span className="plus">+</span>
      </div>

      <div className="boss__status">
        <span>Ready</span>
        <span>Average: 18,842,000 · Count: 18 · Sum: 18,842,000</span>
        <span className="boss__zoom">100%</span>
        <button className="boss__return" onClick={onClose} title="返回 Touchline (Ctrl+Shift+X)">
          ●
        </button>
        <span className="boss__hint">Ctrl+Shift+X to return</span>
      </div>

      {toast && (
        <div className="boss__toast">
          已切换到工作界面 · <b>Ctrl+Shift+X</b> 返回比赛
        </div>
      )}
    </div>
  );
}
