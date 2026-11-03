import { addDoc, collection, deleteDoc, doc, getDocs, orderBy, query, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import type { Client } from '../types';

const col = () => collection(db, 'clients');

export type ClientInput = Omit<Client, 'id'>;

export const EMPTY_CLIENT: ClientInput = {
  type: 'corporate',
  name: '',
  honorific: '御中',
  postalCode: '',
  address: '',
  department: '',
  contactName: '',
  tel: '',
  email: '',
  memo: '',
  withholding: false,
  transferNames: '',
};

export async function listClients(): Promise<Client[]> {
  const snap = await getDocs(query(col(), orderBy('name')));
  return snap.docs.map((d) => ({ ...EMPTY_CLIENT, ...(d.data() as ClientInput), id: d.id }));
}

export async function createClient(c: ClientInput): Promise<string> {
  const ref = await addDoc(col(), c);
  return ref.id;
}

export async function updateClient(id: string, c: ClientInput): Promise<void> {
  await updateDoc(doc(db, 'clients', id), { ...c });
}

export async function deleteClient(id: string): Promise<void> {
  await deleteDoc(doc(db, 'clients', id));
}
