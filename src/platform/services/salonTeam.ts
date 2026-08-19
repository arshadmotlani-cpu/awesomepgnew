import { and, eq, inArray } from 'drizzle-orm';
import { createPlatformClient } from '@/src/platform/db/client';
import {
  platformInvitations,
  platformLocations,
  platformMembershipLocations,
  platformMemberships,
  platformUsers,
  type PlatformMembershipRole,
} from '@/src/platform/db/schema';
import { hasPlatformDatabaseUrl } from '@/src/platform/lib/db/env';

export type SalonTeamMemberBase = {
  membershipId: string;
  userId: string;
  email: string;
  accessRole: PlatformMembershipRole;
  isActive: boolean;
  locationIds: string[];
  locationNames: string[];
};

export type SalonTeamLocationOption = {
  locationId: string;
  locationName: string;
  isActive: boolean;
};

export type SalonTeamInvitationRow = {
  id: string;
  email: string;
  accessRole: PlatformMembershipRole;
  status: string;
  expiresAt: Date;
  token: string;
  locationIds: string[];
};

export async function listSalonTeamLocations(
  organizationId: string,
): Promise<SalonTeamLocationOption[]> {
  if (!hasPlatformDatabaseUrl()) return [];
  const { db, close } = createPlatformClient({ max: 1 });
  try {
    const rows = await db
      .select({
        locationId: platformLocations.id,
        locationName: platformLocations.name,
        status: platformLocations.status,
      })
      .from(platformLocations)
      .where(eq(platformLocations.organizationId, organizationId));
    return rows.map((row) => ({
      locationId: row.locationId,
      locationName: row.locationName,
      isActive: row.status === 'active',
    }));
  } finally {
    await close();
  }
}

export async function listSalonTeamMembers(organizationId: string): Promise<SalonTeamMemberBase[]> {
  if (!hasPlatformDatabaseUrl()) return [];
  const { db, close } = createPlatformClient({ max: 1 });
  try {
    const members = await db
      .select({
        membershipId: platformMemberships.id,
        userId: platformMemberships.userId,
        email: platformUsers.email,
        accessRole: platformMemberships.accessRole,
        role: platformMemberships.role,
        isActive: platformMemberships.isActive,
      })
      .from(platformMemberships)
      .innerJoin(platformUsers, eq(platformMemberships.userId, platformUsers.id))
      .where(eq(platformMemberships.organizationId, organizationId));

    const locByMembership = new Map<string, { ids: string[]; names: string[] }>();
    if (members.length > 0) {
      const locations = await db
        .select({
          membershipId: platformMembershipLocations.membershipId,
          locationId: platformMembershipLocations.locationId,
          locationName: platformLocations.name,
        })
        .from(platformMembershipLocations)
        .innerJoin(platformLocations, eq(platformMembershipLocations.locationId, platformLocations.id))
        .where(
          inArray(
            platformMembershipLocations.membershipId,
            members.map((m) => m.membershipId),
          ),
        );

      for (const row of locations) {
        const bucket = locByMembership.get(row.membershipId) ?? { ids: [], names: [] };
        bucket.ids.push(row.locationId);
        bucket.names.push(row.locationName);
        locByMembership.set(row.membershipId, bucket);
      }
    }

    return members.map((member) => {
      const loc = locByMembership.get(member.membershipId) ?? { ids: [], names: [] };
      return {
        membershipId: member.membershipId,
        userId: member.userId,
        email: member.email,
        accessRole: (member.accessRole || member.role) as PlatformMembershipRole,
        isActive: member.isActive,
        locationIds: loc.ids,
        locationNames: loc.names,
      };
    });
  } finally {
    await close();
  }
}

export async function listSalonPendingInvitations(
  organizationId: string,
): Promise<SalonTeamInvitationRow[]> {
  if (!hasPlatformDatabaseUrl()) return [];
  const { db, close } = createPlatformClient({ max: 1 });
  try {
    const rows = await db
      .select()
      .from(platformInvitations)
      .where(
        and(
          eq(platformInvitations.organizationId, organizationId),
          eq(platformInvitations.status, 'pending'),
        ),
      );
    return rows.map((row) => ({
      id: row.id,
      email: row.email,
      accessRole: row.accessRole,
      status: row.status,
      expiresAt: row.expiresAt,
      token: row.token,
      locationIds: Array.isArray(row.locationIds) ? row.locationIds : [],
    }));
  } finally {
    await close();
  }
}
