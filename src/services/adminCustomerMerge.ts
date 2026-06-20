/**
 * Admin walk-in customer merge — phone is the unique key.
 * Never creates duplicate users; merges missing fields only.
 */

import { eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { customers } from '@/src/db/schema';
import { findCustomerByPhone } from '@/src/lib/auth/customer';
import { normaliseEmail } from '@/src/lib/email/address';
import { normaliseIndianPhone } from '@/src/lib/phone';
import { stampProfileCompletedAtIfReady } from '@/src/services/profile';

export type AdminCustomerMergeInput = {
  customerId?: string;
  fullName: string;
  phone: string;
  email?: string;
  gender: 'male' | 'female' | 'other';
  /** Admin attests identity — sets kycStatus approved when true. */
  adminVerifiedKyc?: boolean;
};

export type AdminCustomerMergeResult =
  | { ok: true; customerId: string; created: boolean; merged: boolean }
  | { ok: false; error: string };

function walkInPlaceholderEmail(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return `walkin+${digits}@residents.awesomepg.in`;
}

function isPlaceholderEmail(email: string): boolean {
  return email.startsWith('walkin+') && email.endsWith('@residents.awesomepg.in');
}

function mergeField(existing: string, incoming: string): string {
  const ex = existing.trim();
  const inc = incoming.trim();
  if (!inc) return ex;
  if (!ex) return inc;
  return ex;
}

export async function mergeOrUpsertCustomerForAdminWalkIn(
  input: AdminCustomerMergeInput,
): Promise<AdminCustomerMergeResult> {
  const phone = normaliseIndianPhone(input.phone);
  if (!phone) {
    return { ok: false, error: 'Invalid phone number.' };
  }

  const trimmedName = input.fullName.trim();
  if (!trimmedName) {
    return { ok: false, error: 'Full name is required.' };
  }

  const rawEmail = input.email?.trim();
  const normalizedEmail = rawEmail ? normaliseEmail(rawEmail) : null;
  if (rawEmail && !normalizedEmail) {
    return { ok: false, error: 'Invalid email address.' };
  }

  let existing =
    input.customerId != null
      ? (
          await db
            .select()
            .from(customers)
            .where(eq(customers.id, input.customerId))
            .limit(1)
        )[0] ?? null
      : await findCustomerByPhone(phone);

  if (existing?.archivedAt) {
    return { ok: false, error: 'This phone is linked to an archived account. Recover it first.' };
  }

  if (existing && existing.phone !== phone) {
    const phoneOwner = await findCustomerByPhone(phone);
    if (phoneOwner && phoneOwner.id !== existing.id) {
      return {
        ok: false,
        error: 'Phone number belongs to a different resident. Use account recovery.',
      };
    }
  }

  if (existing) {
    const nextName = mergeField(existing.fullName, trimmedName);
    let nextEmail = existing.email;
    if (normalizedEmail) {
      nextEmail = isPlaceholderEmail(existing.email) ? normalizedEmail : mergeField(existing.email, normalizedEmail);
    } else if (!existing.email.trim()) {
      nextEmail = walkInPlaceholderEmail(phone);
    }

    const [row] = await db
      .update(customers)
      .set({
        fullName: nextName,
        email: nextEmail,
        phone,
        gender: input.gender,
        kycStatus: input.adminVerifiedKyc ? 'approved' : existing.kycStatus,
        updatedAt: new Date(),
      })
      .where(eq(customers.id, existing.id))
      .returning({ id: customers.id });

    await stampProfileCompletedAtIfReady(row.id);
    return { ok: true, customerId: row.id, created: false, merged: true };
  }

  const insertEmail = normalizedEmail ?? walkInPlaceholderEmail(phone);

  const [row] = await db
    .insert(customers)
    .values({
      fullName: trimmedName,
      email: insertEmail,
      phone,
      gender: input.gender,
      kycStatus: input.adminVerifiedKyc ? 'approved' : 'pending',
      authProvider: 'email',
    })
    .onConflictDoUpdate({
      target: customers.phone,
      set: {
        fullName: trimmedName,
        email: insertEmail,
        gender: input.gender,
        kycStatus: input.adminVerifiedKyc ? 'approved' : 'pending',
        updatedAt: new Date(),
      },
    })
    .returning({ id: customers.id });

  await stampProfileCompletedAtIfReady(row.id);
  return { ok: true, customerId: row.id, created: true, merged: false };
}
