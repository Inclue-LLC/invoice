import { lineAmount, newItem } from '../lib/calc';
import { formatNumber } from '../lib/format';
import type { LineItem, Rounding, TaxRate } from '../types';

interface Props {
  items: LineItem[];
  rounding: Rounding;
  onChange: (items: LineItem[]) => void;
}

const UNITS = ['式', '個', '件', '台', '本', '枚', '時間', '人月', '月', '回', 'kg', 'm'];

export default function ItemsEditor({ items, rounding, onChange }: Props) {
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
      <table className="table">
        <thead>
          <tr>
            <th>品名・内容</th>
            <th style={{ width: 90 }}>数量</th>
            <th style={{ width: 80 }}>単位</th>
            <th style={{ width: 120 }}>単価</th>
            <th style={{ width: 100 }}>税率</th>
            <th style={{ width: 110 }} className="num">
              金額
            </th>
            <th style={{ width: 100 }} />
          </tr>
        </thead>
        <tbody>
          {items.map((it, idx) => (
            <tr key={it.id}>
              <td data-label="品名">
                <input value={it.name} onChange={(e) => update(it.id, { name: e.target.value })} placeholder="品名" />
              </td>
              <td data-label="数量">
                <input
                  type="number"
                  step="any"
                  value={Number.isFinite(it.quantity) ? it.quantity : ''}
                  onChange={(e) => update(it.id, { quantity: num(e.target.value) })}
                />
              </td>
              <td data-label="単位">
                <input list="unit-list" value={it.unit} onChange={(e) => update(it.id, { unit: e.target.value })} />
              </td>
              <td data-label="単価">
                <input
                  type="number"
                  step="any"
                  value={Number.isFinite(it.unitPrice) ? it.unitPrice : ''}
                  onChange={(e) => update(it.id, { unitPrice: num(e.target.value) })}
                />
              </td>
              <td data-label="税率">
                <select
                  value={it.taxRate}
                  onChange={(e) => update(it.id, { taxRate: Number(e.target.value) as TaxRate })}
                >
                  <option value={10}>10%</option>
                  <option value={8}>8%（軽減）</option>
                  <option value={0}>対象外</option>
                </select>
              </td>
              <td className="num" data-label="金額">
                {formatNumber(lineAmount(it, rounding))}
              </td>
              <td className="row-actions">
                <button type="button" className="btn btn-icon" title="上へ" onClick={() => move(idx, -1)}>
                  ↑
                </button>
                <button type="button" className="btn btn-icon" title="下へ" onClick={() => move(idx, 1)}>
                  ↓
                </button>
                <button
                  type="button"
                  className="btn btn-icon btn-danger"
                  title="削除"
                  onClick={() => onChange(items.filter((i) => i.id !== it.id))}
                >
                  ×
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button type="button" className="btn" onClick={() => onChange([...items, newItem()])}>
        ＋ 明細を追加
      </button>
    </div>
  );
}
