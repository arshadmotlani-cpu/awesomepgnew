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
