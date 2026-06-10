/**
 * Phone number normalisation — India-only product.
 *
 * Storage format: E.164 `+91XXXXXXXXXX` (12 chars for Indian mobiles).
 * User-facing forms collect a 10-digit local mobile; use `normaliseIndianPhone`.
 * `normalisePhone` remains for parsing already-stored / legacy E.164 strings.
 */

/** Indian mobile local part: 10 digits starting with 6–9. */
export const INDIAN_MOBILE_LOCAL = /^[6-9]\d{9}$/;

const E164 = /^\+?[1-9]\d{7,14}$/;

function collapseToDigitsAndPlus(input: string): string {
  const trimmed = input.trim().replace(/[^\d+]/g, '');
  return trimmed.startsWith('+')
    ? '+' + trimmed.slice(1).replace(/\+/g, '')
    : trimmed.replace(/\+/g, '');
}

export function normalisePhone(input: string | null | undefined): string | null {
  if (!input) return null;
  const collapsed = collapseToDigitsAndPlus(input);
  if (!E164.test(collapsed)) return null;
  return collapsed;
}

/**
 * Normalise user input to `+91XXXXXXXXXX`. Accepts:
 *   - 10-digit local mobile (9876543210)
 *   - 12-digit with country code (919876543210)
 *   - E.164 (+919876543210)
 */
export function normaliseIndianPhone(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  const digitsOnly = trimmed.replace(/\D/g, '');

  if (digitsOnly.length === 10 && INDIAN_MOBILE_LOCAL.test(digitsOnly)) {
    return `+91${digitsOnly}`;
  }

  if (digitsOnly.length === 12 && digitsOnly.startsWith('91')) {
    const local = digitsOnly.slice(2);
    if (INDIAN_MOBILE_LOCAL.test(local)) return `+91${local}`;
  }

  const collapsed = collapseToDigitsAndPlus(trimmed);
  if (collapsed.startsWith('+91')) {
    const local = collapsed.slice(3);
    return INDIAN_MOBILE_LOCAL.test(local) ? `+91${local}` : null;
  }
  if (collapsed.startsWith('91') && collapsed.length === 12) {
    const local = collapsed.slice(2);
    return INDIAN_MOBILE_LOCAL.test(local) ? `+91${local}` : null;
  }

  return null;
}

/** True when both inputs denote the same Indian mobile after normalisation. */
export function indianPhonesEqual(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const left = normaliseIndianPhone(a);
  const right = normaliseIndianPhone(b);
  return left !== null && right !== null && left === right;
}

/** Extract 10-digit local part from a stored `+91…` E.164 number. */
export function indianLocalFromE164(input: string | null | undefined): string | null {
  if (!input) return null;
  const e164 = normaliseIndianPhone(input);
  if (!e164?.startsWith('+91')) return null;
  const local = e164.slice(3);
  return INDIAN_MOBILE_LOCAL.test(local) ? local : null;
}

/** Display helper: `+91 98765 43210` */
export function formatIndianPhoneDisplay(input: string | null | undefined): string {
  const local = indianLocalFromE164(input);
  if (!local) return input?.trim() ?? '';
  return `+91 ${local.slice(0, 5)} ${local.slice(5)}`;
}
