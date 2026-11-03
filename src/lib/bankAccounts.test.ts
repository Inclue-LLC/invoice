import { describe, expect, it } from 'vitest';
import { defaultBankAccount, usableBankAccounts } from './bankAccounts';

const accounts = [
  { id: 'a', label: 'A銀行', text: 'A銀行 本店 普通 111' },
  { id: 'b', label: 'B銀行', text: '' },
  { id: 'c', label: 'C銀行', text: 'C銀行 支店 普通 333' },
];

describe('振込先', () => {
  it('未入力の振込先は選択肢に出さない', () => {
    expect(usableBankAccounts({ bankAccounts: accounts }).map((a) => a.id)).toEqual(['a', 'c']);
  });
  it('既定の振込先', () => {
    expect(defaultBankAccount({ bankAccounts: accounts, defaultBankAccountId: 'c' })?.id).toBe('c');
  });
  it('既定が未入力・不明なら入力済みの最初', () => {
    expect(defaultBankAccount({ bankAccounts: accounts, defaultBankAccountId: 'b' })?.id).toBe('a');
    expect(defaultBankAccount({ bankAccounts: accounts, defaultBankAccountId: 'zzz' })?.id).toBe('a');
  });
  it('1件も無ければ null', () => {
    expect(defaultBankAccount({ bankAccounts: [], defaultBankAccountId: '' })).toBeNull();
  });
});
