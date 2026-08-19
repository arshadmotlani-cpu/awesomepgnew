import { and, eq, inArray } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import { wfEmployees, wfEngineMemberships } from '@/src/workforce/db/schema';
import type { PlatformMembershipRole } from '@/src/platform/db/schema';
import {
  createMemberInvitation,
  updateMemberAccess,
} from '@/src/platform/services/admin';
import {
  listSalonPendingInvitations,
  listSalonTeamLocations,
  listSalonTeamMembers,
  type SalonTeamInvitationRow,
  type SalonTeamLocationOption,
} from '@/src/platform/services/salonTeam';
import type { TenantContext } from '@/src/hair/lib/tenant/types';
import { isFyhSaasTenantEnabled } from '@/src/hair/lib/tenant/flags';
import { hasPlatformDatabaseUrl } from '@/src/platform/lib/db/env';
import { orgFilter } from '@/src/hair/lib/tenant/filters';

export type TeamMemberRow = {
  membershipId: string;
  userId: string;
  email: string;
  fullName: string | null;
  mobile: string | null;
  accessRole: PlatformMembershipRole;
  isActive: boolean;
  locationIds: string[];
  locationNames: string[];
};

export type TeamLocationOption = SalonTeamLocationOption;
export type TeamInvitationRow = SalonTeamInvitationRow;

async function syncWorkforceForMembership(input: {
  organizationId: string;
  userId: string;
  accessRole: PlatformMembershipRole;
  isActive: boolean;
  fullName?: string | null;
  email?: string | null;
  mobile?: string | null;
}) {
  const [employee] = await hairDb
    .select()
    .from(wfEmployees)
    .where(eq(wfEmployees.userId, input.userId))
    .limit(1);

  const jobRole = input.accessRole === 'co_owner' ? 'owner' : input.accessRole;
  const rank =
    input.accessRole === 'owner' || input.accessRole === 'co_owner'
      ? 'owner'
      : input.accessRole === 'manager'
        ? 'manager'
        : 'team_member';

  if (!employee) return;

  await hairDb
    .update(wfEmployees)
    .set({
      organizationId: input.organizationId,
      fullName: input.fullName?.trim() || employee.fullName,
      email: input.email?.trim() || employee.email,
      mobile: input.mobile?.trim() || employee.mobile,
      canLogin: input.isActive,
      status: input.isActive ? 'active' : 'inactive',
      updatedAt: new Date(),
    })
    .where(eq(wfEmployees.id, employee.id));

  const [engineMembership] = await hairDb
    .select()
    .from(wfEngineMemberships)
    .where(eq(wfEngineMemberships.employeeId, employee.id))
    .limit(1);

  if (engineMembership) {
    await hairDb
      .update(wfEngineMemberships)
      .set({
        organizationId: input.organizationId,
        rank,
        jobRole,
        isActive: input.isActive,
        updatedAt: new Date(),
      })
      .where(eq(wfEngineMemberships.id, engineMembership.id));
  }
}

async function enrichMembersWithWorkforce(
  ctx: TenantContext,
  members: Awaited<ReturnType<typeof listSalonTeamMembers>>,
): Promise<TeamMemberRow[]> {
  const userIds = members.map((m) => m.userId);
  const employees =
    userIds.length > 0
      ? await hairDb
          .select({
            userId: wfEmployees.userId,
            fullName: wfEmployees.fullName,
            mobile: wfEmployees.mobile,
          })
          .from(wfEmployees)
          .where(
            and(
              inArray(wfEmployees.userId, userIds),
              orgFilter(wfEmployees.organizationId, ctx),
            ),
          )
      : [];
  const employeeByUser = new Map(employees.map((e) => [e.userId, e]));

  return members.map((member) => {
    const employee = employeeByUser.get(member.userId);
    return {
      ...member,
      fullName: employee?.fullName ?? null,
      mobile: employee?.mobile ?? null,
    };
  });
}

export async function listTeamLocations(ctx: TenantContext): Promise<TeamLocationOption[]> {
  return listSalonTeamLocations(ctx.organizationId);
}

export async function listTeamMembers(ctx: TenantContext): Promise<TeamMemberRow[]> {
  const members = await listSalonTeamMembers(ctx.organizationId);
  return enrichMembersWithWorkforce(ctx, members);
}

export async function getTeamMember(
  ctx: TenantContext,
  membershipId: string,
): Promise<TeamMemberRow | null> {
  const members = await listTeamMembers(ctx);
  return members.find((m) => m.membershipId === membershipId) ?? null;
}

export async function listPendingTeamInvitations(ctx: TenantContext): Promise<TeamInvitationRow[]> {
  return listSalonPendingInvitations(ctx.organizationId);
}

export async function inviteTeamMember(input: {
  ctx: TenantContext;
  email: string;
  accessRole: PlatformMembershipRole;
  locationIds: string[];
  invitedByUserId: string;
}): Promise<{ token: string }> {
  if (!isFyhSaasTenantEnabled()) throw new Error('Team invitations require SaaS tenant mode');
  const allowedLocationIds = new Set(
    (await listTeamLocations(input.ctx))
      .filter((l) => l.isActive)
      .map((l) => l.locationId),
  );
  const locationIds = input.locationIds.filter((id) => allowedLocationIds.has(id));
  if (locationIds.length === 0) throw new Error('Select at least one active location');

  const result = await createMemberInvitation({
    organizationId: input.ctx.organizationId,
    email: input.email,
    accessRole: input.accessRole,
    locationIds,
    invitedByUserId: input.invitedByUserId,
  });
  return { token: result.token };
}

export async function updateTeamMember(input: {
  ctx: TenantContext;
  membershipId: string;
  accessRole: PlatformMembershipRole;
  locationIds: string[];
  isActive: boolean;
  fullName?: string | null;
  mobile?: string | null;
}): Promise<void> {
  if (!hasPlatformDatabaseUrl()) throw new Error('Platform database is not configured');

  const member = await getTeamMember(input.ctx, input.membershipId);
  if (!member) throw new Error('Team member not found in this organization');

  const allowedLocationIds = new Set(
    (await listTeamLocations(input.ctx))
      .filter((l) => l.isActive)
      .map((l) => l.locationId),
  );
  const locationIds = input.locationIds.filter((id) => allowedLocationIds.has(id));
  if (locationIds.length === 0 && input.isActive) {
    throw new Error('Active members must have at least one location');
  }

  await updateMemberAccess({
    membershipId: input.membershipId,
    accessRole: input.accessRole,
    locationIds,
    isActive: input.isActive,
  });

  await syncWorkforceForMembership({
    organizationId: input.ctx.organizationId,
    userId: member.userId,
    accessRole: input.accessRole,
    isActive: input.isActive,
    fullName: input.fullName ?? member.fullName,
    email: member.email,
    mobile: input.mobile ?? member.mobile,
  });
}
