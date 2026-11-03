import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { db } from '../firebase';
import type { DocStatus, DocType, DocumentData, StoredDocument } from '../types';

const col = () => collection(db, 'documents');

/**
 * 帳票番号を採番する（例: INV-2026-0001）。
 * Firestore のトランザクションで年・種別ごとの連番を払い出すため、同時発行でも重複しない。
 */
export async function nextDocumentNumber(type: DocType, prefix: string, issueDate: string): Promise<string> {
  const year = issueDate.slice(0, 4) || String(new Date().getFullYear());
  const counterRef = doc(db, 'counters', `${type}_${year}`);
  const seq = await runTransaction(db, async (tx) => {
    const snap = await tx.get(counterRef);
    const next = (snap.exists() ? (snap.data().seq as number) : 0) + 1;
    tx.set(counterRef, { seq: next });
    return next;
  });
  const head = prefix ? `${prefix}-` : '';
  return `${head}${year}-${String(seq).padStart(4, '0')}`;
}

export async function listDocuments(max = 1000): Promise<StoredDocument[]> {
  const snap = await getDocs(query(col(), orderBy('updatedAt', 'desc'), limit(max)));
  return snap.docs.map((d) => ({ ...(d.data() as DocumentData), id: d.id }));
}

export async function getDocument(id: string): Promise<StoredDocument | null> {
  const snap = await getDoc(doc(db, 'documents', id));
  return snap.exists() ? { ...(snap.data() as DocumentData), id: snap.id } : null;
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

export async function updateStatus(id: string, status: DocStatus, email: string): Promise<void> {
  await updateDoc(doc(db, 'documents', id), { status, updatedBy: email, updatedAt: serverTimestamp() });
}

export async function deleteDocument(id: string): Promise<void> {
  await deleteDoc(doc(db, 'documents', id));
}
