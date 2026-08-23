import { cookies, headers } from 'next/headers';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import { wfAuthSessions, wfEmployees, type WfEmployee } from '@/src/workforce/db/schema';
import {
  HAIR_SESSION_COOKIE,
  HAIR_SESSION_TTL_DAYS,
  HAIR_SESSION_TTL_DAYS_REMEMBER,
} from '@/src/hair/lib/auth/constants';
import { randomToken, sha256 } from '@/src/hair/lib/auth/crypto';
import {
  hairSessionExpiry,
  shouldRefreshHairSession,
} from '@/src/hair/lib/auth/sessionPolicy';
import type { WorkforceEngineId } from '@/src/workforce/types';
import { publishEmployeeEvent } from '@/src/workforce/events/publish';

export type WorkforceSession = {
  sessionId: string;
  employee: WfEmployee;
  expiresAt: Date;
  rememberMe: boolean;
  activeEngineId: WorkforceEngineId | null;
};

export async function createWorkforceSession(
  employeeId: string,
  rememberMe = true,
  activeEngineId: WorkforceEngineId | null = 'fyh_salon',
): Promise<{ token: string; maxAgeDays: number }> {
  const token = randomToken(32);
  const tokenHash = sha256(token);
  const maxAgeDays = rememberMe ? HAIR_SESSION_TTL_DAYS_REMEMBER : HAIR_SESSION_TTL_DAYS;
  const expiresAt = hairSessionExpiry(rememberMe);
  const hdrs = await headers();
  const [employee] = await hairDb
    .select({ organizationId: wfEmployees.organizationId })
    .from(wfEmployees)
    .where(eq(wfEmployees.id, employeeId))
    .limit(1);
  if (!employee?.organizationId) {
    throw new Error('Employee is missing organization_id');
  }

  await hairDb.insert(wfAuthSessions).values({
    employeeId,
    organizationId: employee.organizationId,
    tokenHash,
    expiresAt,
    activeEngineId,
    ipAddress: hdrs.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    userAgent: hdrs.get('user-agent'),
  });

  await publishEmployeeEvent({
    eventType: 'employee.login',
    employeeId,
    engineId: activeEngineId ?? undefined,
    sourceRef: 'workforce.auth.createSession',
  });

  return { token, maxAgeDays };
}

export async function getWorkforceSession(): Promise<WorkforceSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(HAIR_SESSION_COOKIE)?.value;
  if (!token) return null;

  const tokenHash = sha256(token);
  const now = new Date();

  const [row] = await hairDb
    .select({
      sessionId: wfAuthSessions.id,
      expiresAt: wfAuthSessions.expiresAt,
      createdAt: wfAuthSessions.createdAt,
      activeEngineId: wfAuthSessions.activeEngineId,
      employee: wfEmployees,
    })
    .from(wfAuthSessions)
    .innerJoin(wfEmployees, eq(wfAuthSessions.employeeId, wfEmployees.id))
    .where(
      and(
        eq(wfAuthSessions.tokenHash, tokenHash),
        gt(wfAuthSessions.expiresAt, now),
        isNull(wfAuthSessions.revokedAt),
      ),
    )
    .limit(1);

  if (!row) return null;
  if (row.employee.status !== 'active' || !row.employee.canLogin) return null;

  const rememberMe =
    row.expiresAt.getTime() - row.createdAt.getTime() >
    HAIR_SESSION_TTL_DAYS * 86_400_000;

  let expiresAt = row.expiresAt;
  if (shouldRefreshHairSession(expiresAt, rememberMe, now)) {
    expiresAt = hairSessionExpiry(rememberMe, now);
    await hairDb
      .update(wfAuthSessions)
      .set({ expiresAt })
      .where(eq(wfAuthSessions.id, row.sessionId));
  }

  return {
    sessionId: row.sessionId,
    employee: row.employee,
    expiresAt,
    rememberMe,
    activeEngineId: (row.activeEngineId as WorkforceEngineId | null) ?? null,
  };
}

export async function revokeWorkforceSession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(HAIR_SESSION_COOKIE)?.value;
  if (!token) return;
  const tokenHash = sha256(token);
  const [row] = await hairDb
    .select({ id: wfAuthSessions.id, employeeId: wfAuthSessions.employeeId })
    .from(wfAuthSessions)
    .where(and(eq(wfAuthSessions.tokenHash, tokenHash), isNull(wfAuthSessions.revokedAt)))
    .limit(1);
  if (!row) return;
  await hairDb
    .update(wfAuthSessions)
    .set({ revokedAt: new Date() })
    .where(eq(wfAuthSessions.id, row.id));
  await publishEmployeeEvent({
    eventType: 'employee.logout',
    employeeId: row.employeeId,
    sourceRef: 'workforce.auth.revokeSession',
  });
}

export { hairSessionCookieOptions } from '@/src/hair/lib/auth/session';
