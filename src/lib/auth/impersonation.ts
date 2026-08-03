/**
 * Super Admin resident impersonation — real customer session, audited, dual-cookie.
 */

import { cache } from 'react';
import { cookies, headers } from 'next/headers';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  adminResidentImpersonations,
  adminUsers,
  authSessions,
  bookings,
  customers,
  pgs,
  rooms,
  beds,
} from '@/src/db/schema';
import { CUSTOMER_SESSION_COOKIE, IMPERSONATION_COOKIE } from '@/src/lib/auth/constants';
import { impersonationSessionExpiry } from '@/src/lib/auth/impersonationPolicy';
import { writeAuditLogNonBlocking } from '@/src/lib/audit/writeAuditLog';
import type { AdminSession } from '@/src/lib/auth/session';
import {
  createCustomerSession,
  expireCustomerSessionKeepRow,
  getAdminSession,
} from '@/src/lib/auth/session';
import { env } from '@/src/lib/env';
import { ACCOUNT_RESIDENT_HREF } from '@/src/lib/accountNavigation';

export type ImpersonationContext = {
  impersonationId: string;
  adminId: string;
  adminName: string;
  adminSessionId: string | null;
  customerId: string;
  customerSessionId: string | null;
  residentName: string;
  residentPhone: string;
  bookingId: string | null;
  bookingCode: string | null;
  pgId: string | null;
  pgName: string | null;
  roomId: string | null;
  roomNumber: string | null;
  bedId: string | null;
  bedCode: string | null;
  reason: string;
  startedAt: Date;
  adminReturnPath: string;
};

function parseUserAgentParts(userAgent: string | null | undefined): {
  deviceLabel: string;
  browser: string;
  operatingSystem: string;
} {
  if (!userAgent?.trim()) {
    return { deviceLabel: 'Unknown device', browser: 'Unknown', operatingSystem: 'Unknown' };
  }
  const ua = userAgent;
  let operatingSystem = 'Unknown';
  if (/iPhone|iPad|iPod/i.test(ua)) operatingSystem = 'iOS';
  else if (/Android/i.test(ua)) operatingSystem = 'Android';
  else if (/Windows/i.test(ua)) operatingSystem = 'Windows';
  else if (/Mac OS X|Macintosh/i.test(ua)) operatingSystem = 'macOS';
  else if (/Linux/i.test(ua)) operatingSystem = 'Linux';

  let browser = 'Browser';
  if (/Edg\//i.test(ua)) browser = 'Edge';
  else if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua)) browser = 'Chrome';
  else if (/Firefox\//i.test(ua)) browser = 'Firefox';
  else if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) browser = 'Safari';

  return {
    deviceLabel: `${operatingSystem} · ${browser}`,
    browser,
    operatingSystem,
  };
}

async function readRequestMeta(): Promise<{
  ip: string | null;
  userAgent: string | null;
  requestId: string | null;
}> {
  const h = await headers();
  return {
    ip:
      h.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      h.get('x-real-ip') ??
      null,
    userAgent: h.get('user-agent'),
    requestId: h.get('x-request-id'),
  };
}

async function loadTenancyContext(customerId: string): Promise<{
  bookingId: string | null;
  bookingCode: string | null;
  pgId: string | null;
  pgName: string | null;
  roomId: string | null;
  roomNumber: string | null;
  bedId: string | null;
  bedCode: string | null;
}> {
  const { getActiveTenancyForCustomer } = await import('@/src/lib/residentActiveTenancy');
  const tenancy = await getActiveTenancyForCustomer(customerId);
  if (!tenancy) {
    return {
      bookingId: null,
      bookingCode: null,
      pgId: null,
      pgName: null,
      roomId: null,
      roomNumber: null,
      bedId: null,
      bedCode: null,
    };
  }
  return {
    bookingId: tenancy.bookingId,
    bookingCode: tenancy.bookingCode,
    pgId: tenancy.pgId,
    pgName: tenancy.pgName,
    roomId: tenancy.roomId,
    roomNumber: tenancy.roomNumber,
    bedId: tenancy.bedId,
    bedCode: tenancy.bedCode,
  };
}

