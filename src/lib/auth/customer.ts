import { eq, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { bookings, customers } from '@/src/db/schema';
import { normaliseEmail } from '@/src/lib/email/address';
import { normaliseIndianPhone } from '@/src/lib/phone';
import { profileFieldsSatisfied } from '@/src/services/profile';

export class AuthPhoneConflictError extends Error {
  readonly linkedEmail: string;

  constructor(linkedEmail: string) {
    super('This mobile number is already linked to another account.');
    this.name = 'AuthPhoneConflictError';
    this.linkedEmail = linkedEmail;
  }
}

async function customerHasActivity(customerId: string): Promise<boolean> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(bookings)
    .where(eq(bookings.customerId, customerId));
  return (row?.count ?? 0) > 0;
}

/** Free unique phone/email slots from duplicate incomplete signups during verified recovery. */
export async function archiveStaleCustomerForRecovery(row: { id: string; email: string }) {
  const now = new Date();
  const tag = row.id.slice(0, 8);
  await db
    .update(customers)
    .set({
      archivedAt: now,
      phone: `+91archived-${tag}${now.getTime().toString(36)}`,
      email: `${row.email}.archived.${tag}`,
      updatedAt: now,
    })
    .where(eq(customers.id, row.id));
}

export async function resolvePhoneConflictForRecovery(recoveringEmail: string, phone: string) {
  const phoneOwner = await findCustomerByPhone(phone);
  if (!phoneOwner || phoneOwner.archivedAt || phoneOwner.email === recoveringEmail) {
    return;
  }

  if (isIncompleteSignup(phoneOwner) || !(await customerHasActivity(phoneOwner.id))) {
    await archiveStaleCustomerForRecovery(phoneOwner);
    return;
  }

  throw new AuthPhoneConflictError(phoneOwner.email);
}

export async function findCustomerByEmail(rawEmail: string) {
  const email = normaliseEmail(rawEmail);
  if (!email) return null;
  const [row] = await db
    .select()
    .from(customers)
    .where(eq(customers.email, email))
    .limit(1);
  return row ?? null;
}

export async function findCustomerByPhone(rawPhone: string) {
  const phone = normaliseIndianPhone(rawPhone);
  if (!phone) return null;
  const [row] = await db
    .select()
    .from(customers)
    .where(eq(customers.phone, phone))
    .limit(1);
  return row ?? null;
}

export async function createCustomerProfile(args: {
  email: string;
  fullName: string;
  phone: string;
}) {
  const email = normaliseEmail(args.email);
  if (!email) {
    throw new Error('Invalid email address.');
  }
  const phone = normaliseIndianPhone(args.phone);
  if (!phone) {
    throw new Error('Invalid mobile number.');
  }
  const fullName = args.fullName.trim();
  const now = new Date();
  const profileCompletedAt = profileFieldsSatisfied({ fullName, email, phone })
    ? now
    : null;

  const [row] = await db
    .insert(customers)
    .values({
      email,
      phone,
      fullName,
      gender: 'other',
      profileCompletedAt,
      authProvider: 'email',
      mustSetPassword: true,
    })
    .returning();
  return row;
}

/** Account recovery — write profile straight to customers (no signup_sessions dependency). */
export async function upsertRecoveryCustomerProfile(args: {
  email: string;
  fullName: string;
  phone: string;
}) {
  const email = normaliseEmail(args.email);
  if (!email) throw new Error('Invalid email address.');
  const phone = normaliseIndianPhone(args.phone);
  if (!phone) throw new Error('Enter a valid 10-digit mobile number.');
  const fullName = args.fullName.trim();
  if (fullName.length < 2) throw new Error('Enter your full name to continue.');

  await resolvePhoneConflictForRecovery(email, phone);

  const existing = await findCustomerByEmail(email);
  if (existing?.archivedAt) {
    throw new Error('This account is archived. Contact support for help.');
  }

  if (existing && isAccountComplete(existing)) {
    throw new Error('This email already has an account. Sign in with your password.');
  }

  const now = new Date();
  const profileCompletedAt = profileFieldsSatisfied({ fullName, email, phone }) ? now : null;

  if (existing) {
    const [row] = await db
      .update(customers)
      .set({
        fullName,
        phone,
        profileCompletedAt: profileCompletedAt ?? existing.profileCompletedAt,
        mustSetPassword: true,
        updatedAt: now,
      })
      .where(eq(customers.id, existing.id))
      .returning();
    return row;
  }

  return createCustomerProfile({ email, fullName, phone: args.phone });
}

