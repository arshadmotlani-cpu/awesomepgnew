import { cookies, headers } from 'next/headers';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import { fyhAdminUsers, fyhAuthSessions } from '@/src/hair/db/schema';
import {
  HAIR_SESSION_COOKIE,
  HAIR_SESSION_TTL_DAYS,
  HAIR_SESSION_TTL_DAYS_REMEMBER,
} from './constants';
import { randomToken, sha256 } from './crypto';
import {
  hairSessionExpiry,
  shouldRefreshHairSession,
} from './sessionPolicy';
import { isWorkforceEngineEnabled } from '@/src/workforce/types';
import { getWorkforceSession, revokeWorkforceSession } from '@/src/workforce/auth/session';
import { listMemberships, resolvePermissions } from '@/src/workforce/brains/employeeBrain';
import { employeeToHairAdmin } from '@/src/workforce/compat/hairAdminBridge';
import { codeTemplateForAccessRole } from '@/src/workforce/permissions/roleTemplates';

export type HairAdmin = typeof fyhAdminUsers.$inferSelect;

export type HairSession = {
  sessionId: string;
  admin: HairAdmin;
  expiresAt: Date;
  rememberMe: boolean;
  /** Present when authenticated via Workforce Engine */
  workforceEmployeeId?: string;
};

export async function createHairSession(
  adminId: string,
  rememberMe = true,
): Promise<{ token: string; maxAgeDays: number }> {
  const token = randomToken(32);
  const tokenHash = sha256(token);
  const maxAgeDays = rememberMe ? HAIR_SESSION_TTL_DAYS_REMEMBER : HAIR_SESSION_TTL_DAYS;
  const expiresAt = hairSessionExpiry(rememberMe);

  const hdrs = await headers();
  await hairDb.insert(fyhAuthSessions).values({
    adminUserId: adminId,
    tokenHash,
    expiresAt,
    ipAddress: hdrs.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    userAgent: hdrs.get('user-agent'),
  });

  return { token, maxAgeDays };
}

export async function getHairSession(): Promise<HairSession | null> {
  if (isWorkforceEngineEnabled()) {
    const wf = await getWorkforceSession();
    if (wf) {
      const memberships = await listMemberships(wf.employee.id);
      const salon = memberships.find((m) => m.engineId === 'fyh_salon') ?? memberships[0];
      const grants = salon
        ? (await resolvePermissions(wf.employee.id, salon.engineId)) ??
          codeTemplateForAccessRole(salon.jobRole)
        : codeTemplateForAccessRole('staff');
      return {
        sessionId: wf.sessionId,
        admin: employeeToHairAdmin(wf.employee, grants),
        expiresAt: wf.expiresAt,
        rememberMe: wf.rememberMe,
        workforceEmployeeId: wf.employee.id,
      };
    }
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(HAIR_SESSION_COOKIE)?.value;
  if (!token) return null;

  const tokenHash = sha256(token);
  const now = new Date();

  const [row] = await hairDb
    .select({
      sessionId: fyhAuthSessions.id,
      expiresAt: fyhAuthSessions.expiresAt,
      createdAt: fyhAuthSessions.createdAt,
      admin: fyhAdminUsers,
    })
    .from(fyhAuthSessions)
    .innerJoin(fyhAdminUsers, eq(fyhAuthSessions.adminUserId, fyhAdminUsers.id))
    .where(
      and(
        eq(fyhAuthSessions.tokenHash, tokenHash),
        gt(fyhAuthSessions.expiresAt, now),
        isNull(fyhAuthSessions.revokedAt),
      ),
    )
    .limit(1);

  if (!row) return null;

  const rememberMe =
    row.expiresAt.getTime() - row.createdAt.getTime() >
    HAIR_SESSION_TTL_DAYS * 86_400_000;

  let expiresAt = row.expiresAt;
  if (shouldRefreshHairSession(expiresAt, rememberMe, now)) {
    expiresAt = hairSessionExpiry(rememberMe, now);
    await hairDb
      .update(fyhAuthSessions)
      .set({ expiresAt })
      .where(eq(fyhAuthSessions.id, row.sessionId));
    // Cookie refresh must not run during RSC render (Next.js restriction).
    // DB expiry is authoritative; cookie maxAge is set at login.
  }

  return {
    sessionId: row.sessionId,
    admin: row.admin,
    expiresAt,
    rememberMe,
  };
}

export async function revokeHairSession(): Promise<void> {
  if (isWorkforceEngineEnabled()) {
    await revokeWorkforceSession();
  }
  const cookieStore = await cookies();
  const token = cookieStore.get(HAIR_SESSION_COOKIE)?.value;
  if (!token) return;

  const tokenHash = sha256(token);
  await hairDb
    .update(fyhAuthSessions)
    .set({ revokedAt: new Date() })
    .where(eq(fyhAuthSessions.tokenHash, tokenHash));
}

export function hairSessionCookieOptions(secure: boolean, maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: maxAgeSeconds,
  };
}
