import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import { createPlatformClient } from '@/src/platform/db/client';
import { resolvePlatformAccessRoleFromWorkforce } from '@/src/platform/lib/bootstrapAccessRole';
import {
  platformLocations,
  platformMembershipLocations,
  platformMemberships,
  platformOrganizations,
  platformUsers,
  type PlatformMembershipRole,
} from '@/src/platform/db/schema';
import { wfEmployees, wfEngineMemberships } from '@/src/workforce/db/schema';

export type LinkWorkforceEmployeeInput = {
  employeeEmail: string;
  organizationSlug: string;
  accessRole?: PlatformMembershipRole;
};

export type LinkWorkforceEmployeePlan = {
  employeeId: string;
  employeeEmail: string;
  organizationId: string;
  organizationSlug: string;
  locationId: string;
  accessRole: PlatformMembershipRole;
  existingPlatformUserId: string | null;
  existingMembershipId: string | null;
  willCreatePlatformUser: boolean;
  willCreateMembership: boolean;
  willLinkEmployeeUserId: boolean;
};

export type LinkWorkforceEmployeeResult = LinkWorkforceEmployeePlan & {
  userId: string;
  membershipId: string;
  createdPlatformUser: boolean;
  createdMembership: boolean;
};

function workforceRankForAccessRole(accessRole: PlatformMembershipRole): {
  rank: typeof wfEngineMemberships.$inferInsert.rank;
  jobRole: typeof wfEngineMemberships.$inferInsert.jobRole;
} {
  const jobRole = accessRole === 'co_owner' ? 'owner' : accessRole;
  const rank =
    accessRole === 'owner' || accessRole === 'co_owner'
      ? 'owner'
      : accessRole === 'manager'
        ? 'manager'
        : 'team_member';
  return { rank, jobRole };
}

export async function planWorkforceEmployeePlatformLink(
  input: LinkWorkforceEmployeeInput,
): Promise<LinkWorkforceEmployeePlan> {
  const email = input.employeeEmail.trim().toLowerCase();
  const platform = createPlatformClient({ max: 1 });
  try {
    const [org] = await platform.db
      .select()
      .from(platformOrganizations)
      .where(eq(platformOrganizations.slug, input.organizationSlug))
      .limit(1);
    if (!org) throw new Error(`Organization slug not found: ${input.organizationSlug}`);

    const locations = await platform.db
      .select()
      .from(platformLocations)
      .where(eq(platformLocations.organizationId, org.id));
    const location = locations.find((row) => row.isPrimary) ?? locations[0];
    if (!location) throw new Error(`No location for organization ${org.slug}`);

    const [employee] = await hairDb
      .select()
      .from(wfEmployees)
      .where(eq(wfEmployees.email, email))
      .limit(1);
    if (!employee) throw new Error(`Workforce employee not found: ${email}`);
    if (!employee.canLogin) throw new Error(`Workforce employee cannot login: ${email}`);

    const [engine] = await hairDb
      .select()
      .from(wfEngineMemberships)
      .where(eq(wfEngineMemberships.employeeId, employee.id))
      .limit(1);

    const accessRole =
      input.accessRole ??
      resolvePlatformAccessRoleFromWorkforce({
        rank: engine?.rank,
        jobRole: engine?.jobRole,
      });

    const [platformUserByEmail] = await platform.db
      .select({ id: platformUsers.id })
      .from(platformUsers)
      .where(eq(platformUsers.email, email))
      .limit(1);

    const linkedUserId = employee.userId ?? platformUserByEmail?.id ?? null;
    const [existingMembership] = linkedUserId
      ? await platform.db
          .select({ id: platformMemberships.id })
          .from(platformMemberships)
          .where(
            and(
              eq(platformMemberships.userId, linkedUserId),
              eq(platformMemberships.organizationId, org.id),
            ),
          )
          .limit(1)
      : [];

    return {
      employeeId: employee.id,
      employeeEmail: email,
      organizationId: org.id,
      organizationSlug: org.slug,
      locationId: location.id,
      accessRole,
      existingPlatformUserId: linkedUserId,
      existingMembershipId: existingMembership?.id ?? null,
      willCreatePlatformUser: !linkedUserId,
      willCreateMembership: !existingMembership,
      willLinkEmployeeUserId: !employee.userId,
    };
  } finally {
    await platform.close();
  }
}

export async function linkWorkforceEmployeeToPlatformOrg(
  input: LinkWorkforceEmployeeInput,
): Promise<LinkWorkforceEmployeeResult> {
  const plan = await planWorkforceEmployeePlatformLink(input);
  const email = plan.employeeEmail;
  const platform = createPlatformClient({ max: 1 });

  try {
    const [employee] = await hairDb
      .select()
      .from(wfEmployees)
      .where(eq(wfEmployees.id, plan.employeeId))
      .limit(1);
    if (!employee) throw new Error(`Workforce employee not found: ${email}`);

    let userId = employee.userId ?? plan.existingPlatformUserId;
    let createdPlatformUser = false;

    if (!userId) {
      const [created] = await platform.db
        .insert(platformUsers)
        .values({
          email,
          passwordHash: employee.passwordHash,
          status: 'active',
        })
        .returning({ id: platformUsers.id });
      if (!created) throw new Error(`Failed to create platform user for ${email}`);
      userId = created.id;
      createdPlatformUser = true;
    }

    let membershipId = plan.existingMembershipId;
    let createdMembership = false;

    if (!membershipId) {
      membershipId = randomUUID();
      await platform.db.insert(platformMemberships).values({
        id: membershipId,
        userId,
        organizationId: plan.organizationId,
        role: plan.accessRole,
        accessRole: plan.accessRole,
        isActive: true,
      });
      createdMembership = true;
    } else {
      await platform.db
        .update(platformMemberships)
        .set({
          role: plan.accessRole,
          accessRole: plan.accessRole,
          isActive: true,
          updatedAt: new Date(),
        })
        .where(eq(platformMemberships.id, membershipId));
    }

    await platform.db
      .insert(platformMembershipLocations)
      .values({ membershipId, locationId: plan.locationId })
      .onConflictDoNothing();

    const { rank, jobRole } = workforceRankForAccessRole(plan.accessRole);
    await hairDb
      .update(wfEmployees)
      .set({
        userId,
        organizationId: plan.organizationId,
        canLogin: true,
        status: 'active',
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
          organizationId: plan.organizationId,
          rank,
          jobRole,
          isActive: true,
          updatedAt: new Date(),
        })
        .where(eq(wfEngineMemberships.id, engineMembership.id));
    }

    return {
      ...plan,
      userId,
      membershipId,
      createdPlatformUser,
      createdMembership,
    };
  } finally {
    await platform.close();
  }
}
