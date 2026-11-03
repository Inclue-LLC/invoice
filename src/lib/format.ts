const yen = new Intl.NumberFormat('ja-JP');

export function formatYen(n: number): string {
  return `¥${yen.format(n)}`;
}

export function formatNumber(n: number): string {
  return yen.format(n);
}

/** YYYY-MM-DD → 2026年11月3日 */
export function formatDateJa(iso: string): string {
  if (!iso) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return `${Number(m[1])}年${Number(m[2])}月${Number(m[3])}日`;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayIso(): string {
  return toIsoDate(new Date());
}

/** 支払期限を計算する。days = 0 のときは翌月末。 */
export function calcDueDate(issueIso: string, days: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(issueIso);
  if (!m) return '';
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  if (!days) {
    // 翌月末 = 翌々月の0日
    return toIsoDate(new Date(y, mo + 2, 0));
  }
  return toIsoDate(new Date(y, mo, d + days));
}

/** 登録番号の形式チェック（T + 13桁） */
export function isValidRegistrationNumber(v: string): boolean {
  return /^T\d{13}$/.test(v);
}
