import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import type { BankAccount, CompanySettings } from '../types';

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
  bankAccounts: [
    { id: 'acc1', label: '', text: '' },
    { id: 'acc2', label: '', text: '' },
  ],
  defaultBankAccountId: 'acc1',
  stampImage: '',
  defaultTaxMode: 'exclusive',
  defaultRounding: 'floor',
  defaultNotes: {
    quote: '',
    invoice: '恐れ入りますが、振込手数料は貴社にてご負担ください。',
    purchase_order: '',
    delivery_note: '',
    receipt: '',
  },
  invoiceDueDays: 0,
  quoteValidDays: 30,
};

export async function loadSettings(): Promise<CompanySettings> {
  const snap = await getDoc(ref());
  const data = (snap.exists() ? snap.data() : {}) as Partial<CompanySettings>;
  // 旧形式（振込先1件の bankInfo）からの移行。入力欄は最低2つ用意する
  let bankAccounts: BankAccount[] = data.bankAccounts?.length
    ? data.bankAccounts
    : [{ id: 'acc1', label: '', text: data.bankInfo ?? '' }];
  if (bankAccounts.length < 2) bankAccounts = [...bankAccounts, { id: 'acc2', label: '', text: '' }];
  // 旧形式の項目（振込先1件の bankInfo、番号プレフィックス prefixes）は使わない
  const { bankInfo: _legacy, prefixes: _prefixes, ...rest } = data as Partial<CompanySettings> & { prefixes?: unknown };
  void _legacy;
  void _prefixes;
  return {
    ...DEFAULT_SETTINGS,
    ...rest,
    bankAccounts,
    defaultBankAccountId:
      data.defaultBankAccountId && bankAccounts.some((a) => a.id === data.defaultBankAccountId)
        ? data.defaultBankAccountId
        : bankAccounts[0].id,
    defaultNotes: { ...DEFAULT_SETTINGS.defaultNotes, ...(data.defaultNotes ?? {}) },
  };
}

export async function saveSettings(s: CompanySettings): Promise<void> {
  // 旧形式の項目は保存しない
  const { bankInfo: _legacy, ...rest } = s;
  void _legacy;
  await setDoc(ref(), rest);
}
