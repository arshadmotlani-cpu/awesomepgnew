import { findCustomerByEmail, findCustomerByPhone } from '@/src/lib/auth/customer';
import { normaliseEmail } from '@/src/lib/email/address';
import { normaliseIndianPhone } from '@/src/lib/phone';
import type { Customer } from '@/src/db/schema/customers';

export type LoginIdentifierKind = 'email' | 'phone';

export type ParsedLoginIdentifier = {
  kind: LoginIdentifierKind;
  /** Normalised email or E.164 phone. */
  value: string;
  /** Raw trimmed user input. */
  raw: string;
};

/** Detect email vs Indian mobile from sign-in / forgot-password input. */
export function parseLoginIdentifier(rawInput: string): ParsedLoginIdentifier | null {
  const raw = rawInput.trim();
  if (!raw) return null;

  if (raw.includes('@')) {
    const email = normaliseEmail(raw);
    if (!email) return null;
    return { kind: 'email', value: email, raw };
  }

  const phone = normaliseIndianPhone(raw);
  if (!phone) return null;
  return { kind: 'phone', value: phone, raw };
}

/** Mask registered email for public display — never reveal full address. */
export function maskEmailForDisplay(email: string): string {
  const normalised = normaliseEmail(email);
  if (!normalised) return 'your registered email';
  const at = normalised.indexOf('@');
  if (at <= 0) return 'your registered email';
  const local = normalised.slice(0, at);
  const domain = normalised.slice(at + 1);
  if (!domain) return 'your registered email';
  const first = local[0] ?? '*';
  const maskedLocal = local.length <= 1 ? `${first}******` : `${first}${'*'.repeat(6)}`;
  return `${maskedLocal}@${domain}`;
}

export async function findCustomerByLoginIdentifier(
  rawInput: string,
): Promise<{ customer: Customer; identifier: ParsedLoginIdentifier } | null> {
  const identifier = parseLoginIdentifier(rawInput);
  if (!identifier) return null;

  const customer =
    identifier.kind === 'email'
      ? await findCustomerByEmail(identifier.value)
      : await findCustomerByPhone(identifier.value);

  if (!customer || customer.archivedAt) return null;
  return { customer, identifier };
}
