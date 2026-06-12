import { cache } from 'react';
import { cookies } from 'next/headers';
import { and, eq, gt } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { adminUsers, authSessions, customers } from '@/src/db/schema';
import { env } from '@/src/lib/env';
import {
  ADMIN_SESSION_COOKIE,
  CUSTOMER_SESSION_COOKIE,
} from './constants';
import { normaliseIndianPhone } from '@/src/lib/phone';
import { hasDatabaseUrl } from '@/src/lib/db/env';
import { randomToken, sha256 } from './crypto';

export type CustomerSession = {
  kind: 'customer';
  sessionId: string;
  customerId: string;
  phone: string;
  fullName: string;
  email: string;
  mustSetPassword: boolean;
  expiresAt: Date;
};

export type AdminSession = {
  kind: 'admin';
  sessionId: string;
  adminId: string;
  email: string;
  fullName: string;
  role: (typeof adminUsers.$inferSelect)['role'];
  pgScope: string[];
  mustChangePassword: boolean;
  expiresAt: Date;
};

function customerExpiry(): Date {
  const days = env.AUTH_CUSTOMER_SESSION_DAYS;
  return new Date(Date.now() + days * 86_400_000);
}

function adminExpiry(): Date {
  const hours = env.AUTH_ADMIN_SESSION_HOURS;
  return new Date(Date.now() + hours * 3_600_000);
}

export async function createCustomerSession(args: {
  customerId: string;
  ip?: string | null;
  userAgent?: string | null;
}): Promise<string> {
  const token = randomToken();
  await db.insert(authSessions).values({
    kind: 'customer',
    subjectId: args.customerId,
    tokenHash: sha256(token),
    expiresAt: customerExpiry(),
    ip: args.ip ?? null,
    userAgent: args.userAgent ?? null,
  });
  const jar = await cookies();
  jar.set(CUSTOMER_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.NODE_ENV === 'production',
    path: '/',
    expires: customerExpiry(),
  });
  return token;
}

export async function createAdminSession(args: {
  adminId: string;
  ip?: string | null;
  userAgent?: string | null;
}): Promise<string> {
  const token = randomToken();
  const expires = adminExpiry();
  await db.insert(authSessions).values({
    kind: 'admin',
    subjectId: args.adminId,
    tokenHash: sha256(token),
    expiresAt: expires,
    ip: args.ip ?? null,
    userAgent: args.userAgent ?? null,
  });
  const jar = await cookies();
  jar.set(ADMIN_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.NODE_ENV === 'production',
    path: '/',
    expires,
  });
  return token;
}

async function readSessionByCookie(
  cookieName: string,
  kind: 'customer' | 'admin',
): Promise<{ sessionId: string; subjectId: string; expiresAt: Date } | null> {
  if (!hasDatabaseUrl()) return null;
  const jar = await cookies();
  const token = jar.get(cookieName)?.value;
  if (!token) return null;
  try {
    const [row] = await db
      .select({
        sessionId: authSessions.id,
        subjectId: authSessions.subjectId,
        expiresAt: authSessions.expiresAt,
      })
      .from(authSessions)
      .where(
        and(
          eq(authSessions.kind, kind),
          eq(authSessions.tokenHash, sha256(token)),
          gt(authSessions.expiresAt, new Date()),
        ),
      )
      .limit(1);
    return row ?? null;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[auth] ${kind} session lookup failed:`, message);
    return null;
  }
}

/** Per-request dedupe — layout + page may both need the session. */
export const getCustomerSession = cache(async (): Promise<CustomerSession | null> => {
  const base = await readSessionByCookie(CUSTOMER_SESSION_COOKIE, 'customer');
  if (!base) return null;
  try {
    const [customer] = await db
      .select({
        id: customers.id,
        phone: customers.phone,
        fullName: customers.fullName,
        email: customers.email,
        mustSetPassword: customers.mustSetPassword,
      })
      .from(customers)
      .where(eq(customers.id, base.subjectId))
      .limit(1);
    if (!customer) return null;
    return {
      kind: 'customer',
      sessionId: base.sessionId,
      customerId: customer.id,
      phone: normaliseIndianPhone(customer.phone) ?? customer.phone,
      fullName: customer.fullName,
      email: customer.email,
      mustSetPassword: customer.mustSetPassword,
      expiresAt: base.expiresAt,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[auth] customer profile lookup failed:', message);
    return null;
  }
});

/** Per-request dedupe — admin shell may read session from multiple server components. */
export const getAdminSession = cache(async (): Promise<AdminSession | null> => {
  const base = await readSessionByCookie(ADMIN_SESSION_COOKIE, 'admin');
  if (!base) return null;
  try {
    const [admin] = await db
      .select({
        id: adminUsers.id,
        email: adminUsers.email,
        fullName: adminUsers.fullName,
        role: adminUsers.role,
        pgScope: adminUsers.pgScope,
        isActive: adminUsers.isActive,
        mustChangePassword: adminUsers.mustChangePassword,
      })
      .from(adminUsers)
      .where(eq(adminUsers.id, base.subjectId))
      .limit(1);
    if (!admin || !admin.isActive) return null;
    return {
      kind: 'admin',
      sessionId: base.sessionId,
      adminId: admin.id,
      email: admin.email,
      fullName: admin.fullName,
      role: admin.role,
      pgScope: admin.pgScope ?? [],
      mustChangePassword: admin.mustChangePassword,
      expiresAt: base.expiresAt,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[auth] admin profile lookup failed:', message);
    return null;
  }
});

export async function destroyCustomerSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(CUSTOMER_SESSION_COOKIE)?.value;
  if (token) {
    await db
      .delete(authSessions)
      .where(eq(authSessions.tokenHash, sha256(token)));
  }
  jar.delete(CUSTOMER_SESSION_COOKIE);
}

export async function destroyAdminSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(ADMIN_SESSION_COOKIE)?.value;
  if (token) {
    await db
      .delete(authSessions)
      .where(eq(authSessions.tokenHash, sha256(token)));
  }
  jar.delete(ADMIN_SESSION_COOKIE);
}
