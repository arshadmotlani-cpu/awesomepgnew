import { cache } from 'react';
import { cookies } from 'next/headers';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { logger } from '@/src/lib/logger';
import { db } from '@/src/db/client';
import { adminUsers, authSessions, customers } from '@/src/db/schema';
import { env } from '@/src/lib/env';
import {
  adminSessionExpiry,
  adminSessionRefreshThresholdMs,
} from './adminSessionPolicy';
import {
  customerSessionExpiry,
  customerSessionRefreshThresholdMs,
} from './customerSessionPolicy';
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
  rememberMe: boolean;
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
  rememberMe: boolean;
  expiresAt: Date;
};

function customerExpiryFor(rememberMe: boolean): Date {
  return customerSessionExpiry(rememberMe);
}

function customerRefreshThresholdMs(): number {
  return customerSessionRefreshThresholdMs();
}

function adminExpiryFor(rememberMe: boolean): Date {
  return adminSessionExpiry(rememberMe);
}

function adminRefreshThresholdMs(): number {
  return adminSessionRefreshThresholdMs();
}

export async function createCustomerSession(args: {
  customerId: string;
  rememberMe?: boolean;
  ip?: string | null;
  userAgent?: string | null;
}): Promise<string> {
  const rememberMe = args.rememberMe ?? false;
  const token = randomToken();
  const expires = customerExpiryFor(rememberMe);
  await db.insert(authSessions).values({
    kind: 'customer',
    subjectId: args.customerId,
    tokenHash: sha256(token),
    expiresAt: expires,
    rememberMe,
    ip: args.ip ?? null,
    userAgent: args.userAgent ?? null,
  });
  const jar = await cookies();
  jar.set(CUSTOMER_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.NODE_ENV === 'production',
    path: '/',
    expires,
  });
  return token;
}

export async function createAdminSession(args: {
  adminId: string;
  rememberMe?: boolean;
  ip?: string | null;
  userAgent?: string | null;
}): Promise<string> {
  const rememberMe = args.rememberMe ?? false;
  const token = randomToken();
  const expires = adminExpiryFor(rememberMe);
  await db.insert(authSessions).values({
    kind: 'admin',
    subjectId: args.adminId,
    tokenHash: sha256(token),
    expiresAt: expires,
    rememberMe,
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
): Promise<{
  sessionId: string;
  subjectId: string;
  expiresAt: Date;
  rememberMe: boolean;
  token: string;
} | null> {
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
        rememberMe: authSessions.rememberMe,
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
    if (!row) return null;
    return {
      sessionId: row.sessionId,
      subjectId: row.subjectId,
      expiresAt: row.expiresAt,
      rememberMe: row.rememberMe,
      token,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[auth] ${kind} session lookup failed:`, message);
    return null;
  }
}

async function refreshAdminSessionIfNeeded(args: {
  sessionId: string;
  expiresAt: Date;
  rememberMe: boolean;
  token: string;
}): Promise<Date> {
  const remaining = args.expiresAt.getTime() - Date.now();
  if (remaining > adminRefreshThresholdMs()) {
    return args.expiresAt;
  }

  const newExpires = adminExpiryFor(args.rememberMe);
  try {
    await db
      .update(authSessions)
      .set({ expiresAt: newExpires, lastSeenAt: new Date() })
      .where(eq(authSessions.id, args.sessionId));

    const jar = await cookies();
    jar.set(ADMIN_SESSION_COOKIE, args.token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: env.NODE_ENV === 'production',
      path: '/',
      expires: newExpires,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[auth] admin session refresh failed:', message);
    return args.expiresAt;
  }

  return newExpires;
}

async function refreshCustomerSessionIfNeeded(args: {
  sessionId: string;
  expiresAt: Date;
  rememberMe: boolean;
  token: string;
}): Promise<Date> {
  const remaining = args.expiresAt.getTime() - Date.now();
  if (remaining > customerRefreshThresholdMs()) {
    return args.expiresAt;
  }

  const newExpires = customerExpiryFor(args.rememberMe);
  try {
    await db
      .update(authSessions)
      .set({ expiresAt: newExpires, lastSeenAt: new Date() })
      .where(eq(authSessions.id, args.sessionId));

    const jar = await cookies();
    jar.set(CUSTOMER_SESSION_COOKIE, args.token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: env.NODE_ENV === 'production',
      path: '/',
      expires: newExpires,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[auth] customer session refresh failed:', message);
    return args.expiresAt;
  }

  return newExpires;
}

/** Per-request dedupe — layout + page may both need the session. */
export const getCustomerSession = cache(async (): Promise<CustomerSession | null> => {
  const base = await readSessionByCookie(CUSTOMER_SESSION_COOKIE, 'customer');
  if (!base) return null;
  try {
    const expiresAt = await refreshCustomerSessionIfNeeded({
      sessionId: base.sessionId,
      expiresAt: base.expiresAt,
      rememberMe: base.rememberMe,
      token: base.token,
    });

    const [customer] = await db
      .select({
        id: customers.id,
        phone: customers.phone,
        fullName: customers.fullName,
        email: customers.email,
        mustSetPassword: customers.mustSetPassword,
        archivedAt: customers.archivedAt,
      })
      .from(customers)
      .where(and(eq(customers.id, base.subjectId), isNull(customers.archivedAt)))
      .limit(1);
    if (!customer) {
      logger.warn('customer_session_rejected', {
        reason: 'customer_missing_or_archived',
        subjectId: base.subjectId,
        sessionId: base.sessionId,
      });
      return null;
    }
    return {
      kind: 'customer',
      sessionId: base.sessionId,
      customerId: customer.id,
      phone: normaliseIndianPhone(customer.phone) ?? customer.phone,
      fullName: customer.fullName,
      email: customer.email,
      mustSetPassword: customer.mustSetPassword,
      rememberMe: base.rememberMe,
      expiresAt,
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
    const expiresAt = await refreshAdminSessionIfNeeded({
      sessionId: base.sessionId,
      expiresAt: base.expiresAt,
      rememberMe: base.rememberMe,
      token: base.token,
    });

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
      rememberMe: base.rememberMe,
      expiresAt,
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

/** Revoke every resident session (optionally keep the current device). */
export async function destroyAllCustomerSessions(
  customerId: string,
  opts?: { exceptCurrentSession?: boolean },
): Promise<void> {
  const jar = await cookies();
  const token = jar.get(CUSTOMER_SESSION_COOKIE)?.value;
  let exceptSessionId: string | null = null;
  if (opts?.exceptCurrentSession && token) {
    const [row] = await db
      .select({ id: authSessions.id })
      .from(authSessions)
      .where(
        and(
          eq(authSessions.kind, 'customer'),
          eq(authSessions.tokenHash, sha256(token)),
        ),
      )
      .limit(1);
    exceptSessionId = row?.id ?? null;
  }

  const { revokeAllCustomerSessions } = await import('@/src/lib/auth/customerSessions');
  await revokeAllCustomerSessions(customerId, { exceptSessionId });

  if (!opts?.exceptCurrentSession) {
    jar.delete(CUSTOMER_SESSION_COOKIE);
  }
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
