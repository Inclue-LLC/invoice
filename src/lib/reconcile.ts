/**
 * 銀行の入金と未入金の請求書を突き合わせる（入金消込）。
 * - 金額が一致し、振込名義が取引先と一致 → 確実
 * - 同じ取引先の複数の請求書の合計と一致 → まとめて入金
 * - 金額だけ一致（同額の請求書・入金が他に無い） → 金額一致
 * - 振込名義が一致し、差額が振込手数料程度 → 手数料差引の可能性（要確認）
 * - 同額の候補が複数 → 要確認
 */
import type { BankTransaction } from './bankStatement';

export interface InvoiceForMatch {
  id: string;
  number: string;
  clientId: string | null;
  clientName: string;
  total: number;
  issueDate: string;
  dueDate: string;
}

export type MatchKind = 'certain' | 'group' | 'amount' | 'fee' | 'ambiguous';

export interface MatchProposal {
  invoiceIds: string[];
  kind: MatchKind;
  nameMatched: boolean;
  /** 請求額合計 − 入金額 */
  diff: number;
}

export const MATCH_LABELS: Record<MatchKind, string> = {
  certain: '金額・名義一致',
  group: 'まとめて入金',
  amount: '金額一致',
  fee: '手数料差引？',
  ambiguous: '要確認',
};

/** 確度が高く、初期状態で「入金済にする」にチェックを入れる判定 */
export const AUTO_APPLY_KINDS: MatchKind[] = ['certain', 'group', 'amount'];

/** 振込手数料として差し引かれる可能性のある最大額 */
export const MAX_FEE_DIFF = 1000;

const SMALL_KANA: Record<string, string> = {
  ァ: 'ア', ィ: 'イ', ゥ: 'ウ', ェ: 'エ', ォ: 'オ', ッ: 'ツ', ャ: 'ヤ', ュ: 'ユ', ョ: 'ヨ', ヮ: 'ワ', ヵ: 'カ', ヶ: 'ケ',
};

/**
 * 名義の比較用に正規化する。
 * 半角カナ→全角、ひらがな→カタカナ、小書き文字→大文字、法人格（株式会社・カ) など）と記号・空白を除去。
 */
export function normalizeName(s: string): string {
  let t = s.normalize('NFKC').toUpperCase();
  t = t.replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60));
  t = t.replace(/株式会社|有限会社|合同会社|合資会社|合名会社|一般社団法人|一般財団法人|医療法人|\((株|有|同)\)/g, '');
  // 振込名義の法人格略語: カ)〇〇 / (カ)〇〇 / 〇〇(カ / 〇〇(カ)
  t = t.replace(/\(?(カ|ユ|ド|シヤ|ザイ|イ|ガク|メ|シ|ゴ|ノウ|フク)\)|\((カ|ユ|ド|シヤ|ザイ|イ|ガク|メ|シ|ゴ)$/g, '');
  t = t.replace(/[ァィゥェォッャュョヮヵヶ]/g, (c) => SMALL_KANA[c] ?? c);
  t = t.replace(/フリコミ|振込/g, '');
  return t.replace(/[^0-9A-Zァ-ヺ一-鿿]/g, '');
}

