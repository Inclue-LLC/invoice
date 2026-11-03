import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { DOC_TYPES } from '../lib/docTypes';
import type { CompanySettings } from '../types';

const ref = () => doc(db, 'settings', 'company');

export const DEFAULT_SETTINGS: CompanySettings = {
  name: '',
  postalCode: '',
  address: '',
  tel: '',
  fax: '',
  email: '',
  representative: '',
  registrationNumber: '',
  bankInfo: '',
  stampImage: '',
  defaultTaxMode: 'exclusive',
  defaultRounding: 'floor',
  prefixes: {
    invoice: DOC_TYPES.invoice.defaultPrefix,
    purchase_order: DOC_TYPES.purchase_order.defaultPrefix,
    delivery_note: DOC_TYPES.delivery_note.defaultPrefix,
    receipt: DOC_TYPES.receipt.defaultPrefix,
  },
  defaultNotes: {
    invoice: '恐れ入りますが、振込手数料は貴社にてご負担ください。',
    purchase_order: '',
    delivery_note: '',
    receipt: '',
  },
  invoiceDueDays: 0,
};

export async function loadSettings(): Promise<CompanySettings> {
  const snap = await getDoc(ref());
  const data = (snap.exists() ? snap.data() : {}) as Partial<CompanySettings>;
  return {
    ...DEFAULT_SETTINGS,
    ...data,
    prefixes: { ...DEFAULT_SETTINGS.prefixes, ...(data.prefixes ?? {}) },
    defaultNotes: { ...DEFAULT_SETTINGS.defaultNotes, ...(data.defaultNotes ?? {}) },
  };
}

export async function saveSettings(s: CompanySettings): Promise<void> {
  await setDoc(ref(), s);
}
