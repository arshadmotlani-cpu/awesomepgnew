import { and, asc, eq, ilike, inArray } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import { fyhBrands } from '@/src/hair/db/schema';
import { orgFilter, tenantOrgDefaults } from '@/src/hair/lib/tenant/filters';
import type { TenantContext } from '@/src/hair/lib/tenant/types';

export async function listBrands(ctx?: TenantContext | null) {
  return hairDb
    .select()
    .from(fyhBrands)
    .where(orgFilter(fyhBrands.organizationId, ctx))
    .orderBy(asc(fyhBrands.name));
}

export async function listBrandsForVendor(vendorId: string, ctx?: TenantContext | null) {
  return hairDb
    .select()
    .from(fyhBrands)
    .where(and(orgFilter(fyhBrands.organizationId, ctx), eq(fyhBrands.vendorId, vendorId)))
    .orderBy(asc(fyhBrands.name));
}

export async function getBrand(id: string, ctx?: TenantContext | null) {
  const [row] = await hairDb
    .select()
    .from(fyhBrands)
    .where(and(orgFilter(fyhBrands.organizationId, ctx), eq(fyhBrands.id, id)))
    .limit(1);
  return row ?? null;
}

export async function findOrCreateBrand(
  name: string,
  vendorId?: string | null,
  ctx?: TenantContext | null,
) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Brand name is required');
  const [existing] = await hairDb
    .select()
    .from(fyhBrands)
    .where(and(orgFilter(fyhBrands.organizationId, ctx), ilike(fyhBrands.name, trimmed)))
    .limit(1);
  if (existing) {
    if (vendorId && !existing.vendorId) {
      await hairDb
        .update(fyhBrands)
        .set({ vendorId })
        .where(and(orgFilter(fyhBrands.organizationId, ctx), eq(fyhBrands.id, existing.id)));
    }
    return existing;
  }
  const [row] = await hairDb
    .insert(fyhBrands)
    .values({ name: trimmed, vendorId: vendorId ?? null, ...tenantOrgDefaults(ctx) })
    .returning();
  return row!;
}

export async function syncVendorBrands(
  vendorId: string,
  brandNames: string[],
  ctx?: TenantContext | null,
) {
  const names = [...new Set(brandNames.map((n) => n.trim()).filter(Boolean))];
  const existing = await listBrandsForVendor(vendorId, ctx);
  const existingNames = new Set(existing.map((b) => b.name.toLowerCase()));

  for (const name of names) {
    if (!existingNames.has(name.toLowerCase())) {
      await findOrCreateBrand(name, vendorId, ctx);
    }
  }

  const keepLower = new Set(names.map((n) => n.toLowerCase()));
  for (const brand of existing) {
    if (!keepLower.has(brand.name.toLowerCase())) {
      await hairDb
        .update(fyhBrands)
        .set({ vendorId: null })
        .where(and(orgFilter(fyhBrands.organizationId, ctx), eq(fyhBrands.id, brand.id)));
    }
  }
}

export async function detachBrandsFromVendor(vendorId: string, ctx?: TenantContext | null) {
  await hairDb
    .update(fyhBrands)
    .set({ vendorId: null })
    .where(and(orgFilter(fyhBrands.organizationId, ctx), eq(fyhBrands.vendorId, vendorId)));
}

export async function getBrandNamesByIds(ids: string[], ctx?: TenantContext | null) {
  if (!ids.length) return new Map<string, string>();
  const rows = await hairDb
    .select()
    .from(fyhBrands)
    .where(and(orgFilter(fyhBrands.organizationId, ctx), inArray(fyhBrands.id, ids)));
  return new Map(rows.map((r) => [r.id, r.name]));
}