export async function setCustomerPassword(customerId: string, password: string): Promise<void> {
  const { hashPassword } = await import('@/src/lib/auth/crypto');
  const passwordHash = hashPassword(password);
  await db
    .update(customers)
    .set({
      passwordHash,
      mustSetPassword: false,
      updatedAt: new Date(),
    })
    .where(eq(customers.id, customerId));
}

/** Can use email + password on the login form. */
export function canSignInWithPassword(customer: {
  passwordHash: string | null;
  archivedAt?: Date | null;
}): boolean {
  return Boolean(customer.passwordHash) && !customer.archivedAt;
}

/** A real account requires a password — partial rows without one are incomplete. */
export function isAccountComplete(customer: {
  passwordHash: string | null;
  mustSetPassword: boolean;
}): boolean {
  return Boolean(customer.passwordHash) && !customer.mustSetPassword;
}

export function isIncompleteSignup(customer: {
  passwordHash: string | null;
  mustSetPassword: boolean;
}): boolean {
  return !customer.passwordHash || customer.mustSetPassword;
}

/** Final commit — create customer + password atomically at end of signup. */
export async function commitSignupCustomer(args: {
  email: string;
  fullName: string;
  phone: string;
  password: string;
}) {
  const email = normaliseEmail(args.email);
  if (!email) throw new Error('Invalid email address.');
  const phone = normaliseIndianPhone(args.phone);
  if (!phone) throw new Error('Invalid mobile number.');
  const fullName = args.fullName.trim();
  if (fullName.length < 2) throw new Error('Enter your full name to continue.');

  const existingByEmail = await findCustomerByEmail(email);
  if (existingByEmail && isAccountComplete(existingByEmail)) {
    return existingByEmail;
  }

  const existingByPhone = await findCustomerByPhone(phone);
  if (
    existingByPhone &&
    isAccountComplete(existingByPhone) &&
    existingByPhone.email !== email
  ) {
    throw new Error(
      'This mobile number is already linked to another account. Use a different number or sign in with that account.',
    );
  }

  const { hashPassword } = await import('@/src/lib/auth/crypto');
  const passwordHash = hashPassword(args.password);
  const now = new Date();
  const profileCompletedAt = profileFieldsSatisfied({ fullName, email, phone }) ? now : null;

  if (existingByEmail && isIncompleteSignup(existingByEmail)) {
    const [row] = await db
      .update(customers)
      .set({
        fullName,
        phone,
        passwordHash,
        mustSetPassword: false,
        profileCompletedAt: profileCompletedAt ?? existingByEmail.profileCompletedAt,
        updatedAt: now,
      })
      .where(eq(customers.id, existingByEmail.id))
      .returning();
    return row;
  }

  if (existingByPhone && isIncompleteSignup(existingByPhone) && existingByPhone.email === email) {
    const [row] = await db
      .update(customers)
      .set({
        fullName,
        phone,
        passwordHash,
        mustSetPassword: false,
        profileCompletedAt: profileCompletedAt ?? existingByPhone.profileCompletedAt,
        updatedAt: now,
      })
      .where(eq(customers.id, existingByPhone.id))
      .returning();
    return row;
  }

  const [row] = await db
    .insert(customers)
    .values({
      email,
      phone,
      fullName,
      gender: 'other',
      profileCompletedAt,
      authProvider: 'email',
      passwordHash,
      mustSetPassword: false,
    })
    .returning();
  return row;
}
