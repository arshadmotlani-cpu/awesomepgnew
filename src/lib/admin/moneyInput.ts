/** Strip non-digits — rupee amounts (optional decimals for rates/charges). */
export function sanitizeRupeeInput(raw: string, opts?: { allowDecimal?: boolean }): string {
  if (!opts?.allowDecimal) {
    return raw.replace(/[^\d]/g, '');
  }

  const cleaned = raw.replace(/[^\d.]/g, '');
  const dotIndex = cleaned.indexOf('.');
  if (dotIndex === -1) return cleaned;

  const whole = cleaned.slice(0, dotIndex);
  const fraction = cleaned.slice(dotIndex + 1).replace(/\./g, '').slice(0, 2);
  if (cleaned.endsWith('.') && !fraction) {
    return `${whole}.`;
  }
  return fraction ? `${whole}.${fraction}` : whole;
}

export function rupeesStringFromPaise(paise: number): string {
  return Math.max(0, Math.round(paise / 100)).toString();
}

export function paiseFromRupeeInput(value: string): number {
  const cleaned = sanitizeRupeeInput(value);
  if (!cleaned) return 0;
  const n = Number.parseInt(cleaned, 10);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n * 100;
}
