import { describe, expect, it } from 'vitest';
import { calcTotals, calcWithholdingTax, lineAmount, roundBy } from './calc';
import { calcDueDate, formatDateJa, isValidRegistrationNumber } from './format';
import type { LineItem } from '../types';

const item = (quantity: number, unitPrice: number, taxRate: 10 | 8 | 0 = 10): LineItem => ({
  id: Math.random().toString(),
  name: 'x',
  quantity,
  unit: '個',
  unitPrice,
  taxRate,
});

describe('roundBy', () => {
  it('浮動小数点誤差に影響されない', () => {
    expect(roundBy(0.29 * 100, 'floor')).toBe(29);
    expect(roundBy(1.005 * 1000, 'floor')).toBe(1005);
  });
  it('各端数処理', () => {
    expect(roundBy(10.5, 'floor')).toBe(10);
    expect(roundBy(10.5, 'round')).toBe(11);
    expect(roundBy(10.1, 'ceil')).toBe(11);
    expect(roundBy(-10.5, 'floor')).toBe(-10);
  });
});

describe('lineAmount', () => {
  it('数量 × 単価', () => {
    expect(lineAmount({ quantity: 1.5, unitPrice: 333 }, 'floor')).toBe(499);
  });
});

describe('calcTotals', () => {
  it('外税: 税率ごとに1回だけ端数処理する', () => {
    const t = calcTotals([item(1, 1001), item(1, 1001), item(3, 333, 8)], 'exclusive', 'floor');
    expect(t.byRate).toEqual([
      { rate: 10, net: 2002, tax: 200, gross: 2202 },
      { rate: 8, net: 999, tax: 79, gross: 1078 },
    ]);
    expect(t.subtotal).toBe(3001);
    expect(t.tax).toBe(279);
    expect(t.total).toBe(3280);
  });

  it('内税: 税込金額から消費税額を算出する', () => {
    const t = calcTotals([item(1, 11000), item(1, 1080, 8)], 'inclusive', 'floor');
    expect(t.byRate).toEqual([
      { rate: 10, net: 10000, tax: 1000, gross: 11000 },
      { rate: 8, net: 1000, tax: 80, gross: 1080 },
    ]);
    expect(t.total).toBe(12080);
  });

  it('非課税・不課税（0%）', () => {
    const t = calcTotals([item(2, 500, 0)], 'exclusive', 'floor');
    expect(t.total).toBe(1000);
    expect(t.tax).toBe(0);
  });

  it('明細なし', () => {
    expect(calcTotals([], 'exclusive', 'floor')).toEqual({
      subtotal: 0,
      tax: 0,
      total: 0,
      byRate: [],
      withholdingBase: 0,
      withholdingTax: 0,
      payable: 0,
    });
  });
});

describe('calcWithholdingTax', () => {
  it('100万円以下は10.21%（1円未満切り捨て）', () => {
    expect(calcWithholdingTax(100000)).toBe(10210);
    expect(calcWithholdingTax(33333)).toBe(3403);
    expect(calcWithholdingTax(1_000_000)).toBe(102100);
  });
  it('国税庁の計算例どおり', () => {
    expect(calcWithholdingTax(50000)).toBe(5105);
    expect(calcWithholdingTax(300000)).toBe(30630);
    expect(calcWithholdingTax(999999)).toBe(102099);
    expect(calcWithholdingTax(2_000_000)).toBe(306300);
    expect(calcWithholdingTax(10_000_000)).toBe(1_939_900);
  });
  it('100万円超の部分は20.42%', () => {
    expect(calcWithholdingTax(1_500_000)).toBe(204200);
    expect(calcWithholdingTax(1_000_001)).toBe(102100);
    expect(calcWithholdingTax(1_000_005)).toBe(102101);
  });
  it('0以下は0', () => {
    expect(calcWithholdingTax(0)).toBe(0);
    expect(calcWithholdingTax(-100)).toBe(0);
  });
});

describe('calcTotals（源泉徴収）', () => {
  it('外税・税抜金額を対象', () => {
    const t = calcTotals([item(1, 100000)], 'exclusive', 'floor', { enabled: true, baseMode: 'net' });
    expect(t.total).toBe(110000);
    expect(t.withholdingBase).toBe(100000);
    expect(t.withholdingTax).toBe(10210);
    expect(t.payable).toBe(99790);
  });

  it('外税・税込金額を対象', () => {
    const t = calcTotals([item(1, 100000)], 'exclusive', 'floor', { enabled: true, baseMode: 'gross' });
    expect(t.withholdingBase).toBe(110000);
    expect(t.withholdingTax).toBe(11231);
    expect(t.payable).toBe(98769);
  });

  it('内税・税抜金額を対象', () => {
    const t = calcTotals([item(1, 110000)], 'inclusive', 'floor', { enabled: true, baseMode: 'net' });
    expect(t.withholdingBase).toBe(100000);
    expect(t.withholdingTax).toBe(10210);
    expect(t.payable).toBe(99790);
  });

  it('対象外の明細（交通費など）は除外する', () => {
    const fee = item(1, 200000);
    const travel = { ...item(1, 5000), withholding: false };
    const t = calcTotals([fee, travel], 'exclusive', 'floor', { enabled: true, baseMode: 'net' });
    expect(t.total).toBe(225500);
    expect(t.withholdingBase).toBe(200000);
    expect(t.withholdingTax).toBe(20420);
    expect(t.payable).toBe(205080);
  });

  it('無効なら差し引かない', () => {
    const t = calcTotals([item(1, 100000)], 'exclusive', 'floor', { enabled: false, baseMode: 'net' });
    expect(t.withholdingTax).toBe(0);
    expect(t.payable).toBe(110000);
  });
});

describe('format', () => {
  it('formatDateJa', () => {
    expect(formatDateJa('2026-11-03')).toBe('2026年11月3日');
  });
  it('calcDueDate: 翌月末', () => {
    expect(calcDueDate('2026-01-15', 0)).toBe('2026-02-28');
    expect(calcDueDate('2026-12-01', 0)).toBe('2027-01-31');
  });
  it('calcDueDate: 日数指定', () => {
    expect(calcDueDate('2026-11-20', 30)).toBe('2026-12-20');
  });
  it('登録番号', () => {
    expect(isValidRegistrationNumber('T1234567890123')).toBe(true);
    expect(isValidRegistrationNumber('1234567890123')).toBe(false);
  });
});
