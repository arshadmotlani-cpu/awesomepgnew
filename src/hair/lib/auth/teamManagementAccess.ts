import { redirect } from 'next/navigation';
import { requireHairAuthPage } from '@/src/hair/lib/auth/guards';
import { getHairSession } from '@/src/hair/lib/auth/session';
import { getTenantContextForPage } from '@/src/hair/lib/tenant/getTenantContext';
import { isFyhSaasTenantEnabled, isWorkforceMembershipAuthEnabled } from '@/src/hair/lib/tenant/flags';
import type { MembershipRole } from '@/src/hair/lib/tenant/types';
import type { PlatformMembershipRole } from '@/src/platform/db/schema';
import { getEmployeeDashboard } from '@/src/workforce/brains/employeeBrain';
import { hasWorkforcePermission } from '@/src/workforce/permissions/presets';
import type { WorkforcePermissionGrants } from '@/src/workforce/types';

export class TeamManagementError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TeamManagementError';
  }
}

export type TeamManagementAccess = {
  membershipRole: MembershipRole;
  organizationId: string;
  userId: string;
  membershipId: string;
  canView: boolean;
  canInvite: boolean;
  canEdit: boolean;
  canDeactivate: boolean;
  allowedAssignRoles: PlatformMembershipRole[];
};

const OWNER_ASSIGN_ROLES: PlatformMembershipRole[] = [
  'owner',
  'co_owner',
  'manager',
  'biller',
  'staff',
];
const MANAGER_ASSIGN_ROLES: PlatformMembershipRole[] = ['manager', 'biller', 'staff'];

export function allowedAssignRolesForMembershipRole(role: MembershipRole): PlatformMembershipRole[] {
  if (role === 'owner' || role === 'co_owner') return OWNER_ASSIGN_ROLES;
  if (role === 'manager') return MANAGER_ASSIGN_ROLES;
  return [];
}

export function canAssignTeamRole(
  actorRole: MembershipRole,
  targetRole: PlatformMembershipRole,
): boolean {
  return allowedAssignRolesForMembershipRole(actorRole).includes(targetRole);
}

function grantsFromSession(session: Awaited<ReturnType<typeof getHairSession>>): WorkforcePermissionGrants | null {
  if (!session) return null;
  const permissions = Array.isArray(session.admin.permissions)
    ? (session.admin.permissions as WorkforcePermissionGrants['permissions'])
    : [];
  return { permissions, maxBackdateDays: null };
}

export function teamCapsForMembershipRole(
  role: MembershipRole,
  grants: WorkforcePermissionGrants | null,
): Omit<TeamManagementAccess, 'organizationId' | 'userId' | 'membershipId' | 'membershipRole'> & {
  canView: boolean;
} {
  if (role === 'owner' || role === 'co_owner') {
    return {
      canView: true,
      canInvite: true,
      canEdit: true,
      canDeactivate: true,
      allowedAssignRoles: OWNER_ASSIGN_ROLES,
    };
  }

  if (role === 'manager') {
    const canView = grants ? hasWorkforcePermission(grants, 'staff.view') : true;
    const canInvite = grants ? hasWorkforcePermission(grants, 'staff.add') : true;
    const canEdit = grants ? hasWorkforcePermission(grants, 'staff.edit') : true;
    return {
      canView,
      canInvite,
      canEdit,
      canDeactivate: canEdit,
      allowedAssignRoles: MANAGER_ASSIGN_ROLES,
    };
  }

  return {
    canView: false,
    canInvite: false,
    canEdit: false,
    canDeactivate: false,
    allowedAssignRoles: [],
  };
}

async function resolveWorkforceGrants(
  session: Awaited<ReturnType<typeof getHairSession>>,
): Promise<WorkforcePermissionGrants | null> {
  if (!session?.workforceEmployeeId) return grantsFromSession(session);
  if (isWorkforceMembershipAuthEnabled()) return grantsFromSession(session);
  const dash = await getEmployeeDashboard(session.workforceEmployeeId, 'fyh_salon');
  return dash?.grants ?? grantsFromSession(session);
}

export async function canViewTeamManagement(): Promise<boolean> {
  if (!isFyhSaasTenantEnabled()) return false;
  const ctx = await getTenantContextForPage();
  if (!ctx) return false;
  const session = await getHairSession();
  const grants = await resolveWorkforceGrants(session);
  return teamCapsForMembershipRole(ctx.membershipRole, grants).canView;
}

export async function requireTeamManagementAccess(): Promise<TeamManagementAccess> {
  if (!isFyhSaasTenantEnabled()) redirect('/staff');

  await requireHairAuthPage();
  const ctx = await getTenantContextForPage();
  if (!ctx) redirect('/select-organization');

  const session = await getHairSession();
  const grants = await resolveWorkforceGrants(session);
  const caps = teamCapsForMembershipRole(ctx.membershipRole, grants);
  if (!caps.canView) redirect('/me');

  return {
    membershipRole: ctx.membershipRole,
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    membershipId: ctx.membershipId,
    canView: true,
    canInvite: caps.canInvite,
    canEdit: caps.canEdit,
    canDeactivate: caps.canDeactivate,
    allowedAssignRoles: caps.allowedAssignRoles,
  };
}

export async function requireTeamInviteAccess(): Promise<TeamManagementAccess> {
  const access = await requireTeamManagementAccess();
  if (!access.canInvite) throw new TeamManagementError('Missing permission to invite team members');
  return access;
}

export async function requireTeamEditAccess(): Promise<TeamManagementAccess> {
  const access = await requireTeamManagementAccess();
  if (!access.canEdit) throw new TeamManagementError('Missing permission to edit team members');
  return access;
}
