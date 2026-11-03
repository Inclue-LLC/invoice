import type { BankAccount, CompanySettings } from '../types';

/** 振込先は最大この数まで登録できる */
export const MAX_BANK_ACCOUNTS = 5;

/** 請求書に「保存済みの振込先」をそのまま使っていることを表す ID（自社設定に無い振込先） */
export const CUSTOM_BANK_ACCOUNT_ID = 'custom';

export const newBankAccountId = () => `acc_${Math.random().toString(36).slice(2, 8)}`;

/** 内容が入力されている振込先 */
export function usableBankAccounts(s: Pick<CompanySettings, 'bankAccounts'>): BankAccount[] {
  return (s.bankAccounts ?? []).filter((a) => a.text.trim() !== '');
}

/** 既定の振込先（既定が未入力なら、入力済みの最初の振込先） */
export function defaultBankAccount(s: Pick<CompanySettings, 'bankAccounts' | 'defaultBankAccountId'>): BankAccount | null {
  const usable = usableBankAccounts(s);
  return usable.find((a) => a.id === s.defaultBankAccountId) ?? usable[0] ?? null;
}

/** 表示名（名称が空なら「振込先1」など） */
export function bankAccountLabel(a: BankAccount, index: number): string {
  return a.label.trim() || `振込先${index + 1}`;
}
