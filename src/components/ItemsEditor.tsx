import { lineAmount, newItem } from '../lib/calc';
import { formatNumber } from '../lib/format';
import type { LineItem, Rounding, TaxRate } from '../types';

interface Props {
  items: LineItem[];
  rounding: Rounding;
  /** 明細ごとの源泉徴収対象チェックを表示する */
  showWithholding?: boolean;
  onChange: (items: LineItem[]) => void;
}

const UNITS = ['式', '個', '件', '台', '本', '枚', '時間', '人月', '月', '回', 'kg', 'm'];

export default function ItemsEditor({ items, rounding, showWithholding = false, onChange }: Props) {
  const update = (id: string, patch: Partial<LineItem>) =>
    onChange(items.map((i) => (i.id === id ? { ...i, ...patch } : i)));

  const move = (index: number, dir: -1 | 1) => {
    const j = index + dir;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[index], next[j]] = [next[j], next[index]];
    onChange(next);
  };

  const num = (v: string) => (v === '' || v === '-' ? 0 : Number(v));

  return (
    <div className="items-editor">
      <datalist id="unit-list">
        {UNITS.map((u) => (
          <option key={u} value={u} />
        ))}
      </datalist>
      <div className="item-list">
        {items.map((it, idx) => (
          <div className="item-row" key={it.id}>
            <div className="item-main">
              <span className="item-no">{idx + 1}</span>
              <label className="item-name">
                <span className="item-label">品名・内容</span>
                <textarea
                  rows={Math.max(1, it.name.split('\n').length)}
                  value={it.name}
                  placeholder="品名・作業内容（改行できます）"
                  onChange={(e) => update(it.id, { name: e.target.value })}
                />
              </label>
              <div className="item-actions">
                <button type="button" className="btn btn-icon" title="上へ" disabled={idx === 0} onClick={() => move(idx, -1)}>
                  ↑
                </button>
                <button
                  type="button"
                  className="btn btn-icon"
                  title="下へ"
                  disabled={idx === items.length - 1}
                  onClick={() => move(idx, 1)}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="btn btn-icon btn-danger"
                  title="この明細を削除"
                  onClick={() => onChange(items.filter((i) => i.id !== it.id))}
                >
                  ×
                </button>
              </div>
            </div>
            <div className={`item-sub ${showWithholding ? 'with-wh' : ''}`}>
              <label>
                <span className="item-label">数量</span>
                <input
                  type="number"
                  step="any"
                  value={Number.isFinite(it.quantity) ? it.quantity : ''}
                  onChange={(e) => update(it.id, { quantity: num(e.target.value) })}
                />
              </label>
              <label>
                <span className="item-label">単位</span>
                <input list="unit-list" value={it.unit} onChange={(e) => update(it.id, { unit: e.target.value })} />
              </label>
              <label>
                <span className="item-label">単価</span>
                <input
                  type="number"
                  step="any"
                  value={Number.isFinite(it.unitPrice) ? it.unitPrice : ''}
                  onChange={(e) => update(it.id, { unitPrice: num(e.target.value) })}
                />
              </label>
              <label>
                <span className="item-label">税率</span>
                <select value={it.taxRate} onChange={(e) => update(it.id, { taxRate: Number(e.target.value) as TaxRate })}>
                  <option value={10}>10%</option>
                  <option value={8}>8%（軽減）</option>
                  <option value={0}>対象外</option>
                </select>
              </label>
              {showWithholding && (
                <label className="item-wh">
                  <span className="item-label">源泉</span>
                  <input
                    type="checkbox"
                    className="inline-check"
                    title="源泉徴収の対象"
                    checked={it.withholding !== false}
                    onChange={(e) => update(it.id, { withholding: e.target.checked })}
                  />
                </label>
              )}
              <div className="item-amount">
                <span className="item-label">金額</span>
                <span>¥{formatNumber(lineAmount(it, rounding))}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
      <button type="button" className="btn" onClick={() => onChange([...items, newItem()])}>
        ＋ 明細を追加
      </button>
    </div>
  );
}
