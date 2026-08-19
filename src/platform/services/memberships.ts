import { and, eq, inArray } from 'drizzle-orm';
import {
  platformMembershipLocations,
  platformMemberships,
  platformOrganizationSubscriptions,
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
  accessRole: string;
  allowedLocationIds: string[];
};

function isSubscriptionAccessAllowed(status: string | null | undefined): boolean {
  return !status || status === 'trial' || status === 'active' || status === 'past_due';
}

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
        // FYH SaaS permission resolution is driven by `access_role`.
        role: platformMemberships.accessRole,
        accessRole: platformMemberships.accessRole,
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
          inArray(platformOrganizations.status, ['active', 'trial']),
        ),
      )
      .limit(1);
    if (!membership) return null;

    const [subscription] = await db
      .select({ status: platformOrganizationSubscriptions.status })
      .from(platformOrganizationSubscriptions)
      .where(eq(platformOrganizationSubscriptions.organizationId, membership.organizationId))
      .limit(1);
    if (!isSubscriptionAccessAllowed(subscription?.status)) return null;

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
      role: membership.accessRole,
      accessRole: membership.accessRole,
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
        role: platformMemberships.accessRole,
        accessRole: platformMemberships.accessRole,
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
          inArray(platformOrganizations.status, ['active', 'trial']),
        ),
      );

    const results: PlatformMembershipRow[] = [];
    for (const membership of memberships) {
      const [subscription] = await db
        .select({ status: platformOrganizationSubscriptions.status })
        .from(platformOrganizationSubscriptions)
        .where(eq(platformOrganizationSubscriptions.organizationId, membership.organizationId))
        .limit(1);
      if (!isSubscriptionAccessAllowed(subscription?.status)) continue;
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
        role: membership.accessRole,
        accessRole: membership.accessRole,
        allowedLocationIds: locRows.map((r) => r.locationId),
      });
    }
    return results;
  } finally {
    await close();
  }
}
