import { asc, eq, ilike, inArray } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import { fyhBrands } from '@/src/hair/db/schema';

export async function listBrands() {
  return hairDb.select().from(fyhBrands).orderBy(asc(fyhBrands.name));
}

export async function listBrandsForVendor(vendorId: string) {
  return hairDb
    .select()
    .from(fyhBrands)
    .where(eq(fyhBrands.vendorId, vendorId))
    .orderBy(asc(fyhBrands.name));
}

export async function getBrand(id: string) {
  const [row] = await hairDb.select().from(fyhBrands).where(eq(fyhBrands.id, id)).limit(1);
  return row ?? null;
}

export async function findOrCreateBrand(name: string, vendorId?: string | null) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Brand name is required');
  const [existing] = await hairDb
    .select()
    .from(fyhBrands)
    .where(ilike(fyhBrands.name, trimmed))
    .limit(1);
  if (existing) {
    if (vendorId && !existing.vendorId) {
      await hairDb.update(fyhBrands).set({ vendorId }).where(eq(fyhBrands.id, existing.id));
    }
    return existing;
  }
  const [row] = await hairDb
    .insert(fyhBrands)
    .values({ name: trimmed, vendorId: vendorId ?? null })
    .returning();
  return row!;
}

export async function syncVendorBrands(vendorId: string, brandNames: string[]) {
  const names = [...new Set(brandNames.map((n) => n.trim()).filter(Boolean))];
  const existing = await listBrandsForVendor(vendorId);
  const existingNames = new Set(existing.map((b) => b.name.toLowerCase()));

  for (const name of names) {
    if (!existingNames.has(name.toLowerCase())) {
      await findOrCreateBrand(name, vendorId);
    }
  }

  const keepLower = new Set(names.map((n) => n.toLowerCase()));
  for (const brand of existing) {
    if (!keepLower.has(brand.name.toLowerCase())) {
      await hairDb
        .update(fyhBrands)
        .set({ vendorId: null })
        .where(eq(fyhBrands.id, brand.id));
    }
  }
}

export async function detachBrandsFromVendor(vendorId: string) {
  await hairDb.update(fyhBrands).set({ vendorId: null }).where(eq(fyhBrands.vendorId, vendorId));
}

export async function getBrandNamesByIds(ids: string[]) {
  if (!ids.length) return new Map<string, string>();
  const rows = await hairDb.select().from(fyhBrands).where(inArray(fyhBrands.id, ids));
  return new Map(rows.map((r) => [r.id, r.name]));
}
