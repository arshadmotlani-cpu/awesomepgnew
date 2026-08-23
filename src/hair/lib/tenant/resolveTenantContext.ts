import { cookies, headers } from 'next/headers';
import { getHairSession } from '@/src/hair/lib/auth/session';
import { codeTemplateForAccessRole } from '@/src/workforce/permissions/roleTemplates';
import { listMemberships, resolvePermissions } from '@/src/workforce/brains/employeeBrain';
import { loadMembershipForUserOrg } from '@/src/platform/services/memberships';
import { isFyhSaasTenantEnabled, isWorkforceMembershipAuthEnabled } from './flags';
import { FYH_ORG_COOKIE, FYH_LOCATION_COOKIE } from './cookies';
import { resolvePlatformUserIdForHairSession } from './sessionIdentity';
import {
  isSessionHostOrgMismatch,
  parseHairTenantSlug,
  resolveOrganizationBySlug,
} from './subdomain';
import { resolveRequestHostname } from '@/src/hair/lib/host';
import type { TenantContext, MembershipRole } from './types';
import type { WorkforcePermissionKey } from '@/src/workforce/types';

export class TenantContextError extends Error {
  constructor(message = 'Tenant context required') {
    super(message);
    this.name = 'TenantContextError';
  }
}

export class TenantSubscriptionLockedError extends Error {
  constructor(message = 'Subscription required') {
    super(message);
    this.name = 'TenantSubscriptionLockedError';
  }
}

async function resolveUserIdFromSession(
  session: NonNullable<Awaited<ReturnType<typeof getHairSession>>>,
): Promise<string | null> {
  return resolvePlatformUserIdForHairSession({
    workforceEmployeeId: session.workforceEmployeeId,
    adminId: session.admin.id,
    adminEmail: session.admin.email,
  });
}

async function resolveWorkforcePermissions(
  employeeId: string,
  membershipRole: MembershipRole,
): Promise<WorkforcePermissionKey[]> {
  const fallbackRole = membershipRole === 'staff' || membershipRole === 'biller' ? membershipRole : 'manager';
  const memberships = await listMemberships(employeeId);
  const salon = memberships.find((m) => m.engineId === 'fyh_salon') ?? memberships[0];
  if (salon) {
    const grants =
      (await resolvePermissions(employeeId, salon.engineId)) ??
      codeTemplateForAccessRole(salon.jobRole);
    return grants.permissions;
  }
  return codeTemplateForAccessRole(fallbackRole).permissions;
}

function resolveMembershipTemplatePermissions(
  membershipRole: MembershipRole,
): WorkforcePermissionKey[] {
  const accessRole =
    membershipRole === 'owner' || membershipRole === 'co_owner'
      ? 'owner'
      : membershipRole === 'manager'
        ? 'manager'
        : membershipRole === 'biller'
          ? 'biller'
          : 'staff';
  return codeTemplateForAccessRole(accessRole).permissions;
}

/**
 * Phase D: organization_id comes from the server-verified session row.
 * Cookies are mirrors only — a mismatched fyh_org_id is rejected (forge closed).
 */
export async function resolveTenantContext(): Promise<TenantContext | null> {
  if (!isFyhSaasTenantEnabled()) return null;

  const session = await getHairSession();
  if (!session?.organizationId) return null;

  const userId = await resolveUserIdFromSession(session);
  if (!userId) return null;

  const cookieStore = await cookies();
  const orgCookie = cookieStore.get(FYH_ORG_COOKIE)?.value?.trim();
  const locCookie = cookieStore.get(FYH_LOCATION_COOKIE)?.value?.trim();

  if (orgCookie && orgCookie !== session.organizationId) {
    return null;
  }

  // Phase F: tenant subdomain binds org — session must match host slug's org
  const hdrs = await headers();
  const hostSlug =
    hdrs.get('x-hair-tenant-slug')?.trim() ||
    parseHairTenantSlug(resolveRequestHostname(hdrs));
  if (hostSlug) {
    const hostOrg = await resolveOrganizationBySlug(hostSlug);
    if (
      !hostOrg ||
      isSessionHostOrgMismatch(session.organizationId, hostOrg.organizationId)
    ) {
      return null;
    }
  }

  const membershipRow = await loadMembershipForUserOrg(userId, session.organizationId);
  if (!membershipRow) return null;

  const allowedLocationIds = membershipRow.allowedLocationIds;
  let locationId =
    session.locationId && allowedLocationIds.includes(session.locationId)
      ? session.locationId
      : locCookie && allowedLocationIds.includes(locCookie)
        ? locCookie
        : allowedLocationIds[0];
  if (!locationId || !allowedLocationIds.includes(locationId)) {
    locationId = allowedLocationIds[0];
  }
  if (!locationId) return null;

  const membershipRole = (membershipRow.accessRole || membershipRow.role) as MembershipRole;
  const permissions = isWorkforceMembershipAuthEnabled()
    ? resolveMembershipTemplatePermissions(membershipRole)
    : session.workforceEmployeeId
      ? await resolveWorkforcePermissions(session.workforceEmployeeId, membershipRole)
      : resolveMembershipTemplatePermissions(membershipRole);

  return {
    userId,
    organizationId: session.organizationId,
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

/** Pure helper for tests: given session org + optional cookie org, decide if cookie is forge. */
export function isOrgCookieForge(
  sessionOrganizationId: string,
  orgCookie: string | null | undefined,
): boolean {
  const c = orgCookie?.trim();
  return !!c && c !== sessionOrganizationId;
}
