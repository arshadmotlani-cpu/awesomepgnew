import { and, asc, eq, ilike, or } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import { fyhBrands, fyhProducts, fyhVendors } from '@/src/hair/db/schema';
import type { FyhProduct } from '@/src/hair/db/schema';
import type { FyhProductType } from '@/src/hair/lib/productTypes';
import { parseProductType } from '@/src/hair/lib/productTypes';
import { findOrCreateBrandInDb } from '@/src/hair/services/brands';
import { applyMovement, type HairDb } from '@/src/hair/services/stock';
import type { TenantContext } from '@/src/hair/lib/tenant/types';
import { orgFilter, locationFilter, tenantWriteDefaults, tenantOrgDefaults } from '@/src/hair/lib/tenant/filters';
import { resolveTenantContextForService } from '@/src/hair/lib/tenant/serviceContext';

function toPaise(rupees: number): number {
  return Math.round(Number(rupees || 0) * 100);
}

export type ProductInput = {
  name: string;
  brandId: string;
  category?: string | null;
  description?: string | null;
  productType: FyhProductType;
  costPriceRupees?: number;
  sellingPriceRupees?: number;
  stockQty?: number;
  isActive?: boolean;
};

export type ProductWithBrand = FyhProduct & {
  brandName: string;
  vendorId?: string | null;
  vendorName?: string | null;
};

function normalizeProductName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

async function assertBrandAllowedForVendor(
  brandId: string,
  vendorId: string | null | undefined,
  db: HairDb,
  ctx?: TenantContext | null,
) {
  const vendor = vendorId?.trim();
  if (!vendor) return;
  const [row] = await db
    .select({ vendorId: fyhBrands.vendorId })
    .from(fyhBrands)
    .where(and(orgFilter(fyhBrands.organizationId, ctx), eq(fyhBrands.id, brandId)))
    .limit(1);
  if (!row) throw new Error('Brand not found');
  if (row.vendorId && row.vendorId !== vendor) {
    throw new Error('Selected brand is not supplied by this vendor');
  }
}

async function assertUniqueProductIdentityInDb(
  db: HairDb,
  name: string,
  brandId: string,
  excludeId?: string,
  ctx?: TenantContext | null,
) {
  const target = normalizeProductName(name);
  const rows = await db
    .select({ id: fyhProducts.id, name: fyhProducts.name, brandId: fyhProducts.brandId })
    .from(fyhProducts)
    .where(and(orgFilter(fyhProducts.organizationId, ctx), eq(fyhProducts.brandId, brandId)));
  for (const row of rows) {
    if (excludeId && row.id === excludeId) continue;
    if (normalizeProductName(row.name) === target) {
      throw new Error('A product with this name already exists for the selected brand');
    }
  }
}

async function assertUniqueProductIdentity(
  name: string,
  brandId: string,
  excludeId?: string,
  ctx?: TenantContext | null,
) {
  return assertUniqueProductIdentityInDb(hairDb, name, brandId, excludeId, ctx);
}

async function getProductWithBrandFromDb(
  db: HairDb,
  id: string,
  ctx?: TenantContext | null,
): Promise<ProductWithBrand | null> {
  ctx = await resolveTenantContextForService(ctx);
  const [row] = await db
    .select({
      product: fyhProducts,
      brandName: fyhBrands.name,
      vendorId: fyhBrands.vendorId,
      vendorName: fyhVendors.name,
    })
    .from(fyhProducts)
    .innerJoin(fyhBrands, eq(fyhBrands.id, fyhProducts.brandId))
    .leftJoin(fyhVendors, eq(fyhVendors.id, fyhBrands.vendorId))
    .where(and(orgFilter(fyhProducts.organizationId, ctx), eq(fyhProducts.id, id)))
    .limit(1);
  return row
    ? {
        ...row.product,
        brandName: row.brandName,
        vendorId: row.vendorId,
        vendorName: row.vendorName,
      }
    : null;
}

export type CreateProductConfigurationOpts = {
  /** Resolved catalog brand id */
  brandId?: string;
  /** Create/link brand inside product transaction */
  newBrandName?: string | null;
  vendorId?: string | null;
};

function validateProductInput(input: ProductInput) {
  const name = input.name.trim();
  if (!name) throw new Error('Product name is required');
  if (!input.brandId?.trim()) throw new Error('Brand is required');
  const cost = input.costPriceRupees ?? 0;
  if (cost < 0) throw new Error('Cost price cannot be negative');
  if (input.productType === 'retail') {
    const sell = input.sellingPriceRupees ?? 0;
    if (sell < 0) throw new Error('Selling price cannot be negative');
    if (sell === 0) throw new Error('Retail products require a selling price');
  }
  return name;
}

