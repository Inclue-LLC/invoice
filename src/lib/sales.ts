/**
 * 請求書の売上集計（発行日基準・税込）。
 * - 発行額: 状態が「発行済」「入金済」の請求書の合計（下書き・取消は含めない）
 * - 入金済: 「入金済」の合計 / 未入金: 「発行済」の合計
 */
import type { DocStatus, Totals } from '../types';

export interface SalesSource {
  issueDate: string;
  status: DocStatus;
  totals: Pick<Totals, 'total' | 'subtotal'>;
}

export interface SalesRow {
  /** 月別: "2026-11" / 年別: "2026" */
  key: string;
  count: number;
  /** 発行額（税込） */
  issued: number;
  /** 発行額（税抜） */
  net: number;
  paid: number;
  unpaid: number;
}

export type SalesMode = 'month' | 'year';

const emptyRow = (key: string): SalesRow => ({ key, count: 0, issued: 0, net: 0, paid: 0, unpaid: 0 });

function add(row: SalesRow, d: SalesSource) {
  row.count += 1;
  row.issued += d.totals.total;
  row.net += d.totals.subtotal;
  if (d.status === 'paid') row.paid += d.totals.total;
  else row.unpaid += d.totals.total;
}

const counted = (d: SalesSource) => (d.status === 'issued' || d.status === 'paid') && /^\d{4}-\d{2}/.test(d.issueDate);

/** 集計対象の年（新しい順）。今年は請求書が無くても含める */
export function salesYears(docs: SalesSource[], currentYear: number): number[] {
  const ys = new Set<number>([currentYear]);
  docs.filter(counted).forEach((d) => ys.add(Number(d.issueDate.slice(0, 4))));
  return [...ys].sort((a, b) => b - a);
}

/** 月別（指定年の1〜12月）または年別の集計と合計 */
export function summarizeSales(
  docs: SalesSource[],
  mode: SalesMode,
  year: number,
): { rows: SalesRow[]; total: SalesRow } {
  const target = docs.filter(counted);
  const total = emptyRow('total');
  let rows: SalesRow[];
  if (mode === 'month') {
    rows = Array.from({ length: 12 }, (_, i) => emptyRow(`${year}-${String(i + 1).padStart(2, '0')}`));
    for (const d of target) {
      if (Number(d.issueDate.slice(0, 4)) !== year) continue;
      add(rows[Number(d.issueDate.slice(5, 7)) - 1], d);
      add(total, d);
    }
  } else {
    const map = new Map<string, SalesRow>();
    for (const d of target) {
      const key = d.issueDate.slice(0, 4);
      if (!map.has(key)) map.set(key, emptyRow(key));
      add(map.get(key)!, d);
      add(total, d);
    }
    rows = [...map.values()].sort((a, b) => b.key.localeCompare(a.key));
  }
  return { rows, total };
}
