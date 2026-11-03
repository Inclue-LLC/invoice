import { describe, expect, it } from 'vitest';
import { decodeFile, detectMapping, extractTransactions, parseAmount, parseCsv, parseDate } from './bankStatement';
import { normalizeName, reconcile, type InvoiceForMatch } from './reconcile';

describe('parseDate', () => {
  it('各種形式', () => {
    expect(parseDate('2026/11/03')).toBe('2026-11-03');
    expect(parseDate('2026-1-5')).toBe('2026-01-05');
    expect(parseDate('20261103')).toBe('2026-11-03');
    expect(parseDate('2026年11月3日')).toBe('2026-11-03');
    expect(parseDate('R8.11.3')).toBe('2026-11-03');
    expect(parseDate('令和8年11月3日')).toBe('2026-11-03');
    expect(parseDate('11/03', 2026)).toBe('2026-11-03');
    expect(parseDate('２０２６／１１／０３')).toBe('2026-11-03');
    expect(parseDate('日付')).toBe('');
  });
});

describe('parseAmount', () => {
  it('各種形式', () => {
    expect(parseAmount('110,000')).toBe(110000);
    expect(parseAmount('¥1,234円')).toBe(1234);
    expect(parseAmount('１２３')).toBe(123);
    expect(parseAmount('△500')).toBe(-500);
    expect(parseAmount('-500')).toBe(-500);
    expect(parseAmount('')).toBe(0);
  });
});

describe('CSV 読み込み', () => {
  it('Shift_JIS を判定して読める', () => {
    // "入金" を Shift_JIS で表したバイト列
    const buf = new Uint8Array([0x93, 0xfc, 0x8b, 0xe0]).buffer;
    expect(decodeFile(buf)).toBe('入金');
  });

  it('入金・出金が別列の明細', () => {
    const csv = [
      '"普通預金 入出金明細"',
      '"日付","摘要","お支払金額","お預り金額","差引残高"',
      '"2026/11/25","ﾌﾘｺﾐ ｶ)ｻﾝﾌﾟﾙ","","110,000","1,110,000"',
      '"2026/11/26","ﾃﾞﾝｷﾀﾞｲ","5,000","","1,105,000"',
    ].join('\r\n');
    const rows = parseCsv(csv);
    const map = detectMapping(rows)!;
    expect(map.headerRow).toBe(1);
    const tx = extractTransactions(rows, map);
    expect(tx).toEqual([
      { row: 2, date: '2026-11-25', description: 'ﾌﾘｺﾐ ｶ)ｻﾝﾌﾟﾙ', deposit: 110000, withdrawal: 0 },
      { row: 3, date: '2026-11-26', description: 'ﾃﾞﾝｷﾀﾞｲ', deposit: 0, withdrawal: 5000 },
    ]);
  });

  it('金額1列＋入出金区分の明細（タブ区切り）', () => {
    const tsv = ['取引日\t入出金区分\t金額\t内容', '2026-11-30\t入金\t55000\tフリコミ ヤマダ タロウ', '2026-11-30\t出金\t1000\t手数料'].join('\n');
    const rows = parseCsv(tsv);
    const tx = extractTransactions(rows, detectMapping(rows)!);
    expect(tx.map((t) => [t.deposit, t.withdrawal])).toEqual([
      [55000, 0],
      [0, 1000],
    ]);
  });

  it('引用符内のカンマ・改行', () => {
    expect(parseCsv('a,"b,c","d\ne"\n1,2,3')).toEqual([
      ['a', 'b,c', 'd\ne'],
      ['1', '2', '3'],
    ]);
  });
});

describe('normalizeName', () => {
  it('半角カナ・法人格略語・小書き文字', () => {
    expect(normalizeName('ﾌﾘｺﾐ ｶ)ｻﾝﾌﾟﾙ')).toBe('サンプル');
    expect(normalizeName('株式会社サンプル')).toBe('サンプル');
    expect(normalizeName('ｻﾝﾌﾟﾙ(ｶ')).toBe('サンプル');
    expect(normalizeName('ｼﾞﾔﾊﾟﾝ')).toBe(normalizeName('ジャパン'));
    expect(normalizeName('やまだ たろう')).toBe('ヤマダタロウ');
  });
});