export async function listProducts(
  opts?: {
    q?: string;
    status?: 'active' | 'inactive' | 'all';
  },
  ctx?: TenantContext | null,
): Promise<ProductWithBrand[]> {
  ctx = await resolveTenantContextForService(ctx);
  const conditions = [orgFilter(fyhProducts.organizationId, ctx)];
  const status = opts?.status ?? 'active';
  if (status === 'active') conditions.push(eq(fyhProducts.isActive, true));
  if (status === 'inactive') conditions.push(eq(fyhProducts.isActive, false));
  const q = opts?.q?.trim();
  if (q) {
    const pattern = `%${q}%`;
    conditions.push(
      or(ilike(fyhProducts.name, pattern), ilike(fyhBrands.name, pattern))!,
    );
  }
  const rows = await hairDb
    .select({
      product: fyhProducts,
      brandName: fyhBrands.name,
      vendorId: fyhBrands.vendorId,
      vendorName: fyhVendors.name,
    })
    .from(fyhProducts)
    .innerJoin(fyhBrands, eq(fyhBrands.id, fyhProducts.brandId))
    .leftJoin(fyhVendors, eq(fyhVendors.id, fyhBrands.vendorId))
    .where(and(...conditions))
    .orderBy(asc(fyhProducts.name))
    .limit(300);

  return rows.map((r) => ({
    ...r.product,
    brandName: r.brandName,
    vendorId: r.vendorId,
    vendorName: r.vendorName,
  }));
}

/** Active retail products for POS / Quick Sale — same SSOT as Configuration → Products. */
export async function listBookableRetailProducts(ctx?: TenantContext | null) {
  const rows = await listProducts({ status: 'active' }, ctx);
  return rows.filter((p) => p.productType === 'retail');
}

/** Professional products for service consumable kits. */
export async function listConsumableProducts(ctx?: TenantContext | null) {
  ctx = await resolveTenantContextForService(ctx);
  return hairDb
    .select()
    .from(fyhProducts)
    .where(
      and(
        orgFilter(fyhProducts.organizationId, ctx),
        eq(fyhProducts.isActive, true),
        eq(fyhProducts.productType, 'professional'),
      ),
    )
    .orderBy(asc(fyhProducts.name));
}

export async function getProduct(id: string, ctx?: TenantContext | null): Promise<ProductWithBrand | null> {
  ctx = await resolveTenantContextForService(ctx);
  const [row] = await hairDb
    .select({
      product: fyhProducts,
      brandName: fyhBrands.name,
      vendorId: fyhBrands.vendorId,
      vendorName: fyhVendors.name,
    })
    .from(fyhProducts)
    .innerJoin(fyhBrands, eq(fyhBrands.id, fyhProducts.brandId))
    .leftJoin(fyhVendors, eq(fyhVendors.id, fyhBrands.vendorId))
    .where(and(orgFilter(fyhProducts.organizationId, ctx), eq(fyhProducts.id, id)))
    .limit(1);
  return row
    ? {
        ...row.product,
        brandName: row.brandName,
        vendorId: row.vendorId,
        vendorName: row.vendorName,
      }
    : null;
}

export async function createProductFromConfiguration(
  input: ProductInput,
  brandOpts: CreateProductConfigurationOpts,
  ctx?: TenantContext | null,
): Promise<ProductWithBrand> {
  ctx = await resolveTenantContextForService(ctx);
  const name = validateProductInput(input);
  const openingQty = input.stockQty ?? 0;
  const productType = parseProductType(input.productType);
  const sellingPricePaise =
    productType === 'retail' ? toPaise(input.sellingPriceRupees ?? 0) : 0;

  return hairDb.transaction(async (tx) => {
    const db = tx as unknown as HairDb;

    let brandId = brandOpts.brandId?.trim() || input.brandId?.trim();
    if (!brandId || brandId === '__pending__') {
      const newName = brandOpts.newBrandName?.trim();
      if (!newName) throw new Error('Brand is required');
      const brand = await findOrCreateBrandInDb(db, newName, brandOpts.vendorId ?? null, ctx);
      brandId = brand.id;
    }

    await assertBrandAllowedForVendor(brandId, brandOpts.vendorId ?? null, db, ctx);
    await assertUniqueProductIdentityInDb(db, name, brandId, undefined, ctx);

    const [row] = await tx
      .insert(fyhProducts)
      .values({
        ...tenantOrgDefaults(ctx),
        name,
        brandId,
        category: input.category?.trim() || null,
        description: input.description?.trim() || null,
        productType,
        sellingPricePaise,
        costPricePaise: toPaise(input.costPriceRupees ?? 0),
        stockQty: 0,
        isActive: input.isActive !== false,
      })
      .returning();

    if (!row) throw new Error('Failed to create product');

    if (openingQty > 0) {
      await applyMovement(
        db,
        {
          productId: row.id,
          quantityDelta: openingQty,
          movementType: 'opening',
          notes: 'Opening stock',
        },
        ctx,
      );
    }

    const created = await getProductWithBrandFromDb(db, row.id, ctx);
    if (!created) throw new Error('Failed to load created product');
    return created;
  });
}

