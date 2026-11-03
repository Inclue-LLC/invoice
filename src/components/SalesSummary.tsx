import { useMemo, useState } from 'react';
import { formatYen } from '../lib/format';
import { salesYears, summarizeSales, type SalesMode, type SalesRow, type SalesSource } from '../lib/sales';

interface Props {
  invoices: SalesSource[];
  /** 月の行をクリックしたとき（"2026-11"）。その月の請求書一覧を開く */
  onSelectMonth?: (month: string) => void;
}

const STORAGE_KEY = 'salesSummary.mode';

function loadMode(): SalesMode {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'year' ? 'year' : 'month';
  } catch {
    return 'month';
  }
}

export default function SalesSummary({ invoices, onSelectMonth }: Props) {
  const currentYear = new Date().getFullYear();
  const [mode, setModeState] = useState<SalesMode>(loadMode);
  const years = useMemo(() => salesYears(invoices, currentYear), [invoices, currentYear]);
  const [year, setYear] = useState(currentYear);
  const { rows, total } = useMemo(() => summarizeSales(invoices, mode, year), [invoices, mode, year]);

  const setMode = (m: SalesMode) => {
    setModeState(m);
    try {
      localStorage.setItem(STORAGE_KEY, m);
    } catch {
      /* 保存できなくても表示には影響しない */
    }
  };

  const max = Math.max(1, ...rows.map((r) => r.issued));
  const paidRate = total.issued ? Math.round((total.paid / total.issued) * 100) : 0;
  const scopeLabel = mode === 'month' ? `${year}年` : '全期間';
  const rowLabel = (r: SalesRow) => (mode === 'month' ? `${Number(r.key.slice(5, 7))}月` : `${r.key}年`);
  const isCurrent = (r: SalesRow) =>
    mode === 'month'
      ? r.key === `${currentYear}-${String(new Date().getMonth() + 1).padStart(2, '0')}`
      : r.key === String(currentYear);

  return (
    <section className="card sales">
      <div className="sales-head">
        <h3>売上（請求書）</h3>
        <div className="sales-controls">
          <div className="segmented" role="tablist" aria-label="集計の単位">
            <button role="tab" aria-selected={mode === 'month'} className={mode === 'month' ? 'on' : ''} onClick={() => setMode('month')}>
              月別
            </button>
            <button role="tab" aria-selected={mode === 'year'} className={mode === 'year' ? 'on' : ''} onClick={() => setMode('year')}>
              年別
            </button>
          </div>
          {mode === 'month' && (
            <select value={year} onChange={(e) => setYear(Number(e.target.value))} aria-label="集計する年">
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}年
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      <div className="stat-tiles">
        <div className="stat">
          <div className="stat-label">{scopeLabel}の発行額</div>
          <div className="stat-value">{formatYen(total.issued)}</div>
          <div className="stat-sub">
            {total.count} 件・税抜 {formatYen(total.net)}
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">
            <span className="swatch swatch-paid" aria-hidden />
            入金済
          </div>
          <div className="stat-value">{formatYen(total.paid)}</div>
          <div className="stat-sub">入金率 {paidRate}%</div>
        </div>
        <div className="stat">
          <div className="stat-label">
            <span className="swatch swatch-unpaid" aria-hidden />
            未入金
          </div>
          <div className="stat-value">{formatYen(total.unpaid)}</div>
          <div className="stat-sub">{total.issued ? `発行額の ${100 - paidRate}%` : '—'}</div>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="muted">集計できる請求書がありません（状態が「発行済」「入金済」の請求書を集計します）。</p>
      ) : (
        <div className="table-wrap">
          <table className="table sales-table">
            <thead>
              <tr>
                <th>{mode === 'month' ? '月' : '年'}</th>
                <th className="num">件数</th>
                <th className="num">発行額（税込）</th>
                <th className="num">入金済</th>
                <th className="num">未入金</th>
                <th className="bar-col">
                  <span className="legend">
                    <span className="swatch swatch-paid" aria-hidden />
                    入金済
                    <span className="swatch swatch-unpaid" aria-hidden />
                    未入金
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const clickable = mode === 'month' && onSelectMonth && r.count > 0;
                const tip = `${rowLabel(r)}　発行額 ${formatYen(r.issued)}（${r.count}件）\n入金済 ${formatYen(r.paid)}\n未入金 ${formatYen(r.unpaid)}`;
                return (
                  <tr
                    key={r.key}
                    className={`${r.count === 0 ? 'zero' : ''} ${clickable ? 'clickable' : ''} ${isCurrent(r) ? 'current' : ''}`}
                    onClick={clickable ? () => onSelectMonth!(r.key) : undefined}
                    title={clickable ? 'クリックでこの月の請求書一覧を表示' : undefined}
                  >
                    <td>
                      {rowLabel(r)}
                      {isCurrent(r) && <span className="small muted">（{mode === 'month' ? '今月' : '今年'}）</span>}
                    </td>
                    <td className="num">{r.count || '—'}</td>
                    <td className="num">{r.count ? formatYen(r.issued) : '—'}</td>
                    <td className="num">{r.count ? formatYen(r.paid) : '—'}</td>
                    <td className="num">{r.count ? formatYen(r.unpaid) : '—'}</td>
                    <td className="bar-col">
                      {r.issued > 0 && (
                        <div className="sbar" style={{ width: `${(r.issued / max) * 100}%` }} title={tip} role="img" aria-label={tip}>
                          {r.paid > 0 && <span className="seg seg-paid" style={{ flexGrow: r.paid }} />}
                          {r.unpaid > 0 && <span className="seg seg-unpaid" style={{ flexGrow: r.unpaid }} />}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <th>合計</th>
                <td className="num">{total.count}</td>
                <td className="num">{formatYen(total.issued)}</td>
                <td className="num">{formatYen(total.paid)}</td>
                <td className="num">{formatYen(total.unpaid)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      <p className="muted small sales-note">
        発行日で集計（税込）。状態が「発行済」「入金済」の請求書が対象で、下書き・取消は含みません。
        {mode === 'month' && onSelectMonth && '月をクリックすると、その月の請求書一覧を開きます。'}
      </p>
    </section>
  );
}