/** 摘要から振込名義らしき部分を取り出す（取引先マスタへの登録用） */
export function extractPayerName(description: string): string {
  return description
    .normalize('NFKC')
    .replace(/^\s*(フリコミ|振込|振込入金|ﾌﾘｺﾐ)\s*/u, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 取引先の名義（取引先名＋登録済みの振込名義）のどれかが摘要に含まれるか */
export function nameMatches(description: string, names: string[]): boolean {
  const d = normalizeName(description);
  if (!d) return false;
  return names.some((n) => {
    const k = normalizeName(n);
    return k.length >= 2 && d.includes(k);
  });
}

/** 取引先マスタの「振込名義」欄（改行・カンマ・読点区切り）を配列にする */
export function splitTransferNames(s: string | undefined): string[] {
  return (s ?? '')
    .split(/[\n,、]/)
    .map((v) => v.trim())
    .filter(Boolean);
}

const DAY = 86400000;
const toTime = (iso: string) => (iso ? Date.parse(`${iso}T00:00:00Z`) : NaN);

/**
 * 入金ごとの照合結果を返す（txs と同じ並び。出金・照合なしは null）。
 * 1つの請求書・1つの入金は最大1回しか使わない。
 */
export function reconcile(
  txs: BankTransaction[],
  invoices: InvoiceForMatch[],
  namesOf: (inv: InvoiceForMatch) => string[],
): (MatchProposal | null)[] {
  const deposits = txs.map((t, i) => ({ t, i })).filter((x) => x.t.deposit > 0);
  const invCountByTotal = new Map<number, number>();
  for (const inv of invoices) invCountByTotal.set(inv.total, (invCountByTotal.get(inv.total) ?? 0) + 1);
  const depCountByAmount = new Map<number, number>();
  for (const { t } of deposits) depCountByAmount.set(t.deposit, (depCountByAmount.get(t.deposit) ?? 0) + 1);

  interface Cand extends MatchProposal {
    txIndex: number;
    score: number;
    tie: number;
  }
  const cands: Cand[] = [];

  for (const { t, i } of deposits) {
    const depTime = toTime(t.date);
    const eligible = invoices.filter((inv) => {
      const issued = toTime(inv.issueDate);
      // 発行日より1か月以上前の入金は対象外
      return !(Number.isFinite(depTime) && Number.isFinite(issued) && depTime < issued - 31 * DAY);
    });
    const nameHit = new Map(eligible.map((inv) => [inv.id, nameMatches(t.description, namesOf(inv))]));
    const tieOf = (inv: InvoiceForMatch) => {
      const due = toTime(inv.dueDate);
      return Number.isFinite(due) && Number.isFinite(depTime) ? Math.abs(due - depTime) / DAY : 9999;
    };

    for (const inv of eligible) {
      const diff = inv.total - t.deposit;
      const nm = nameHit.get(inv.id) ?? false;
      const base = { txIndex: i, invoiceIds: [inv.id], nameMatched: nm, diff, tie: tieOf(inv) };
      if (diff === 0) {
        if (nm) cands.push({ ...base, kind: 'certain', score: 100 });
        else if (invCountByTotal.get(inv.total) === 1 && depCountByAmount.get(t.deposit) === 1)
          cands.push({ ...base, kind: 'amount', score: 70 });
        else cands.push({ ...base, kind: 'ambiguous', score: 40 });
      } else if (nm && diff > 0 && diff <= MAX_FEE_DIFF) {
        cands.push({ ...base, kind: 'fee', score: 60 });
      }
    }

    // 同じ取引先の複数請求書の合計（名義一致のものだけ、最大10件まで探索）
    const byClient = new Map<string, InvoiceForMatch[]>();
    for (const inv of eligible) {
      if (!nameHit.get(inv.id)) continue;
      const key = inv.clientId ?? `name:${inv.clientName}`;
      byClient.set(key, [...(byClient.get(key) ?? []), inv]);
    }
    for (const list of byClient.values()) {
      if (list.length < 2) continue;
      const items = list.slice(0, 10);
      let best: InvoiceForMatch[] | null = null;
      for (let mask = 1; mask < 1 << items.length; mask++) {
        if ((mask & (mask - 1)) === 0) continue; // 1件だけの組み合わせは上で判定済み
        const pick = items.filter((_, b) => mask & (1 << b));
        if (pick.reduce((s, v) => s + v.total, 0) === t.deposit && (!best || pick.length < best.length)) best = pick;
      }
      if (best) {
        cands.push({
          txIndex: i,
          invoiceIds: best.map((v) => v.id),
          kind: 'group',
          nameMatched: true,
          diff: 0,
          score: 90,
          tie: 0,
        });
      }
    }
  }

  cands.sort((a, b) => b.score - a.score || a.tie - b.tie);
  const result: (MatchProposal | null)[] = txs.map(() => null);
  const usedInvoices = new Set<string>();
  for (const c of cands) {
    if (result[c.txIndex]) continue;
    if (c.invoiceIds.some((id) => usedInvoices.has(id))) continue;
    c.invoiceIds.forEach((id) => usedInvoices.add(id));
    result[c.txIndex] = { invoiceIds: c.invoiceIds, kind: c.kind, nameMatched: c.nameMatched, diff: c.diff };
  }
  return result;
}
