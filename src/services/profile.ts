import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { customers, type Customer } from '@/src/db/schema';
import { normaliseEmail } from '@/src/lib/email/address';
import { normaliseIndianPhone } from '@/src/lib/phone';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isProfileComplete(customer: Pick<
  Customer,
  'fullName' | 'email' | 'phone' | 'profileCompletedAt'
>): boolean {
  if (customer.profileCompletedAt) return true;
  return profileFieldsSatisfied(customer);
}

/** True when name, email, and mobile are valid — ignores the completion stamp. */
export function profileFieldsSatisfied(
  customer: Pick<Customer, 'fullName' | 'email' | 'phone'>,
): boolean {
  if (!customer.fullName?.trim() || customer.fullName.trim().length < 2) return false;
  if (!EMAIL_RE.test(customer.email ?? '')) return false;
  if (!customer.phone || !normaliseIndianPhone(customer.phone)) return false;
  return true;
}

/**
 * Set `profileCompletedAt` when profile fields are satisfied but the stamp is
 * missing (legacy OTP/booking paths that never hit /account/profile).
 */
export async function stampProfileCompletedAtIfReady(
  customerId: string,
  at: Date = new Date(),
): Promise<void> {
  const customer = await getCustomerById(customerId);
  if (!customer || customer.profileCompletedAt) return;
  if (!profileFieldsSatisfied(customer)) return;
  await db
    .update(customers)
    .set({ profileCompletedAt: at, updatedAt: at })
    .where(eq(customers.id, customerId));
}

export function canCheckIn(customer: Pick<Customer, 'kycStatus'>): boolean {
  return customer.kycStatus === 'approved';
}

export async function requireCompleteProfile(
  customerId: string,
  opts?: { next?: string },
): Promise<Customer> {
  const customer = await getCustomerById(customerId);
  if (!customer || !isProfileComplete(customer)) {
    const q = opts?.next ? `?next=${encodeURIComponent(opts.next)}` : '';
    redirect(`/account/profile${q}`);
  }
  return customer;
}

export async function getCustomerById(customerId: string) {
  const [row] = await db
    .select()
    .from(customers)
    .where(eq(customers.id, customerId))
    .limit(1);
  return row ?? null;
}

export async function updateCustomerProfile(args: {
  customerId: string;
  fullName: string;
  email: string;
  phone: string;
}) {
  const email = normaliseEmail(args.email);
  if (!email) {
    return { ok: false as const, message: 'Enter a valid email address.' };
  }
  const phone = normaliseIndianPhone(args.phone);
  if (!phone) {
    return { ok: false as const, message: 'Enter a valid 10-digit mobile number.' };
  }
  if (!args.fullName.trim() || args.fullName.trim().length < 2) {
    return { ok: false as const, message: 'Enter your full name.' };
  }

  const now = new Date();
  const [row] = await db
    .update(customers)
    .set({
      fullName: args.fullName.trim(),
      email,
      phone,
      profileCompletedAt: now,
      updatedAt: now,
    })
    .where(eq(customers.id, args.customerId))
    .returning();

  return { ok: true as const, customer: row };
}

/** Backfill `profile_completed_at` for legacy rows with complete field data. */
export async function backfillProfileCompletedStamps(): Promise<{
  scanned: number;
  stamped: number;
}> {
  const rows = await db.select().from(customers);
  let stamped = 0;
  for (const row of rows) {
    if (row.profileCompletedAt || !profileFieldsSatisfied(row)) continue;
    const at = row.updatedAt ?? row.createdAt ?? new Date();
    await db
      .update(customers)
      .set({ profileCompletedAt: at, updatedAt: at })
      .where(eq(customers.id, row.id));
    stamped += 1;
  }
  return { scanned: rows.length, stamped };
}
