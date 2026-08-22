'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { eq, and, inArray } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import { wfEmployees } from '@/src/workforce/db/schema';
import { getHairSession } from '@/src/hair/lib/auth/session';
import { persistTenantCookies } from '@/src/hair/lib/tenant/persistTenantCookies';
import { FYH_LOCATION_COOKIE, FYH_ORG_COOKIE } from '@/src/hair/lib/tenant/cookies';
import { isFyhSaasTenantEnabled } from '@/src/hair/lib/tenant/flags';
import {
  listActiveMembershipsForUser,
  loadMembershipForUserOrg,
} from '@/src/platform/services/memberships';
import { createPlatformClient } from '@/src/platform/db/client';
import { hasPlatformDatabaseUrl } from '@/src/platform/lib/db/env';
import { platformLocations } from '@/src/platform/db/schema';

async function resolveUserIdFromSession(): Promise<string | null> {
  const session = await getHairSession();
  if (!session?.workforceEmployeeId) return null;
  const [emp] = await hairDb
    .select({ userId: wfEmployees.userId })
    .from(wfEmployees)
    .where(eq(wfEmployees.id, session.workforceEmployeeId))
    .limit(1);
  return emp?.userId ?? null;
}

export async function selectOrganizationAction(formData: FormData): Promise<void> {
  if (!isFyhSaasTenantEnabled()) redirect('/dashboard/revenue');

  const organizationId = String(formData.get('organizationId') ?? '').trim();
  const next = String(formData.get('next') ?? '/dashboard/revenue');
  if (!organizationId) redirect('/select-organization?error=missing');

  const userId = await resolveUserIdFromSession();
  if (!userId) redirect('/select-organization?error=invalid');

  const membership = await loadMembershipForUserOrg(userId, organizationId);
  if (!membership) redirect('/select-organization?error=invalid');

  const locationId = membership.allowedLocationIds[0];
  if (!locationId) redirect('/select-organization?error=invalid');

  await persistTenantCookies(organizationId, locationId);

  const safeNext =
    next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/select-organization')
      ? next
      : '/dashboard/revenue';
  redirect(safeNext);
}

export async function switchLocationAction(formData: FormData): Promise<void> {
  if (!isFyhSaasTenantEnabled()) return;

  const locationId = String(formData.get('locationId') ?? '').trim();
  if (!locationId) return;

  const userId = await resolveUserIdFromSession();
  if (!userId) return;

  const cookieStore = await cookies();
  const orgId = cookieStore.get(FYH_ORG_COOKIE)?.value?.trim();
  if (!orgId) return;

  const membership = await loadMembershipForUserOrg(userId, orgId);
  if (!membership?.allowedLocationIds.includes(locationId)) return;

  cookieStore.set(FYH_LOCATION_COOKIE, locationId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 365 * 24 * 60 * 60,
  });
}

export type TenantMembershipOption = {
  organizationId: string;
  organizationName: string;
  role: string;
};

export async function listTenantMembershipOptions(): Promise<TenantMembershipOption[]> {
  if (!isFyhSaasTenantEnabled()) return [];
  const userId = await resolveUserIdFromSession();
  if (!userId) return [];
  const memberships = await listActiveMembershipsForUser(userId);
  return memberships.map((m) => ({
    organizationId: m.organizationId,
    organizationName: m.organizationName,
    role: m.role,
  }));
}

export type TenantLocationOption = {
  locationId: string;
  locationName: string;
  isActive: boolean;
};

export async function listTenantLocationOptions(): Promise<TenantLocationOption[]> {
  if (!isFyhSaasTenantEnabled() || !hasPlatformDatabaseUrl()) return [];
  const userId = await resolveUserIdFromSession();
  if (!userId) return [];

  const cookieStore = await cookies();
  const orgId = cookieStore.get(FYH_ORG_COOKIE)?.value?.trim();
  if (!orgId) return [];

  const membership = await loadMembershipForUserOrg(userId, orgId);
  if (!membership || membership.allowedLocationIds.length === 0) return [];

  const { db, close } = createPlatformClient({ max: 1 });
  try {
    const rows = await db
      .select({
        locationId: platformLocations.id,
        locationName: platformLocations.name,
        status: platformLocations.status,
      })
      .from(platformLocations)
      .where(
        and(
          eq(platformLocations.organizationId, membership.organizationId),
          inArray(platformLocations.id, membership.allowedLocationIds),
        ),
      );

    const byId = new Map(rows.map((r) => [r.locationId, r]));
    return membership.allowedLocationIds.map((locationId) => {
      const row = byId.get(locationId);
      return {
        locationId,
        locationName: row?.locationName ?? locationId,
        isActive: row?.status === 'active',
      };
    });
  } finally {
    await close();
  }
}
