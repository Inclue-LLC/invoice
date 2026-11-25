import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from '../firebase';
import { DOC_TYPES } from '../lib/docTypes';
import { todayIso } from '../lib/format';
import type { DocType, DocumentData, StoredDocument } from '../types';

const col = () => collection(db, 'documents');

/** 項目追加前に保存された帳票にも新しい項目の初期値を補う */
export function normalizeDocument(raw: Partial<DocumentData>): DocumentData {
  const d = raw as DocumentData;
  const total = d.totals?.total ?? 0;
  return {
    ...d,
    clientType: d.clientType ?? 'corporate',
    // 源泉徴収は対応する種別（発注書）のみ有効
    withholdingEnabled: Boolean(d.withholdingEnabled) && Boolean(DOC_TYPES[d.type]?.supportsWithholding),
    withholdingBaseMode: d.withholdingBaseMode ?? 'net',
    paidDate: d.paidDate ?? '',
    withholdingPaidDate: d.withholdingPaidDate ?? '',
    paymentMemo: d.paymentMemo ?? '',
    plRecordedDate: d.plRecordedDate ?? '',
    validUntil: d.validUntil ?? '',
    pl: d.type === 'invoice' ? (d.pl ?? null) : null,
    bankInfo: d.bankInfo ?? '',
    // 振込先の選択機能より前の請求書は、保存されている内容をそのまま使う
    bankAccountId: d.bankAccountId ?? (d.bankInfo ? 'custom' : ''),
    totals: {
      subtotal: d.totals?.subtotal ?? 0,
      tax: d.totals?.tax ?? 0,
      byRate: d.totals?.byRate ?? [],
      total,
      withholdingBase: d.totals?.withholdingBase ?? 0,
      withholdingTax: d.totals?.withholdingTax ?? 0,
      payable: d.totals?.payable ?? total,
    },
  };
}

/** 帳票番号の書式: 発行日（YYYYMMDD）＋その日の連番（例: 20261125-1） */
export function formatDocumentNumber(issueDate: string, seq: number): string {
  return `${issueDate.replace(/-/g, '')}-${seq}`;
}

/** 「20261125-3」形式の番号を発行日と連番に分ける（形式が違えば null） */
export function parseDocumentNumber(number: string): { date: string; seq: number } | null {
  const m = /^(\d{4})(\d{2})(\d{2})-(\d+)$/.exec(number.trim());
  return m ? { date: `${m[1]}-${m[2]}-${m[3]}`, seq: Number(m[4]) } : null;
}

const validDate = (issueDate: string) => (/^\d{4}-\d{2}-\d{2}$/.test(issueDate) ? issueDate : todayIso());
const counterRef = (type: DocType, date: string) => doc(db, 'counters', `${type}_${date.replace(/-/g, '')}`);

/** 次に付く番号を調べる（番号は確保しない。作成画面に最初から表示する用） */
export async function peekNextDocumentNumber(type: DocType, issueDate: string): Promise<string> {
  const date = validDate(issueDate);
  const snap = await getDoc(counterRef(type, date));
  return formatDocumentNumber(date, (snap.exists() ? (snap.data().seq as number) : 0) + 1);
}

/**
 * 番号を1つ確保する（例: 20261125-1）。発行日ごと・帳票の種類ごとに 1 から連番。
 * Firestore のトランザクションで払い出すため、同時発行でも重複しない。
 */
export async function nextDocumentNumber(type: DocType, issueDate: string): Promise<string> {
  const date = validDate(issueDate);
  const ref = counterRef(type, date);
  const seq = await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const next = (snap.exists() ? (snap.data().seq as number) : 0) + 1;
    tx.set(ref, { seq: next });
    return next;
  });
  return formatDocumentNumber(date, seq);
}

/** 同じ種類の帳票で、その番号がすでに使われているか（excludeId の帳票は除く） */
export async function isDocumentNumberTaken(type: DocType, number: string, excludeId?: string): Promise<boolean> {
  const snap = await getDocs(query(col(), where('type', '==', type), where('number', '==', number.trim())));
  return snap.docs.some((d) => d.id !== excludeId);
}

/** 新規保存用に番号を確保する。万一使われていれば（手入力された番号など）次の番号にする */
export async function allocateDocumentNumber(type: DocType, issueDate: string): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const number = await nextDocumentNumber(type, issueDate);
    if (!(await isDocumentNumberTaken(type, number))) return number;
  }
  throw new Error('番号を確保できませんでした。番号を入力して保存してください。');
}

/** 「20261125-5」のように手入力された番号のあとから自動の連番が続くよう、カウンタを進める */
export async function syncCounterWithNumber(type: DocType, number: string): Promise<void> {
  const parsed = parseDocumentNumber(number);
  if (!parsed) return;
  const ref = counterRef(type, parsed.date);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const current = snap.exists() ? (snap.data().seq as number) : 0;
    if (parsed.seq > current) tx.set(ref, { seq: parsed.seq });
  });
}

/** 種別ごとの一覧（発行日の新しい順）。単一項目の条件のみなので複合インデックスは不要 */
export async function listDocumentsByType(type: DocType): Promise<StoredDocument[]> {
  const snap = await getDocs(query(col(), where('type', '==', type)));
  return snap.docs
    .map((d) => ({ ...normalizeDocument(d.data() as DocumentData), id: d.id }))
    .sort((a, b) => b.issueDate.localeCompare(a.issueDate) || b.number.localeCompare(a.number, 'ja', { numeric: true }));
}

export async function getDocument(id: string): Promise<StoredDocument | null> {
  const snap = await getDoc(doc(db, 'documents', id));
  return snap.exists() ? { ...normalizeDocument(snap.data() as DocumentData), id: snap.id } : null;
}

export async function createDocument(data: DocumentData): Promise<string> {
  const ref = doc(col());
  await setDoc(ref, { ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  return ref.id;
}

export async function updateDocument(id: string, data: DocumentData): Promise<void> {
  // createdAt / createdBy は作成時の値を維持する
  const { createdAt, ...rest } = data;
  await updateDoc(doc(db, 'documents', id), { ...rest, updatedAt: serverTimestamp() });
}

export type DocumentPatch = Partial<Pick<DocumentData, 'status' | 'paidDate' | 'withholdingPaidDate' | 'paymentMemo' | 'plRecordedDate'>>;

/** 状態・入金日・支払日など一部の項目だけを更新する */
export async function patchDocument(id: string, patch: DocumentPatch, email: string): Promise<void> {
  await updateDoc(doc(db, 'documents', id), { ...patch, updatedBy: email, updatedAt: serverTimestamp() });
}

export async function deleteDocument(id: string): Promise<void> {
  await deleteDoc(doc(db, 'documents', id));
}
