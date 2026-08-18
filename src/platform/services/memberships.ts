import { and, eq } from 'drizzle-orm';
import {
  platformMembershipLocations,
  platformMemberships,
  platformOrganizations,
} from '@/src/platform/db/schema';
import { createPlatformClient } from '@/src/platform/db/client';
import { hasPlatformDatabaseUrl } from '@/src/platform/lib/db/env';

export type PlatformMembershipRow = {
  membershipId: string;
  userId: string;
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  role: string;
  allowedLocationIds: string[];
};

export async function loadMembershipForUserOrg(
  userId: string,
  organizationId: string,
): Promise<PlatformMembershipRow | null> {
  if (!hasPlatformDatabaseUrl()) return null;
  const { db, close } = createPlatformClient({ max: 1 });
  try {
    const [membership] = await db
      .select({
        membershipId: platformMemberships.id,
        userId: platformMemberships.userId,
        organizationId: platformMemberships.organizationId,
        organizationName: platformOrganizations.name,
        organizationSlug: platformOrganizations.slug,
        role: platformMemberships.role,
      })
      .from(platformMemberships)
      .innerJoin(
        platformOrganizations,
        eq(platformMemberships.organizationId, platformOrganizations.id),
      )
      .where(
        and(
          eq(platformMemberships.userId, userId),
          eq(platformMemberships.organizationId, organizationId),
          eq(platformMemberships.isActive, true),
        ),
      )
      .limit(1);
    if (!membership) return null;

    const locRows = await db
      .select({ locationId: platformMembershipLocations.locationId })
      .from(platformMembershipLocations)
      .where(eq(platformMembershipLocations.membershipId, membership.membershipId));

    return {
      membershipId: membership.membershipId,
      userId: membership.userId,
      organizationId: membership.organizationId,
      organizationName: membership.organizationName,
      organizationSlug: membership.organizationSlug,
      role: membership.role,
      allowedLocationIds: locRows.map((r) => r.locationId),
    };
  } finally {
    await close();
  }
}

export async function listActiveMembershipsForUser(userId: string): Promise<PlatformMembershipRow[]> {
  if (!hasPlatformDatabaseUrl()) return [];
  const { db, close } = createPlatformClient({ max: 1 });
  try {
    const memberships = await db
      .select({
        membershipId: platformMemberships.id,
        userId: platformMemberships.userId,
        organizationId: platformMemberships.organizationId,
        organizationName: platformOrganizations.name,
        organizationSlug: platformOrganizations.slug,
        role: platformMemberships.role,
      })
      .from(platformMemberships)
      .innerJoin(
        platformOrganizations,
        eq(platformMemberships.organizationId, platformOrganizations.id),
      )
      .where(
        and(
          eq(platformMemberships.userId, userId),
          eq(platformMemberships.isActive, true),
          eq(platformOrganizations.status, 'active'),
        ),
      );

    const results: PlatformMembershipRow[] = [];
    for (const membership of memberships) {
      const locRows = await db
        .select({ locationId: platformMembershipLocations.locationId })
        .from(platformMembershipLocations)
        .where(eq(platformMembershipLocations.membershipId, membership.membershipId));
      results.push({
        membershipId: membership.membershipId,
        userId: membership.userId,
        organizationId: membership.organizationId,
        organizationName: membership.organizationName,
        organizationSlug: membership.organizationSlug,
        role: membership.role,
        allowedLocationIds: locRows.map((r) => r.locationId),
      });
    }
    return results;
  } finally {
    await close();
  }
}
