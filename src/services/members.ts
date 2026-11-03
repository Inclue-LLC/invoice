import { collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../firebase';

/** 社外の Google アカウントを招待するための許可リスト（ドキュメントID = メールアドレス小文字） */
export interface Member {
  email: string;
  name: string;
  memo: string;
  addedBy: string;
  addedAt?: unknown;
}

export const normalizeEmail = (e: string) => e.trim().toLowerCase();

export async function isInvited(email: string): Promise<boolean> {
  try {
    const snap = await getDoc(doc(db, 'members', normalizeEmail(email)));
    return snap.exists();
  } catch {
    return false;
  }
}

export async function listMembers(): Promise<Member[]> {
  const snap = await getDocs(collection(db, 'members'));
  return snap.docs
    .map((d) => ({ name: '', memo: '', addedBy: '', ...(d.data() as Partial<Member>), email: d.id }))
    .sort((a, b) => a.email.localeCompare(b.email));
}

export async function addMember(m: Omit<Member, 'addedAt'>): Promise<void> {
  const email = normalizeEmail(m.email);
  await setDoc(doc(db, 'members', email), { ...m, email, addedAt: serverTimestamp() });
}

export async function removeMember(email: string): Promise<void> {
  await deleteDoc(doc(db, 'members', normalizeEmail(email)));
}
