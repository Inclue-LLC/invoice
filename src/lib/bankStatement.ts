/**
 * 銀行の入出金明細（CSV / TSV）の読み込み。
 * 銀行ごとに列名・文字コード・日付形式が異なるため、ヘッダー行と列を自動判定する。
 */

export interface BankTransaction {
  /** 元ファイルの行番号（0始まり） */
  row: number;
  /** YYYY-MM-DD */
  date: string;
  /** 摘要・振込依頼人名など */
  description: string;
  deposit: number;
  withdrawal: number;
}

export interface ColumnMapping {
  /** ヘッダー行の位置（-1 はヘッダーなし） */
  headerRow: number;
  date: number;
  /** 摘要として使う列（複数可） */
  description: number[];
  /** 入金額の列（-1 は無し） */
  deposit: number;
  /** 出金額の列（-1 は無し） */
  withdrawal: number;
  /** 入出金が1列にまとまった「金額」列（-1 は無し） */
  amount: number;
  /** 「入出金区分」列（-1 は無し） */
  kind: number;
}

/** UTF-8 として読めなければ Shift_JIS（多くの銀行の CSV）として読む */
export function decodeFile(buf: ArrayBuffer): string {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    text = new TextDecoder('shift_jis').decode(buf);
  }
  return text.replace(/^﻿/, '');
}

export function parseCsv(text: string): string[][] {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const delim = (firstLine.match(/\t/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? '\t' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuote = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuote) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuote = false;
      } else field += c;
    } else if (c === '"' && field.trim() === '') {
      inQuote = true;
      field = '';
    } else if (c === delim) {
      row.push(field.trim());
      field = '';
    } else if (c === '\n') {
      row.push(field.trim());
      rows.push(row);
      row = [];
      field = '';
    } else if (c !== '\r') field += c;
  }
  if (field !== '' || row.length) {
    row.push(field.trim());
    rows.push(row);
  }
  return rows.filter((r) => r.some((v) => v !== ''));
}

const norm = (s: string) => s.normalize('NFKC').replace(/\s/g, '');

const RE = {
  date: /日付|取引日|年月日|入出金日|勘定日|日時|^date$/i,
  kind: /区分|種別|^入出金$/,
  deposit: /入金|預り|預かり|預入|受入|^credit|deposit/i,
  withdrawal: /出金|引出|引落|払出|支払|^debit|withdraw/i,
  amount: /^金額|取引金額|^amount$/i,
  description: /摘要|内容|依頼人|名義|取引名|備考|メモ|相手|振込人|^description$/i,
  ignore: /残高|balance/i,
};

/** ヘッダー行と各列を自動判定する。判定できなければ null */
export function detectMapping(rows: string[][]): ColumnMapping | null {
  for (let r = 0; r < Math.min(rows.length, 30); r++) {
    const cells = rows[r].map(norm);
    const used = new Set<number>();
    const find = (re: RegExp, extra?: (c: string) => boolean) => {
      const i = cells.findIndex((c, idx) => !used.has(idx) && c !== '' && re.test(c) && !RE.ignore.test(c) && (!extra || extra(c)));
      if (i >= 0) used.add(i);
      return i;
    };
    const date = find(RE.date);
    if (date < 0) continue;
    const kind = find(RE.kind);
    const deposit = find(RE.deposit, (c) => !/出金/.test(c));
    const withdrawal = find(RE.withdrawal);
    const amount = deposit < 0 ? find(RE.amount) : -1;
    if (deposit < 0 && amount < 0) continue;
    const description: number[] = [];
    cells.forEach((c, idx) => {
      if (!used.has(idx) && c !== '' && RE.description.test(c)) description.push(idx);
    });
    return { headerRow: r, date, description, deposit, withdrawal, amount, kind };
  }
  return null;
}

/** 金額の文字列を数値にする（¥ , 円 全角数字 △▲（）マイナスに対応） */
export function parseAmount(s: string | undefined): number {
  if (!s) return 0;
  let t = s.normalize('NFKC').replace(/[¥\\,円\s+]/g, '');
  let negative = false;
  if (/^[△▲-]/.test(t)) {
    negative = true;
    t = t.replace(/^[△▲-]/, '');
  }
  if (/^\(.*\)$/.test(t)) {
    negative = true;
    t = t.slice(1, -1);
  }
  const n = Number(t);
  if (!Number.isFinite(n)) return 0;
  return negative ? -n : n;
}

const pad = (n: number) => String(n).padStart(2, '0');

function valid(y: number, m: number, d: number): string {
  if (y < 1900 || m < 1 || m > 12 || d < 1 || d > 31) return '';
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** 日付を YYYY-MM-DD にする。年が無い形式は fallbackYear を使う */
export function parseDate(s: string | undefined, fallbackYear = new Date().getFullYear()): string {
  if (!s) return '';
  const t = s.normalize('NFKC').trim();
  let m = /(令和|平成|R|H)\s*(\d{1,2}|元)\s*[年./-]\s*(\d{1,2})\s*[月./-]\s*(\d{1,2})/i.exec(t);
  if (m) {
    const n = m[2] === '元' ? 1 : Number(m[2]);
    const base = /令和|R/i.test(m[1]) ? 2018 : 1988;
    return valid(base + n, Number(m[3]), Number(m[4]));
  }
  m = /^(\d{4})\s*[年./-]\s*(\d{1,2})\s*[月./-]\s*(\d{1,2})/.exec(t);
  if (m) return valid(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{4})(\d{2})(\d{2})(?!\d)/.exec(t);
  if (m) return valid(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{1,2})\s*[月./-]\s*(\d{1,2})日?$/.exec(t);
  if (m) return valid(fallbackYear, Number(m[1]), Number(m[2]));
  return '';
}

export function extractTransactions(rows: string[][], map: ColumnMapping, fallbackYear?: number): BankTransaction[] {
  const out: BankTransaction[] = [];
  for (let r = map.headerRow + 1; r < rows.length; r++) {
    const row = rows[r];
    const date = parseDate(row[map.date], fallbackYear);
    if (!date) continue;
    let deposit = 0;
    let withdrawal = 0;
    if (map.deposit >= 0) {
      deposit = Math.max(0, parseAmount(row[map.deposit]));
      if (map.withdrawal >= 0) withdrawal = Math.abs(parseAmount(row[map.withdrawal]));
    } else if (map.amount >= 0) {
      const v = parseAmount(row[map.amount]);
      const kind = map.kind >= 0 ? (row[map.kind] ?? '').normalize('NFKC') : '';
      if (kind) {
        if (/出|払|引/.test(kind)) withdrawal = Math.abs(v);
        else deposit = Math.abs(v);
      } else if (v > 0) deposit = v;
      else withdrawal = -v;
    }
    const description = map.description
      .map((i) => row[i] ?? '')
      .filter(Boolean)
      .join(' ');
    out.push({ row: r, date, description, deposit, withdrawal });
  }
  return out;
}
