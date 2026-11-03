import type { LineItem, RateBreakdown, Rounding, TaxMode, TaxRate, Totals } from '../types';

/** 浮動小数点誤差を除去してから端数処理する */
export function roundBy(value: number, mode: Rounding): number {
  const v = Number(value.toFixed(6));
  switch (mode) {
    case 'floor':
      return v >= 0 ? Math.floor(v) : -Math.floor(-v);
    case 'ceil':
      return v >= 0 ? Math.ceil(v) : -Math.ceil(-v);
    default:
      return v >= 0 ? Math.round(v) : -Math.round(-v);
  }
}

export function lineAmount(item: Pick<LineItem, 'quantity' | 'unitPrice'>, rounding: Rounding): number {
  const q = Number.isFinite(item.quantity) ? item.quantity : 0;
  const p = Number.isFinite(item.unitPrice) ? item.unitPrice : 0;
  return roundBy(q * p, rounding);
}

const RATE_ORDER: TaxRate[] = [10, 8, 0];

/**
 * 適格請求書（インボイス制度）の要件に合わせ、税率ごとに合計してから消費税額を1回だけ端数処理する。
 */
export function calcTotals(items: LineItem[], taxMode: TaxMode, rounding: Rounding): Totals {
  const sums = new Map<TaxRate, number>();
  for (const item of items) {
    const amount = lineAmount(item, rounding);
    sums.set(item.taxRate, (sums.get(item.taxRate) ?? 0) + amount);
  }

  const byRate: RateBreakdown[] = [];
  for (const rate of RATE_ORDER) {
    if (!sums.has(rate)) continue;
    const base = sums.get(rate)!;
    if (taxMode === 'exclusive') {
      const tax = roundBy((base * rate) / 100, rounding);
      byRate.push({ rate, net: base, tax, gross: base + tax });
    } else {
      const tax = roundBy((base * rate) / (100 + rate), rounding);
      byRate.push({ rate, net: base - tax, tax, gross: base });
    }
  }

  return {
    subtotal: byRate.reduce((s, r) => s + r.net, 0),
    tax: byRate.reduce((s, r) => s + r.tax, 0),
    total: byRate.reduce((s, r) => s + r.gross, 0),
    byRate,
  };
}

export function newItem(taxRate: TaxRate = 10): LineItem {
  return {
    id: Math.random().toString(36).slice(2, 10),
    name: '',
    quantity: 1,
    unit: '式',
    unitPrice: 0,
    taxRate,
  };
}
