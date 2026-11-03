import type {
  LineItem,
  RateBreakdown,
  Rounding,
  TaxMode,
  TaxRate,
  Totals,
  WithholdingOptions,
} from '../types';

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

/** 明細が源泉徴収の対象か（未設定は対象） */
export function isWithholdingItem(item: Pick<LineItem, 'withholding'>): boolean {
  return item.withholding !== false;
}

/**
 * 報酬・料金等に対する源泉徴収税額（所得税法204条1項1号・2号の報酬、復興特別所得税を含む）
 * - 100万円以下の部分: 10.21%
 * - 100万円を超える部分: 20.42%
 * 1円未満の端数は切り捨て。
 */
export function calcWithholdingTax(base: number): number {
  if (base <= 0) return 0;
  if (base <= 1_000_000) return Math.floor((base * 1021) / 10000);
  return 102_100 + Math.floor(((base - 1_000_000) * 2042) / 10000);
}

const RATE_ORDER: TaxRate[] = [10, 8, 0];

export const NO_WITHHOLDING: WithholdingOptions = { enabled: false, baseMode: 'net' };

/**
 * 適格請求書（インボイス制度）の要件に合わせ、税率ごとに合計してから消費税額を1回だけ端数処理する。
 * 源泉徴収を行う場合は、対象明細の税抜（または税込）金額から源泉徴収税額を算出する。
 */
export function calcTotals(
  items: LineItem[],
  taxMode: TaxMode,
  rounding: Rounding,
  withholding: WithholdingOptions = NO_WITHHOLDING,
): Totals {
  const sums = new Map<TaxRate, number>();
  const whSums = new Map<TaxRate, number>();
  for (const item of items) {
    const amount = lineAmount(item, rounding);
    sums.set(item.taxRate, (sums.get(item.taxRate) ?? 0) + amount);
    if (isWithholdingItem(item)) whSums.set(item.taxRate, (whSums.get(item.taxRate) ?? 0) + amount);
  }

  const taxOf = (amount: number, rate: TaxRate) =>
    taxMode === 'exclusive' ? roundBy((amount * rate) / 100, rounding) : roundBy((amount * rate) / (100 + rate), rounding);

  const byRate: RateBreakdown[] = [];
  let withholdingBase = 0;
  for (const rate of RATE_ORDER) {
    if (!sums.has(rate)) continue;
    const base = sums.get(rate)!;
    const tax = taxOf(base, rate);
    if (taxMode === 'exclusive') byRate.push({ rate, net: base, tax, gross: base + tax });
    else byRate.push({ rate, net: base - tax, tax, gross: base });

    if (withholding.enabled && whSums.has(rate)) {
      const wh = whSums.get(rate)!;
      // 対象明細が税率区分の全部なら、表示している消費税額と一致させる
      const whTax = wh === base ? tax : taxOf(wh, rate);
      const net = taxMode === 'exclusive' ? wh : wh - whTax;
      const gross = taxMode === 'exclusive' ? wh + whTax : wh;
      withholdingBase += withholding.baseMode === 'net' ? net : gross;
    }
  }

  const total = byRate.reduce((s, r) => s + r.gross, 0);
  const withholdingTax = withholding.enabled ? calcWithholdingTax(withholdingBase) : 0;
  return {
    subtotal: byRate.reduce((s, r) => s + r.net, 0),
    tax: byRate.reduce((s, r) => s + r.tax, 0),
    total,
    byRate,
    withholdingBase: withholding.enabled ? withholdingBase : 0,
    withholdingTax,
    payable: total - withholdingTax,
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
