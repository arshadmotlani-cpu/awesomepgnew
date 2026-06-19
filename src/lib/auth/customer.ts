import { eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { customers } from '@/src/db/schema';
import { normaliseEmail } from '@/src/lib/email/address';
import { normaliseIndianPhone } from '@/src/lib/phone';
import { profileFieldsSatisfied } from '@/src/services/profile';

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
    throw new Error('This email already has an account. Sign in or use forgot password.');
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
