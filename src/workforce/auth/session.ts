import { cookies, headers } from 'next/headers';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import { wfAuthSessions, wfEmployees, type WfEmployee } from '@/src/workforce/db/schema';
import {
  HAIR_SESSION_COOKIE,
  WORKFORCE_SESSION_TTL_DAYS,
} from '@/src/hair/lib/auth/constants';
import { randomToken, sha256 } from '@/src/hair/lib/auth/crypto';
import { workforceSessionExpiry, workforceSessionMs } from '@/src/workforce/auth/sessionPolicy';
import { shouldSlideSessionExpiry } from '@/src/lib/auth/sessionSliding';

const REFRESH_THRESHOLD_DAYS = 7;
const REFRESH_MIN_HOURS = 24;

function lastWorkforceSessionSlideAt(expiresAt: Date): Date {
  return new Date(expiresAt.getTime() - workforceSessionMs());
}

export function shouldRefreshWorkforceSession(expiresAt: Date, now = new Date()): boolean {
  return shouldSlideSessionExpiry({
    expiresAt,
    lastSeenAt: lastWorkforceSessionSlideAt(expiresAt),
    refreshThresholdMs: REFRESH_THRESHOLD_DAYS * 86_400_000,
    refreshMinIntervalMs: REFRESH_MIN_HOURS * 3_600_000,
    now,
  });
}
import type { WorkforceEngineId } from '@/src/workforce/types';
import { publishEmployeeEvent } from '@/src/workforce/events/publish';

export type WorkforceSession = {
  sessionId: string;
  employee: WfEmployee;
  expiresAt: Date;
  rememberMe: boolean;
  activeEngineId: WorkforceEngineId | null;
  /** Phase D SSOT — from session row, not cookie. */
  organizationId: string;
  locationId: string | null;
};

export async function createWorkforceSession(
  employeeId: string,
  _rememberMe = true,
  activeEngineId: WorkforceEngineId | null = 'fyh_salon',
  opts?: { organizationId?: string; locationId?: string | null },
): Promise<{ token: string; maxAgeDays: number }> {
  const token = randomToken(32);
  const tokenHash = sha256(token);
  const maxAgeDays = WORKFORCE_SESSION_TTL_DAYS;
  const expiresAt = workforceSessionExpiry();
  const hdrs = await headers();
  const [employee] = await hairDb
    .select({ organizationId: wfEmployees.organizationId })
    .from(wfEmployees)
    .where(eq(wfEmployees.id, employeeId))
    .limit(1);
  const organizationId = opts?.organizationId ?? employee?.organizationId;
  if (!organizationId) {
    throw new Error('Employee is missing organization_id');
  }

  await hairDb.insert(wfAuthSessions).values({
    employeeId,
    organizationId,
    locationId: opts?.locationId ?? null,
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

export async function updateWorkforceSessionTenant(input: {
  sessionId: string;
  organizationId: string;
  locationId?: string | null;
}): Promise<void> {
  await hairDb
    .update(wfAuthSessions)
    .set({
      organizationId: input.organizationId,
      locationId: input.locationId ?? null,
    })
    .where(and(eq(wfAuthSessions.id, input.sessionId), isNull(wfAuthSessions.revokedAt)));
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
      organizationId: wfAuthSessions.organizationId,
      locationId: wfAuthSessions.locationId,
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
  if (!row.organizationId) return null;

  const rememberMe = true;

  let expiresAt = row.expiresAt;
  if (shouldRefreshWorkforceSession(expiresAt, now)) {
    expiresAt = workforceSessionExpiry(now);
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
    organizationId: row.organizationId,
    locationId: row.locationId ?? null,
  };
}

export async function revokeWorkforceSession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(HAIR_SESSION_COOKIE)?.value;
  if (!token) return;
  const tokenHash = sha256(token);
  await hairDb
    .update(wfAuthSessions)
    .set({ revokedAt: new Date() })
    .where(eq(wfAuthSessions.tokenHash, tokenHash));
}