async function applyImpersonationCookie(impersonationId: string, expiresAt: Date): Promise<void> {
  const jar = await cookies();
  jar.set(IMPERSONATION_COOKIE, impersonationId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.NODE_ENV === 'production',
    path: '/',
    expires: expiresAt,
  });
}

async function clearImpersonationCookie(): Promise<void> {
  const jar = await cookies();
  jar.set(IMPERSONATION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
}

export function assertSuperAdmin(session: AdminSession): void {
  if (session.role !== 'super_admin') {
    throw new Error('Only Super Admin can impersonate residents.');
  }
}

export async function endActiveImpersonationsForAdmin(
  adminId: string,
  exitReason: string,
): Promise<void> {
  const active = await db
    .select()
    .from(adminResidentImpersonations)
    .where(
      and(
        eq(adminResidentImpersonations.adminId, adminId),
        eq(adminResidentImpersonations.status, 'active'),
      ),
    );

  const now = new Date();
  for (const row of active) {
    const durationSeconds = Math.max(
      0,
      Math.floor((now.getTime() - row.startedAt.getTime()) / 1000),
    );
    await db
      .update(adminResidentImpersonations)
      .set({
        status: 'ended',
        endedAt: now,
        durationSeconds,
        exitReason,
        updatedAt: now,
      })
      .where(eq(adminResidentImpersonations.id, row.id));
  }
}

export async function startResidentImpersonation(args: {
  adminSession: AdminSession;
  customerId: string;
  reason: string;
  returnPath?: string;
}): Promise<{ ok: true; redirectTo: string } | { ok: false; error: string }> {
  assertSuperAdmin(args.adminSession);

  const [customer] = await db
    .select({
      id: customers.id,
      fullName: customers.fullName,
      phone: customers.phone,
      archivedAt: customers.archivedAt,
    })
    .from(customers)
    .where(eq(customers.id, args.customerId))
    .limit(1);

  if (!customer || customer.archivedAt) {
    return { ok: false, error: 'Resident not found or archived.' };
  }

  const meta = await readRequestMeta();
  const uaParts = parseUserAgentParts(meta.userAgent);
  const tenancy = await loadTenancyContext(args.customerId);
  const expiresAt = impersonationSessionExpiry();
  const returnPath = args.returnPath ?? `/admin/residents/${args.customerId}`;

  await endActiveImpersonationsForAdmin(args.adminSession.adminId, 'replaced_by_new_impersonation');

  const [impersonation] = await db
    .insert(adminResidentImpersonations)
    .values({
      adminId: args.adminSession.adminId,
      adminSessionId: args.adminSession.sessionId,
      customerId: args.customerId,
      bookingId: tenancy.bookingId,
      pgId: tenancy.pgId,
      roomId: tenancy.roomId,
      bedId: tenancy.bedId,
      reason: args.reason.trim() || 'UX Review',
      ip: meta.ip,
      userAgent: meta.userAgent,
      deviceLabel: uaParts.deviceLabel,
      browser: uaParts.browser,
      operatingSystem: uaParts.operatingSystem,
      requestId: meta.requestId,
      adminReturnPath: returnPath,
    })
    .returning({ id: adminResidentImpersonations.id });

  try {
    await createCustomerSession({
      customerId: args.customerId,
      rememberMe: false,
      ip: meta.ip,
      userAgent: meta.userAgent,
      expiresAt,
    });

    const jar = await cookies();
    const customerToken = jar.get(CUSTOMER_SESSION_COOKIE)?.value;
    let customerSessionId: string | null = null;
    if (customerToken) {
      const { sha256 } = await import('@/src/lib/auth/crypto');
      const [sessionRow] = await db
        .select({ id: authSessions.id })
        .from(authSessions)
        .where(eq(authSessions.tokenHash, sha256(customerToken)))
        .limit(1);
      customerSessionId = sessionRow?.id ?? null;
    }

    await db
      .update(adminResidentImpersonations)
      .set({
        customerSessionId,
        updatedAt: new Date(),
      })
      .where(eq(adminResidentImpersonations.id, impersonation.id));

    await applyImpersonationCookie(impersonation.id, expiresAt);

    await writeAuditLogNonBlocking(db, {
      actorType: 'admin',
      actorId: args.adminSession.adminId,
      entity: 'customer',
      entityId: args.customerId,
      action: 'impersonation_started',
      diff: {
        impersonationId: impersonation.id,
        reason: args.reason,
        bookingId: tenancy.bookingId,
        pgId: tenancy.pgId,
        customerSessionId,
      },
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    return { ok: true, redirectTo: ACCOUNT_RESIDENT_HREF };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(adminResidentImpersonations)
      .set({
        status: 'failed',
        success: false,
        failureReason: message,
        endedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(adminResidentImpersonations.id, impersonation.id));
    return { ok: false, error: 'Could not start impersonation. Try again.' };
  }
}

export async function endResidentImpersonation(args: {
  exitReason?: string;
}): Promise<{ ok: true; redirectTo: string } | { ok: false; error: string }> {
  const adminSession = await getAdminSession();
  if (!adminSession) {
    return { ok: false, error: 'Admin session expired.' };
  }

  const jar = await cookies();
  const impersonationId = jar.get(IMPERSONATION_COOKIE)?.value;
  if (!impersonationId) {
    await expireCustomerSessionKeepRow();
    return { ok: true, redirectTo: '/admin/overview' };
  }

  const [row] = await db
    .select()
    .from(adminResidentImpersonations)
    .where(eq(adminResidentImpersonations.id, impersonationId))
    .limit(1);

  if (!row || row.adminId !== adminSession.adminId) {
    await clearImpersonationCookie();
    await expireCustomerSessionKeepRow();
    return { ok: false, error: 'Impersonation session not found.' };
  }

  const now = new Date();
  const durationSeconds = Math.max(
    0,
    Math.floor((now.getTime() - row.startedAt.getTime()) / 1000),
  );

  if (row.status === 'active') {
    await db
      .update(adminResidentImpersonations)
      .set({
        status: 'ended',
        endedAt: now,
        durationSeconds,
        exitReason: args.exitReason ?? 'admin_return',
        updatedAt: now,
      })
      .where(eq(adminResidentImpersonations.id, row.id));

    await writeAuditLogNonBlocking(db, {
      actorType: 'admin',
      actorId: adminSession.adminId,
      entity: 'customer',
      entityId: row.customerId,
      action: 'impersonation_ended',
      diff: {
        impersonationId: row.id,
        durationSeconds,
        exitReason: args.exitReason ?? 'admin_return',
        customerSessionId: row.customerSessionId,
      },
    });
  }

  // Expire (do not delete) so customer_session_id FK on the audit row is preserved.
  await expireCustomerSessionKeepRow();
  await clearImpersonationCookie();

  return { ok: true, redirectTo: row.adminReturnPath };
}

async function loadImpersonationRow(impersonationId: string) {
  const [row] = await db
    .select({
      impersonation: adminResidentImpersonations,
      adminName: adminUsers.fullName,
      residentName: customers.fullName,
      residentPhone: customers.phone,
      bookingCode: bookings.bookingCode,
      pgName: pgs.name,
      roomNumber: rooms.roomNumber,
      bedCode: beds.bedCode,
    })
    .from(adminResidentImpersonations)
    .innerJoin(adminUsers, eq(adminUsers.id, adminResidentImpersonations.adminId))
    .innerJoin(customers, eq(customers.id, adminResidentImpersonations.customerId))
    .leftJoin(bookings, eq(bookings.id, adminResidentImpersonations.bookingId))
    .leftJoin(pgs, eq(pgs.id, adminResidentImpersonations.pgId))
    .leftJoin(rooms, eq(rooms.id, adminResidentImpersonations.roomId))
    .leftJoin(beds, eq(beds.id, adminResidentImpersonations.bedId))
    .where(eq(adminResidentImpersonations.id, impersonationId))
    .limit(1);
  return row ?? null;
}

/** Active impersonation for the current request — resident UI banner + debug panel. */
export const getActiveImpersonationContext = cache(
  async (): Promise<ImpersonationContext | null> => {
    try {
      const jar = await cookies();
      const impersonationId = jar.get(IMPERSONATION_COOKIE)?.value;
      if (!impersonationId) return null;

      const row = await loadImpersonationRow(impersonationId);
      if (!row || row.impersonation.status !== 'active') {
        return null;
      }

      return {
        impersonationId: row.impersonation.id,
        adminId: row.impersonation.adminId,
        adminName: row.adminName,
        adminSessionId: row.impersonation.adminSessionId,
        customerId: row.impersonation.customerId,
        customerSessionId: row.impersonation.customerSessionId,
        residentName: row.residentName,
        residentPhone: row.residentPhone,
        bookingId: row.impersonation.bookingId,
        bookingCode: row.bookingCode,
        pgId: row.impersonation.pgId,
        pgName: row.pgName,
        roomId: row.impersonation.roomId,
        roomNumber: row.roomNumber,
        bedId: row.impersonation.bedId,
        bedCode: row.bedCode,
        reason: row.impersonation.reason,
        startedAt: row.impersonation.startedAt,
        adminReturnPath: row.impersonation.adminReturnPath,
      };
    } catch (err) {
      // Missing impersonation table / cookie edge cases must never break resident pages.
      // Re-throw Next.js dynamic-render signals so routes stay correctly dynamic.
      if (
        typeof err === 'object' &&
        err !== null &&
        'digest' in err &&
        (err as { digest?: string }).digest === 'DYNAMIC_SERVER_USAGE'
      ) {
        throw err;
      }
      const message = err instanceof Error ? err.message : String(err);
      console.error('[auth] getActiveImpersonationContext failed:', message);
      return null;
    }
  },
);

export async function isImpersonationCustomerSession(sessionId: string): Promise<boolean> {
  try {
    const [row] = await db
      .select({ id: adminResidentImpersonations.id })
      .from(adminResidentImpersonations)
      .where(
        and(
          eq(adminResidentImpersonations.customerSessionId, sessionId),
          eq(adminResidentImpersonations.status, 'active'),
        ),
      )
      .limit(1);
    return Boolean(row);
  } catch (err) {
    // Table may be missing pre-migration — never break normal resident sessions.
    const message = err instanceof Error ? err.message : String(err);
    console.error('[auth] isImpersonationCustomerSession failed:', message);
    return false;
  }
}

export async function listImpersonationAuditForCustomer(customerId: string, limit = 20) {
  return db
    .select({
      id: adminResidentImpersonations.id,
      adminName: adminUsers.fullName,
      reason: adminResidentImpersonations.reason,
      status: adminResidentImpersonations.status,
      startedAt: adminResidentImpersonations.startedAt,
      endedAt: adminResidentImpersonations.endedAt,
      durationSeconds: adminResidentImpersonations.durationSeconds,
      exitReason: adminResidentImpersonations.exitReason,
      deviceLabel: adminResidentImpersonations.deviceLabel,
      ip: adminResidentImpersonations.ip,
    })
    .from(adminResidentImpersonations)
    .innerJoin(adminUsers, eq(adminUsers.id, adminResidentImpersonations.adminId))
    .where(eq(adminResidentImpersonations.customerId, customerId))
    .orderBy(desc(adminResidentImpersonations.startedAt))
    .limit(limit);
}

export function residentPortalUrl(): string {
  const base =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ??
    (env.NODE_ENV === 'production' ? 'https://www.awesomepg.in' : 'http://localhost:3000');
  return `${base}${ACCOUNT_RESIDENT_HREF}`;
}
