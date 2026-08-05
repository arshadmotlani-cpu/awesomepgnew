/** Normalize Indian / E.164-ish mobile for Workforce login. */
export function normalizeMobile(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`;
  if (digits.length >= 10 && digits.length <= 15) return `+${digits}`;
  return null;
}

export function mobilesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const na = normalizeMobile(a);
  const nb = normalizeMobile(b);
  return Boolean(na && nb && na === nb);
}
