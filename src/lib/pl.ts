// PL管理（売上PL管理アプリ）との連携。
// 請求書に PL の区分を付けておくと、PL管理アプリが読み取って売上に反映する
// （税込合計・お支払期限の月・下書きと取消は除く）。

import type { DocumentData, PlKind, PlLink } from '../types';

export const PL_APP_URL = 'https://inclue-sales.web.app';

export const PL_KIND_LABELS: Record<PlKind, string> = { license: 'ライセンス', offline: 'オフライン', other: 'その他' };
/** 区分ごとの種別の選択肢（PL管理アプリと同じ値） */
export const PL_TYPES: Record<PlKind, string[]> = {
  license: ['MG', 'ロイヤリティ'],
  offline: ['POP UP', '委託販売'],
  other: [],
};
/** キャラクターの候補（候補にない名前も入力できる） */
export const PL_CHARACTERS = ['スタジオハヌル', 'Lovely MongMong', 'ふにゅ'];

export function blankPl(subject = ''): PlLink {
  return { country: 'JP', kind: 'license', character: '', type: PL_TYPES.license[0], venue: '', content: subject };
}

/** PL に計上する月（お支払期限の月。未入力なら発行日の月） */
export function plMonth(d: Pick<DocumentData, 'dueDate' | 'issueDate'>): string {
  return (d.dueDate || d.issueDate).slice(0, 7);
}

/** PL に反映される請求書か（下書き・取消は反映しない） */
export function isReflectedToPl(d: Pick<DocumentData, 'type' | 'status' | 'pl'>): boolean {
  return d.type === 'invoice' && Boolean(d.pl) && (d.status === 'issued' || d.status === 'paid');
}

/** 区分の入力チェック。問題があればメッセージを返す */
export function validatePl(pl: PlLink): string | null {
  if (pl.kind !== 'other' && !pl.character.trim()) return 'PL管理への反映：キャラクターを入力してください';
  if (pl.kind !== 'other' && !PL_TYPES[pl.kind].includes(pl.type)) return 'PL管理への反映：種別を選択してください';
  if (pl.kind === 'offline' && !pl.venue.trim()) return 'PL管理への反映：お店・イベント名を入力してください';
  if (pl.kind === 'other' && !pl.content.trim()) return 'PL管理への反映：案件内容を入力してください';
  return null;
}

/** 保存用に整える（区分に関係ない項目は空にする） */
export function cleanPl(pl: PlLink): PlLink {
  return {
    country: 'JP', // 請求書ツールの売上はすべて日本

    kind: pl.kind,
    character: pl.kind === 'other' ? '' : pl.character.trim(),
    type: pl.kind === 'other' ? '' : pl.type,
    venue: pl.kind === 'offline' ? pl.venue.trim() : '',
    content: pl.kind === 'other' ? pl.content.trim() : '',
  };
}

/**
 * 保存時の「PL記載済」日付。PL に反映される請求書は自動で記載済にする。
 * 反映しない請求書は、手動で付けた記載済をそのまま残す。
 */
export function plRecordedDateOnSave(d: Pick<DocumentData, 'type' | 'status' | 'pl' | 'plRecordedDate'>, today: string): string {
  if (isReflectedToPl(d)) return d.plRecordedDate || today;
  return d.plRecordedDate;
}