describe('reconcile', () => {
  const inv = (id: string, total: number, clientId: string, clientName: string, issueDate = '2026-11-01'): InvoiceForMatch => ({
    id,
    number: id,
    clientId,
    clientName,
    total,
    issueDate,
    dueDate: '2026-11-30',
  });
  const tx = (deposit: number, description: string, date = '2026-11-25') => ({ row: 0, date, description, deposit, withdrawal: 0 });
  const names: Record<string, string[]> = { c1: ['ｶ)ｻﾝﾌﾟﾙ'], c2: ['ヤマダ タロウ'], c3: [] };
  const namesOf = (i: InvoiceForMatch) => [i.clientName, ...(names[i.clientId ?? ''] ?? [])];

  it('金額と名義が一致', () => {
    const r = reconcile([tx(110000, 'ﾌﾘｺﾐ ｶ)ｻﾝﾌﾟﾙ')], [inv('A', 110000, 'c1', '株式会社サンプル'), inv('B', 110000, 'c3', '別会社')], namesOf);
    expect(r[0]).toMatchObject({ invoiceIds: ['A'], kind: 'certain' });
  });

  it('金額だけ一致（候補が1件）', () => {
    const r = reconcile([tx(33000, 'ﾌﾘｺﾐ ﾌﾒｲ')], [inv('A', 33000, 'c3', '別会社'), inv('B', 50000, 'c3', '別会社')], namesOf);
    expect(r[0]).toMatchObject({ invoiceIds: ['A'], kind: 'amount' });
  });

  it('同額の候補が複数なら要確認（期限が近い方を候補に）', () => {
    const a = { ...inv('A', 33000, 'c3', 'X'), dueDate: '2026-12-31' };
    const b = { ...inv('B', 33000, 'c3', 'Y'), dueDate: '2026-11-30' };
    const r = reconcile([tx(33000, 'ﾌﾒｲ')], [a, b], namesOf);
    expect(r[0]).toMatchObject({ invoiceIds: ['B'], kind: 'ambiguous' });
  });

  it('振込手数料が差し引かれた入金', () => {
    const r = reconcile([tx(109340, 'ﾔﾏﾀﾞ ﾀﾛｳ')], [inv('A', 110000, 'c2', '山田 太郎')], namesOf);
    expect(r[0]).toMatchObject({ invoiceIds: ['A'], kind: 'fee', diff: 660 });
  });

  it('同じ取引先の複数の請求書をまとめて入金', () => {
    const r = reconcile(
      [tx(165000, 'ｶ)ｻﾝﾌﾟﾙ')],
      [inv('A', 110000, 'c1', '株式会社サンプル'), inv('B', 55000, 'c1', '株式会社サンプル'), inv('C', 22000, 'c1', '株式会社サンプル')],
      namesOf,
    );
    expect(r[0]).toMatchObject({ kind: 'group' });
    expect([...r[0]!.invoiceIds].sort()).toEqual(['A', 'B']);
  });

  it('1つの請求書は1回だけ使う／出金や不一致は null', () => {
    const r = reconcile(
      [tx(110000, 'ｶ)ｻﾝﾌﾟﾙ'), tx(110000, 'ｶ)ｻﾝﾌﾟﾙ', '2026-11-26'), { ...tx(0, 'x'), withdrawal: 500 }, tx(1, 'ﾌﾒｲ')],
      [inv('A', 110000, 'c1', '株式会社サンプル')],
      namesOf,
    );
    // 同額・同名義の入金が2件あっても、請求書に割り当てるのは1件だけ
    expect([r[0], r[1]].filter(Boolean)).toHaveLength(1);
    expect((r[0] ?? r[1])?.invoiceIds).toEqual(['A']);
    expect(r[2]).toBeNull();
    expect(r[3]).toBeNull();
  });

  it('発行日より1か月以上前の入金は対象外', () => {
    const r = reconcile([tx(110000, 'ｶ)ｻﾝﾌﾟﾙ', '2026-09-01')], [inv('A', 110000, 'c1', '株式会社サンプル', '2026-11-01')], namesOf);
    expect(r[0]).toBeNull();
  });
});
