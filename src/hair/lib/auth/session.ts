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
import {
  getWorkforceSession,
  revokeWorkforceSession,
  updateWorkforceSessionTenant,
} from '@/src/workforce/auth/session';
import { listMemberships, resolvePermissions } from '@/src/workforce/brains/employeeBrain';
import { loadLinkedWorkforceEmployee } from '@/src/hair/lib/tenant/sessionIdentity';
import { employeeToHairAdmin } from '@/src/workforce/compat/hairAdminBridge';
import { codeTemplateForAccessRole } from '@/src/workforce/permissions/roleTemplates';
import { isWorkforceMembershipAuthEnabled } from '@/src/hair/lib/tenant/flags';
import {
  listActiveMembershipsForUser,
  loadMembershipForUserOrg,
} from '@/src/platform/services/memberships';

function templateForMembershipRole(role: string) {
  if (role === 'owner' || role === 'co_owner') return codeTemplateForAccessRole('owner');
  if (role === 'manager') return codeTemplateForAccessRole('manager');
  if (role === 'receptionist') return codeTemplateForAccessRole('receptionist');
  if (role === 'biller') return codeTemplateForAccessRole('biller');
  return codeTemplateForAccessRole('staff');
}

export type HairAdmin = typeof fyhAdminUsers.$inferSelect;

export type HairSession = {
  sessionId: string;
  admin: HairAdmin;
  expiresAt: Date;
  rememberMe: boolean;
  workforceEmployeeId?: string;
  /** Phase D SSOT — from session row, not cookie. */
  organizationId: string;
  locationId: string | null;
};

export async function createHairSession(
  adminId: string,
  rememberMe = true,
  opts?: { organizationId?: string; locationId?: string | null },
): Promise<{ token: string; maxAgeDays: number }> {
  const token = randomToken(32);
  const tokenHash = sha256(token);
  const maxAgeDays = rememberMe ? HAIR_SESSION_TTL_DAYS_REMEMBER : HAIR_SESSION_TTL_DAYS;
  const expiresAt = hairSessionExpiry(rememberMe);

  const hdrs = await headers();
  const [admin] = await hairDb
    .select({ organizationId: fyhAdminUsers.organizationId })
    .from(fyhAdminUsers)
    .where(eq(fyhAdminUsers.id, adminId))
    .limit(1);
  const organizationId = opts?.organizationId ?? admin?.organizationId;
  if (!organizationId) {
    throw new Error('Admin user is missing organization_id');
  }

  await hairDb.insert(fyhAuthSessions).values({
    adminUserId: adminId,
    organizationId,
    locationId: opts?.locationId ?? null,
    tokenHash,
    expiresAt,
    ipAddress: hdrs.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    userAgent: hdrs.get('user-agent'),
  });

  return { token, maxAgeDays };
}

export async function updateHairSessionTenant(input: {
  sessionId: string;
  organizationId: string;
  locationId?: string | null;
}): Promise<void> {
  if (isWorkforceEngineEnabled()) {
    await updateWorkforceSessionTenant(input);
    // Also update legacy fyh session row if present for this session id
  }
  await hairDb
    .update(fyhAuthSessions)
    .set({
      organizationId: input.organizationId,
      locationId: input.locationId ?? null,
    })
    .where(and(eq(fyhAuthSessions.id, input.sessionId), isNull(fyhAuthSessions.revokedAt)));
}

export async function getHairSession(): Promise<HairSession | null> {
  if (isWorkforceEngineEnabled()) {
    const wf = await getWorkforceSession();
    if (wf) {
      let grants = codeTemplateForAccessRole('staff');
      if (isWorkforceMembershipAuthEnabled() && wf.employee.userId) {
        const membership = await loadMembershipForUserOrg(
          wf.employee.userId,
          wf.organizationId,
        );
        const membershipsForUser = membership
          ? []
          : await listActiveMembershipsForUser(wf.employee.userId);
        const effectiveMembership =
          membership ?? (membershipsForUser.length === 1 ? membershipsForUser[0] : null);
        grants = templateForMembershipRole(
          effectiveMembership?.accessRole || effectiveMembership?.role || 'staff',
        );
      } else {
        const memberships = await listMemberships(wf.employee.id);
        const salon = memberships.find((m) => m.engineId === 'fyh_salon') ?? memberships[0];
        grants = salon
          ? (await resolvePermissions(wf.employee.id, salon.engineId)) ??
            codeTemplateForAccessRole(salon.jobRole)
          : codeTemplateForAccessRole('staff');
      }
      return {
        sessionId: wf.sessionId,
        admin: employeeToHairAdmin(wf.employee, grants),
        expiresAt: wf.expiresAt,
        rememberMe: wf.rememberMe,
        workforceEmployeeId: wf.employee.id,
        organizationId: wf.organizationId,
        locationId: wf.locationId,
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
      organizationId: fyhAuthSessions.organizationId,
      locationId: fyhAuthSessions.locationId,
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

  if (!row || !row.organizationId) return null;

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
  }

  const linked = await loadLinkedWorkforceEmployee({
    adminId: row.admin.id,
    adminEmail: row.admin.email,
  });

  return {
    sessionId: row.sessionId,
    admin: row.admin,
    expiresAt,
    rememberMe,
    workforceEmployeeId: linked?.id,
    organizationId: row.organizationId,
    locationId: row.locationId ?? null,
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
