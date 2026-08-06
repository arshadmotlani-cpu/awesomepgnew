const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const UPI_RE = /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z][a-zA-Z0-9.-]{0,63}$/;

export function validateAccountNumber(raw: string): string | null {
  const digits = raw.replace(/\s/g, '');
  if (!digits) return null;
  if (!/^\d{9,18}$/.test(digits)) {
    throw new Error('Account number must be 9–18 digits.');
  }
  return digits;
}

export function validateIfscCode(raw: string): string | null {
  const code = raw.trim().toUpperCase();
  if (!code) return null;
  if (!IFSC_RE.test(code)) {
    throw new Error('IFSC must be 11 characters (e.g. HDFC0001234).');
  }
  return code;
}

export function validateUpiId(raw: string): string | null {
  const id = raw.trim().toLowerCase();
  if (!id) return null;
  if (!UPI_RE.test(id)) {
    throw new Error('UPI ID must look like name@bank.');
  }
  return id;
}

export function validatePositiveSalaryInr(raw: string): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error('Salary must be zero or a positive amount.');
  }
  return Math.round(n * 100);
}

export function validateThresholdMultiplier(raw: string): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error('Threshold multiplier must be a positive number.');
  }
  return n;
}

export function validatePercentage(raw: string): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 100) {
    throw new Error('Percentage must be between 0 and 100.');
  }
  return Math.round(n * 100);
}

export function validateSalaryFrequency(raw: string): 'monthly' | 'weekly' | 'daily' {
  if (raw === 'weekly' || raw === 'daily') return raw;
  return 'monthly';
}

export function validatePaymentMethod(raw: string): 'bank_transfer' | 'upi' {
  return raw === 'bank_transfer' ? 'bank_transfer' : 'upi';
}

export function validateIncentivePlanType(
  raw: string,
): 'none' | 'percentage_threshold' | 'fixed_bonus' {
  if (raw === 'percentage_threshold' || raw === 'fixed_bonus') return raw;
  return 'none';
}
