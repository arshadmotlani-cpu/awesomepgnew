/**
 * Billing-only customer row for standalone invoices — not a resident booking.
 * Uses deterministic placeholder phone/email when contact details are omitted.
 */

import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { customers } from '@/src/db/schema';
import { normaliseEmail } from '@/src/lib/email/address';
import { normaliseIndianPhone } from '@/src/lib/phone';
import { mergeOrUpsertCustomerForAdminWalkIn } from '@/src/services/adminCustomerMerge';

export type ResolveStandaloneInvoiceContactInput = {
  fullName: string;
  phone?: string;
  email?: string;
};

export type ResolveStandaloneInvoiceContactResult =
  | { ok: true; customerId: string; created: boolean }
  | { ok: false; error: string };

/** Stable key for placeholder contact when phone is not provided. */
export function standaloneInvoiceIdentityKey(fullName: string, email?: string): string {
  const name = fullName.trim().toLowerCase();
  const mail = email?.trim().toLowerCase() ?? '';
  return `${name}|${mail}`;
}

export function standalonePlaceholderEmail(identityKey: string): string {
  const digest = createHash('sha256').update(identityKey, 'utf8').digest('hex').slice(0, 24);
  return `standalone+${digest}@invoices.awesomepg.in`;
}

/** 10-digit Indian mobile starting with 6 — reserved for name-only standalone billing contacts. */
export function standalonePlaceholderPhoneLocal(identityKey: string): string {
  const digest = createHash('sha256').update(identityKey, 'utf8').digest('hex');
  const n = parseInt(digest.slice(0, 7), 16) % 1_000_000_000;
  return `6${String(n).padStart(9, '0')}`;
}

export async function resolveStandaloneInvoiceContact(
  input: ResolveStandaloneInvoiceContactInput,
): Promise<ResolveStandaloneInvoiceContactResult> {
  const trimmedName = input.fullName.trim();
  if (!trimmedName) {
    return { ok: false, error: 'Customer name is required.' };
  }

  const normalizedPhone = input.phone ? normaliseIndianPhone(input.phone) : null;
  if (input.phone?.trim() && !normalizedPhone) {
    return { ok: false, error: 'Invalid phone number.' };
  }

  const normalizedEmail = input.email?.trim() ? normaliseEmail(input.email.trim()) : null;
  if (input.email?.trim() && !normalizedEmail) {
    return { ok: false, error: 'Invalid email address.' };
  }

  if (normalizedPhone) {
    const merged = await mergeOrUpsertCustomerForAdminWalkIn({
      fullName: trimmedName,
      phone: normalizedPhone.replace('+91', ''),
      email: normalizedEmail ?? undefined,
      gender: 'other',
    });
    if (!merged.ok) return merged;
    return { ok: true, customerId: merged.customerId, created: merged.created };
  }

  const identityKey = standaloneInvoiceIdentityKey(trimmedName, normalizedEmail ?? undefined);
  const placeholderEmail = normalizedEmail ?? standalonePlaceholderEmail(identityKey);
  const placeholderPhone = standalonePlaceholderPhoneLocal(identityKey);

  const [byEmail] = await db
    .select({ id: customers.id })
    .from(customers)
    .where(eq(customers.email, placeholderEmail))
    .limit(1);
  if (byEmail) {
    return { ok: true, customerId: byEmail.id, created: false };
  }

  const merged = await mergeOrUpsertCustomerForAdminWalkIn({
    fullName: trimmedName,
    phone: placeholderPhone,
    email: placeholderEmail,
    gender: 'other',
  });
  if (!merged.ok) return merged;
  return { ok: true, customerId: merged.customerId, created: merged.created };
}
