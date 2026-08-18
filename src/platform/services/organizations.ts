import { desc, eq, and } from 'drizzle-orm';
import { createPlatformClient } from '@/src/platform/db/client';
import {
  platformLocations,
  platformMembershipLocations,
  platformMemberships,
  platformOrganizations,
  platformOrganizationSubscriptions,
  platformPlans,
  platformUsers,
} from '@/src/platform/db/schema';
import { hasPlatformDatabaseUrl } from '@/src/platform/lib/db/env';

export type PlatformOrganizationSummary = {
  id: string;
  slug: string;
  name: string;
  status: string;
  locationCount: number;
  memberCount: number;
  planName: string | null;
};

export async function listOrganizationsForPlatformAdmin(): Promise<PlatformOrganizationSummary[]> {
  if (!hasPlatformDatabaseUrl()) return [];
  const { db, close } = createPlatformClient({ max: 1 });
  try {
    const orgs = await db
      .select()
      .from(platformOrganizations)
      .orderBy(desc(platformOrganizations.createdAt));

    const results: PlatformOrganizationSummary[] = [];
    for (const org of orgs) {
      const locRows = await db
        .select({ id: platformLocations.id })
        .from(platformLocations)
        .where(eq(platformLocations.organizationId, org.id));
      const memberRows = await db
        .select({ id: platformMemberships.id })
        .from(platformMemberships)
        .where(eq(platformMemberships.organizationId, org.id));
      const [sub] = await db
        .select({ planName: platformPlans.name })
        .from(platformOrganizationSubscriptions)
        .innerJoin(platformPlans, eq(platformOrganizationSubscriptions.planId, platformPlans.id))
        .where(eq(platformOrganizationSubscriptions.organizationId, org.id))
        .limit(1);

      results.push({
        id: org.id,
        slug: org.slug,
        name: org.name,
        status: org.status,
        locationCount: locRows.length,
        memberCount: memberRows.length,
        planName: sub?.planName ?? null,
      });
    }
    return results;
  } finally {
    await close();
  }
}

export type OrganizationMembershipSummary = {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  role: string;
  locationNames: string[];
};

export async function listOrganizationMembershipsForUser(
  userId: string,
): Promise<OrganizationMembershipSummary[]> {
  if (!hasPlatformDatabaseUrl()) return [];
  const { db, close } = createPlatformClient({ max: 1 });
  try {
    const rows = await db
      .select({
        organizationId: platformMemberships.organizationId,
        organizationName: platformOrganizations.name,
        organizationSlug: platformOrganizations.slug,
        role: platformMemberships.role,
        membershipId: platformMemberships.id,
      })
      .from(platformMemberships)
      .innerJoin(
        platformOrganizations,
        eq(platformMemberships.organizationId, platformOrganizations.id),
      )
      .where(
        and(eq(platformMemberships.userId, userId), eq(platformMemberships.isActive, true)),
      );

    const results: OrganizationMembershipSummary[] = [];
    for (const row of rows) {
      const locs = await db
        .select({ name: platformLocations.name })
        .from(platformMembershipLocations)
        .innerJoin(
          platformLocations,
          eq(platformMembershipLocations.locationId, platformLocations.id),
        )
        .where(eq(platformMembershipLocations.membershipId, row.membershipId));
      results.push({
        organizationId: row.organizationId,
        organizationName: row.organizationName,
        organizationSlug: row.organizationSlug,
        role: row.role,
        locationNames: locs.map((l) => l.name),
      });
    }
    return results;
  } finally {
    await close();
  }
}

export async function getPlatformUserById(userId: string) {
  if (!hasPlatformDatabaseUrl()) return null;
  const { db, close } = createPlatformClient({ max: 1 });
  try {
    const [user] = await db
      .select()
      .from(platformUsers)
      .where(eq(platformUsers.id, userId))
      .limit(1);
    return user ?? null;
  } finally {
    await close();
  }
}
