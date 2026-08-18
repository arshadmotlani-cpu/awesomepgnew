import { cookies } from 'next/headers';
import { eq } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import { wfEmployees } from '@/src/workforce/db/schema';
import { getHairSession } from '@/src/hair/lib/auth/session';
import { employeeToHairAdmin } from '@/src/workforce/compat/hairAdminBridge';
import { codeTemplateForAccessRole } from '@/src/workforce/permissions/roleTemplates';
import { listMemberships, resolvePermissions } from '@/src/workforce/brains/employeeBrain';
import {
  listActiveMembershipsForUser,
  loadMembershipForUserOrg,
} from '@/src/platform/services/memberships';
import { isFyhSaasTenantEnabled, isWorkforceMembershipAuthEnabled } from './flags';
import { FYH_ORG_COOKIE, FYH_LOCATION_COOKIE } from './cookies';
import type { TenantContext, MembershipRole } from './types';
import type { WorkforcePermissionKey } from '@/src/workforce/types';

export class TenantContextError extends Error {
  constructor(message = 'Tenant context required') {
    super(message);
    this.name = 'TenantContextError';
  }
}

async function resolveUserIdFromSession(
  session: NonNullable<Awaited<ReturnType<typeof getHairSession>>>,
): Promise<string | null> {
  if (session.workforceEmployeeId) {
    const [emp] = await hairDb
      .select({ userId: wfEmployees.userId })
      .from(wfEmployees)
      .where(eq(wfEmployees.id, session.workforceEmployeeId))
      .limit(1);
    if (emp?.userId) return emp.userId;
  }
  return null;
}

async function resolveWorkforcePermissions(
  employeeId: string,
  membershipRole: MembershipRole,
): Promise<WorkforcePermissionKey[]> {
  const memberships = await listMemberships(employeeId);
  const salon = memberships.find((m) => m.engineId === 'fyh_salon') ?? memberships[0];
  if (salon) {
    const grants =
      (await resolvePermissions(employeeId, salon.engineId)) ??
      codeTemplateForAccessRole(salon.jobRole);
    return grants;
  }
  return codeTemplateForAccessRole(membershipRole === 'staff' ? 'staff' : 'manager');
}

/**
 * Returns tenant context when SaaS flag is on and resolution succeeds; null when flag off.
 */
export async function resolveTenantContext(): Promise<TenantContext | null> {
  if (!isFyhSaasTenantEnabled()) return null;

  const session = await getHairSession();
  if (!session) return null;

  const userId = await resolveUserIdFromSession(session);
  if (!userId) return null;

  const cookieStore = await cookies();
  const orgCookie = cookieStore.get(FYH_ORG_COOKIE)?.value?.trim();
  const locCookie = cookieStore.get(FYH_LOCATION_COOKIE)?.value?.trim();

  let membershipRow: Awaited<ReturnType<typeof loadMembershipForUserOrg>> = null;
  if (orgCookie) {
    membershipRow = await loadMembershipForUserOrg(userId, orgCookie);
  } else {
    const all = await listActiveMembershipsForUser(userId);
    if (all.length === 1) {
      membershipRow = all[0];
    }
  }

  if (!membershipRow) return null;

  const allowedLocationIds = membershipRow.allowedLocationIds;
  let locationId = locCookie ?? allowedLocationIds[0];
  if (!locationId || !allowedLocationIds.includes(locationId)) {
    locationId = allowedLocationIds[0];
  }
  if (!locationId) return null;

  const membershipRole = membershipRow.role as MembershipRole;
  const permissions = session.workforceEmployeeId
    ? await resolveWorkforcePermissions(session.workforceEmployeeId, membershipRole)
    : codeTemplateForAccessRole('manager');

  return {
    userId,
    organizationId: membershipRow.organizationId,
    locationId,
    membershipId: membershipRow.membershipId,
    membershipRole,
    allowedLocationIds,
    permissions,
    employeeId: session.workforceEmployeeId,
    legacyAdminId: session.admin.id,
  };
}

export async function resolveTenantContextOptional(): Promise<TenantContext | null> {
  try {
    return await resolveTenantContext();
  } catch {
    return null;
  }
}
