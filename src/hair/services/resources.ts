import { and, asc, eq } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import { fyhResources, type FyhResourceType } from '@/src/hair/db/schema';
import type { TenantContext } from '@/src/hair/lib/tenant/types';
import { orgFilter, locationFilter, tenantWriteDefaults, tenantOrgDefaults } from '@/src/hair/lib/tenant/filters';

export async function listResourcesAdmin(ctx?: TenantContext | null) {
  return hairDb
    .select()
    .from(fyhResources)
    .where(and(orgFilter(fyhResources.organizationId, ctx), locationFilter(fyhResources.locationId, ctx)))
    .orderBy(asc(fyhResources.sortOrder), asc(fyhResources.name));
}

export async function createResource(
  input: {
    name: string;
    type: FyhResourceType;
    color?: string | null;
  },
  ctx?: TenantContext | null,
) {
  const [row] = await hairDb
    .insert(fyhResources)
    .values({
      ...tenantWriteDefaults(ctx),
      name: input.name.trim(),
      type: input.type,
      color: input.color?.trim() || null,
    })
    .returning();
  return row!;
}

export async function setResourceActive(resourceId: string, isActive: boolean, ctx?: TenantContext | null) {
  await hairDb
    .update(fyhResources)
    .set({ isActive, updatedAt: new Date() })
    .where(
      and(
        orgFilter(fyhResources.organizationId, ctx),
        locationFilter(fyhResources.locationId, ctx),
        eq(fyhResources.id, resourceId),
      ),
    );
}
