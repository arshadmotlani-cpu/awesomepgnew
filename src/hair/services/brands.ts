import { and, asc, eq, ilike, inArray } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import { fyhBrands } from '@/src/hair/db/schema';
import { orgFilter, tenantOrgDefaults } from '@/src/hair/lib/tenant/filters';
import { resolveTenantContextForService } from '@/src/hair/lib/tenant/serviceContext';
import type { TenantContext } from '@/src/hair/lib/tenant/types';
import type { HairDb } from '@/src/hair/services/stock';

export async function listBrands(ctx?: TenantContext | null) {
  ctx = await resolveTenantContextForService(ctx);
  return hairDb
    .select()
    .from(fyhBrands)
    .where(orgFilter(fyhBrands.organizationId, ctx))
    .orderBy(asc(fyhBrands.name));
}

export async function listBrandsForVendor(vendorId: string, ctx?: TenantContext | null) {
  ctx = await resolveTenantContextForService(ctx);
  return hairDb
    .select()
    .from(fyhBrands)
    .where(and(orgFilter(fyhBrands.organizationId, ctx), eq(fyhBrands.vendorId, vendorId)))
    .orderBy(asc(fyhBrands.name));
}

export async function getBrand(id: string, ctx?: TenantContext | null) {
  ctx = await resolveTenantContextForService(ctx);
  const [row] = await hairDb
    .select()
    .from(fyhBrands)
    .where(and(orgFilter(fyhBrands.organizationId, ctx), eq(fyhBrands.id, id)))
    .limit(1);
  return row ?? null;
}

export async function findOrCreateBrandInDb(
  db: HairDb,
  name: string,
  vendorId?: string | null,
  ctx?: TenantContext | null,
) {
  ctx = await resolveTenantContextForService(ctx);
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Brand name is required');
  const [existing] = await db
    .select()
    .from(fyhBrands)
    .where(and(orgFilter(fyhBrands.organizationId, ctx), ilike(fyhBrands.name, trimmed)))
    .limit(1);
  if (existing) {
    if (vendorId && !existing.vendorId) {
      await db
        .update(fyhBrands)
        .set({ vendorId })
        .where(and(orgFilter(fyhBrands.organizationId, ctx), eq(fyhBrands.id, existing.id)));
      return { ...existing, vendorId };
    }
    return existing;
  }
  const [row] = await db
    .insert(fyhBrands)
    .values({ name: trimmed, vendorId: vendorId ?? null, ...tenantOrgDefaults(ctx) })
    .returning();
  return row!;
}

export async function findOrCreateBrand(
  name: string,
  vendorId?: string | null,
  ctx?: TenantContext | null,
) {
  return findOrCreateBrandInDb(hairDb, name, vendorId, ctx);
}

export async function syncVendorBrands(
  vendorId: string,
  brandNames: string[],
  ctx?: TenantContext | null,
) {
  ctx = await resolveTenantContextForService(ctx);
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
  ctx = await resolveTenantContextForService(ctx);
  await hairDb
    .update(fyhBrands)
    .set({ vendorId: null })
    .where(and(orgFilter(fyhBrands.organizationId, ctx), eq(fyhBrands.vendorId, vendorId)));
}

export async function getBrandNamesByIds(ids: string[], ctx?: TenantContext | null) {
  ctx = await resolveTenantContextForService(ctx);
  if (!ids.length) return new Map<string, string>();
  const rows = await hairDb
    .select()
    .from(fyhBrands)
    .where(and(orgFilter(fyhBrands.organizationId, ctx), inArray(fyhBrands.id, ids)));
  return new Map(rows.map((r) => [r.id, r.name]));
}
