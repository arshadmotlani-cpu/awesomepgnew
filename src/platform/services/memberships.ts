import { and, desc, eq, inArray } from 'drizzle-orm';
import {
  platformLocations,
  platformMembershipLocations,
  platformMemberships,
  platformOrganizationSubscriptions,
  platformOrganizations,
  platformUsers,
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

export async function findPlatformUserIdByEmail(email: string): Promise<string | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized || !hasPlatformDatabaseUrl()) return null;
  const { db, close } = createPlatformClient({ max: 1 });
  try {
    const [row] = await db
      .select({ id: platformUsers.id })
      .from(platformUsers)
      .where(eq(platformUsers.email, normalized))
      .limit(1);
    return row?.id ?? null;
  } finally {
    await close();
  }
}

function isSubscriptionAccessAllowed(status: string | null | undefined): boolean {
  return !status || status === 'trial' || status === 'active' || status === 'past_due';
}

type PlatformDb = ReturnType<typeof createPlatformClient>['db'];

/** Read-only: membership_locations, else active org locations (no writes). */
async function allowedLocationIdsForMembership(
  db: PlatformDb,
  membershipId: string,
  organizationId: string,
): Promise<string[]> {
  const locRows = await db
    .select({ locationId: platformMembershipLocations.locationId })
    .from(platformMembershipLocations)
    .where(eq(platformMembershipLocations.membershipId, membershipId));
  if (locRows.length > 0) return locRows.map((r) => r.locationId);

  const orgLocs = await db
    .select({ locationId: platformLocations.id })
    .from(platformLocations)
    .where(
      and(
        eq(platformLocations.organizationId, organizationId),
        eq(platformLocations.status, 'active'),
      ),
    )
    .orderBy(desc(platformLocations.isPrimary));
  return orgLocs.map((r) => r.locationId);
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

    const allowedLocationIds = await allowedLocationIdsForMembership(
      db,
      membership.membershipId,
      membership.organizationId,
    );

    return {
      membershipId: membership.membershipId,
      userId: membership.userId,
      organizationId: membership.organizationId,
      organizationName: membership.organizationName,
      organizationSlug: membership.organizationSlug,
      role: membership.accessRole,
      accessRole: membership.accessRole,
      allowedLocationIds,
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
      const allowedLocationIds = await allowedLocationIdsForMembership(
        db,
        membership.membershipId,
        membership.organizationId,
      );
      results.push({
        membershipId: membership.membershipId,
        userId: membership.userId,
        organizationId: membership.organizationId,
        organizationName: membership.organizationName,
        organizationSlug: membership.organizationSlug,
        role: membership.accessRole,
        accessRole: membership.accessRole,
        allowedLocationIds,
      });
    }
    return results;
  } finally {
    await close();
  }
}
