import { describe, expect, it } from 'vitest';
import { blankPl, cleanPl, isReflectedToPl, plMonth, plRecordedDateOnSave, validatePl } from './pl';

describe('pl', () => {
  it('uses the due-date month, falling back to the issue date', () => {
    expect(plMonth({ dueDate: '2026-12-31', issueDate: '2026-11-20' })).toBe('2026-12');
    expect(plMonth({ dueDate: '', issueDate: '2026-11-20' })).toBe('2026-11');
  });

  it('reflects only issued or paid invoices that have a PL link', () => {
    const pl = blankPl();
    expect(isReflectedToPl({ type: 'invoice', status: 'issued', pl })).toBe(true);
    expect(isReflectedToPl({ type: 'invoice', status: 'paid', pl })).toBe(true);
    expect(isReflectedToPl({ type: 'invoice', status: 'draft', pl })).toBe(false);
    expect(isReflectedToPl({ type: 'invoice', status: 'cancelled', pl })).toBe(false);
    expect(isReflectedToPl({ type: 'invoice', status: 'issued', pl: null })).toBe(false);
    expect(isReflectedToPl({ type: 'receipt', status: 'issued', pl })).toBe(false);
  });

  it('marks reflected invoices as recorded in PL automatically', () => {
    const pl = blankPl();
    expect(plRecordedDateOnSave({ type: 'invoice', status: 'issued', pl, plRecordedDate: '' }, '2026-11-18')).toBe('2026-11-18');
    expect(plRecordedDateOnSave({ type: 'invoice', status: 'issued', pl, plRecordedDate: '2026-11-01' }, '2026-11-18')).toBe('2026-11-01');
    expect(plRecordedDateOnSave({ type: 'invoice', status: 'issued', pl: null, plRecordedDate: '' }, '2026-11-18')).toBe('');
  });

  it('always books invoices to Japan', () => {
    expect(cleanPl({ ...blankPl(), country: 'CN', character: 'ふにゅ' }).country).toBe('JP');
  });

  it('validates required fields per kind and clears unrelated ones', () => {
    expect(validatePl({ ...blankPl(), character: '' })).toMatch(/キャラクター/);
    expect(validatePl({ ...blankPl(), character: 'ふにゅ' })).toBeNull();
    expect(validatePl({ ...blankPl(), kind: 'offline', character: 'ふにゅ', type: 'POP UP', venue: '' })).toMatch(/お店/);
    expect(validatePl({ ...blankPl(), kind: 'other', content: '' })).toMatch(/案件内容/);
    expect(cleanPl({ ...blankPl('件名'), kind: 'other', character: 'x', venue: 'y' })).toEqual({
      country: 'JP', kind: 'other', character: '', type: '', venue: '', content: '件名',
    });
  });
});