/** @deprecated Prefer createProductFromConfiguration for brand+product atomicity */
export async function createProduct(input: ProductInput, ctx?: TenantContext | null) {
  const brandId = input.brandId?.trim();
  if (!brandId || brandId === '__pending__') {
    throw new Error('Brand is required');
  }
  return createProductFromConfiguration(input, { brandId }, ctx);
}

export async function updateProduct(id: string, input: ProductInput, ctx?: TenantContext | null) {
  ctx = await resolveTenantContextForService(ctx);
  const name = validateProductInput(input);
  await assertUniqueProductIdentity(name, input.brandId, id, ctx);
  const isActive = input.isActive !== false;
  const productType = parseProductType(input.productType);
  const sellingPricePaise =
    productType === 'retail' ? toPaise(input.sellingPriceRupees ?? 0) : 0;

  const existing = await getProduct(id, ctx);
  if (!existing) throw new Error('Product not found');

  await hairDb
    .update(fyhProducts)
    .set({
      name,
      brandId: input.brandId,
      category: input.category?.trim() || null,
      description: input.description?.trim() || null,
      productType,
      sellingPricePaise,
      costPricePaise: toPaise(input.costPriceRupees ?? 0),
      isActive,
      archivedAt: isActive ? null : new Date(),
      updatedAt: new Date(),
    })
    .where(and(orgFilter(fyhProducts.organizationId, ctx), eq(fyhProducts.id, id)));

  const updated = await getProduct(id, ctx);
  return updated!;
}

export async function adjustProductStock(
  productId: string,
  quantityDelta: number,
  reason: string,
  ctx?: TenantContext | null,
) {
  ctx = await resolveTenantContextForService(ctx);
  const trimmed = reason.trim();
  if (!trimmed) throw new Error('Adjustment reason is required');
  const delta = Number(quantityDelta);
  if (!Number.isFinite(delta) || delta === 0) {
    throw new Error('Enter a non-zero quantity change (+ or −)');
  }
  const existing = await getProduct(productId, ctx);
  if (!existing) throw new Error('Product not found');
  await applyMovement(
    hairDb,
    {
      productId,
      quantityDelta: delta,
      movementType: 'adjustment',
      referenceType: 'product_adjust',
      referenceId: productId,
      notes: trimmed,
    },
    ctx,
  );
  return getProduct(productId, ctx);
}

export async function restoreProduct(id: string, ctx?: TenantContext | null) {
  ctx = await resolveTenantContextForService(ctx);
  const [row] = await hairDb
    .update(fyhProducts)
    .set({ isActive: true, archivedAt: null, updatedAt: new Date() })
    .where(and(orgFilter(fyhProducts.organizationId, ctx), eq(fyhProducts.id, id)))
    .returning();
  if (!row) throw new Error('Product not found');
  return row;
}

export async function archiveProduct(id: string, ctx?: TenantContext | null) {
  ctx = await resolveTenantContextForService(ctx);
  const [row] = await hairDb
    .update(fyhProducts)
    .set({ isActive: false, archivedAt: new Date(), updatedAt: new Date() })
    .where(and(orgFilter(fyhProducts.organizationId, ctx), eq(fyhProducts.id, id)))
    .returning();
  if (!row) throw new Error('Product not found');
  return row;
}

export async function deleteProduct(id: string, ctx?: TenantContext | null) {
  ctx = await resolveTenantContextForService(ctx);
  const existing = await getProduct(id, ctx);
  if (!existing) throw new Error('Product not found');
  await hairDb
    .delete(fyhProducts)
    .where(and(orgFilter(fyhProducts.organizationId, ctx), eq(fyhProducts.id, id)));
}
