import { describe, expect, it } from 'vitest';
import { salesYears, summarizeSales, type SalesSource } from './sales';

const d = (issueDate: string, status: SalesSource['status'], total: number): SalesSource => ({
  issueDate,
  status,
  totals: { total, subtotal: Math.round(total / 1.1) },
});

const docs = [
  d('2026-01-10', 'paid', 110000),
  d('2026-01-20', 'issued', 55000),
  d('2026-03-05', 'paid', 33000),
  d('2026-03-06', 'draft', 999999),
  d('2026-03-07', 'cancelled', 888888),
  d('2025-12-25', 'paid', 22000),
  d('2025-11-01', 'issued', 11000),
];

describe('summarizeSales', () => {
  it('月別: 下書き・取消は含めない', () => {
    const { rows, total } = summarizeSales(docs, 'month', 2026);
    expect(rows).toHaveLength(12);
    expect(rows[0]).toEqual({ key: '2026-01', count: 2, issued: 165000, net: 150000, paid: 110000, unpaid: 55000 });
    expect(rows[1]).toMatchObject({ count: 0, issued: 0 });
    expect(rows[2]).toMatchObject({ count: 1, issued: 33000, paid: 33000, unpaid: 0 });
    expect(total).toMatchObject({ count: 3, issued: 198000, paid: 143000, unpaid: 55000 });
  });

  it('年別: 新しい年から', () => {
    const { rows, total } = summarizeSales(docs, 'year', 2026);
    expect(rows.map((r) => [r.key, r.issued, r.paid, r.unpaid])).toEqual([
      ['2026', 198000, 143000, 55000],
      ['2025', 33000, 22000, 11000],
    ]);
    expect(total.issued).toBe(231000);
  });

  it('対象年の一覧（今年を含む）', () => {
    expect(salesYears(docs, 2027)).toEqual([2027, 2026, 2025]);
  });
});
