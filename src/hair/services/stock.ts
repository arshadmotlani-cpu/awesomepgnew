import { and, asc, desc, eq, gte, isNull, lte, sql } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import {
  fyhBrands,
  fyhProducts,
  fyhSettings,
  fyhStockMovements,
  type FyhInventorySettings,
  type FyhStockMovementType,
} from '@/src/hair/db/schema';
import { DEFAULT_INVENTORY_SETTINGS } from '@/src/hair/services/settings';
import type { TenantContext } from '@/src/hair/lib/tenant/types';
import { orgFilter, locationFilter, tenantWriteDefaults, tenantOrgDefaults } from '@/src/hair/lib/tenant/filters';
import { resolveTenantContextForService } from '@/src/hair/lib/tenant/serviceContext';

export type HairDb = typeof hairDb;

export type ApplyMovementInput = {
  productId: string;
  quantityDelta: number;
  movementType: FyhStockMovementType;
  referenceType?: string | null;
  referenceId?: string | null;
  notes?: string | null;
};

export type MovementFilters = {
  productId?: string;
  movementType?: FyhStockMovementType;
  referenceType?: string;
  referenceId?: string;
  from?: Date;
  to?: Date;
  limit?: number;
};

export async function getInventorySettings(db: HairDb = hairDb, ctx?: TenantContext | null): Promise<FyhInventorySettings> {
  ctx = await resolveTenantContextForService(ctx);
  const [row] = await db
    .select({ inventorySettings: fyhSettings.inventorySettings })
    .from(fyhSettings)
    .where(orgFilter(fyhSettings.organizationId, ctx))
    .limit(1);
  return { ...DEFAULT_INVENTORY_SETTINGS, ...row?.inventorySettings };
}

export async function getOnHand(productId: string, db: HairDb = hairDb, ctx?: TenantContext | null): Promise<number> {
  ctx = await resolveTenantContextForService(ctx);
  const [row] = await db
    .select({ stockQty: fyhProducts.stockQty })
    .from(fyhProducts)
    .where(and(orgFilter(fyhProducts.organizationId, ctx), eq(fyhProducts.id, productId)))
    .limit(1);
  if (!row) throw new Error('Product not found');
  return Number(row.stockQty);
}

export async function assertSufficientStock(
  db: HairDb,
  lines: { productId: string; quantity: number }[],
  ctx?: TenantContext | null,
): Promise<void> {
  ctx = await resolveTenantContextForService(ctx);
  const settings = await getInventorySettings(db, ctx);
  if (settings.allowNegativeStock) return;

  for (const line of lines) {
    const onHand = await getOnHand(line.productId, db, ctx);
    if (onHand < line.quantity) {
      const [product] = await db
        .select({ name: fyhProducts.name })
        .from(fyhProducts)
        .where(and(orgFilter(fyhProducts.organizationId, ctx), eq(fyhProducts.id, line.productId)))
        .limit(1);
      throw new Error(
        `Insufficient stock for ${product?.name ?? 'product'}: have ${onHand}, need ${line.quantity}`,
      );
    }
  }
}

export async function applyMovement(db: HairDb, input: ApplyMovementInput, ctx?: TenantContext | null) {
  ctx = await resolveTenantContextForService(ctx);
  const delta = Number(input.quantityDelta);
  if (delta === 0) return null;

  const settings = await getInventorySettings(db, ctx);
  const allowNegative = settings.allowNegativeStock === true;

  const [product] = await db
    .select()
    .from(fyhProducts)
    .where(and(orgFilter(fyhProducts.organizationId, ctx), eq(fyhProducts.id, input.productId)))
    .limit(1);
  if (!product) throw new Error('Product not found');

  const currentQty = Number(product.stockQty);
  const newQty = currentQty + delta;

  if (!allowNegative && newQty < 0) {
    throw new Error(
      `Insufficient stock for ${product.name}: have ${currentQty}, need ${Math.abs(delta)}`,
    );
  }

  await db
    .update(fyhProducts)
    .set({ stockQty: newQty, updatedAt: new Date() })
    .where(and(orgFilter(fyhProducts.organizationId, ctx), eq(fyhProducts.id, input.productId)));

  const [movement] = await db
    .insert(fyhStockMovements)
    .values({
      ...tenantWriteDefaults(ctx),
      productId: input.productId,
      movementType: input.movementType,
      quantityDelta: delta,
      quantityAfter: newQty,
      referenceType: input.referenceType ?? null,
      referenceId: input.referenceId ?? null,
      notes: input.notes ?? null,
    })
    .returning();

  return movement;
}

export async function listMovements(filters: MovementFilters = {}, ctx?: TenantContext | null) {
  ctx = await resolveTenantContextForService(ctx);
  const conditions = [
    orgFilter(fyhStockMovements.organizationId, ctx),
    locationFilter(fyhStockMovements.locationId, ctx),
  ];
  if (filters.productId) conditions.push(eq(fyhStockMovements.productId, filters.productId));
  if (filters.movementType) conditions.push(eq(fyhStockMovements.movementType, filters.movementType));
  if (filters.referenceType) conditions.push(eq(fyhStockMovements.referenceType, filters.referenceType));
  if (filters.referenceId) conditions.push(eq(fyhStockMovements.referenceId, filters.referenceId));
  if (filters.from) conditions.push(gte(fyhStockMovements.createdAt, filters.from));
  if (filters.to) conditions.push(lte(fyhStockMovements.createdAt, filters.to));

  return hairDb
    .select({
      movement: fyhStockMovements,
      productName: fyhProducts.name,
    })
    .from(fyhStockMovements)
    .innerJoin(fyhProducts, eq(fyhProducts.id, fyhStockMovements.productId))
    .where(and(...conditions))
    .orderBy(desc(fyhStockMovements.createdAt))
    .limit(filters.limit ?? 200);
}

export async function updateWeightedAverageCost(
  db: HairDb,
  productId: string,
  receivedQty: number,
  unitCostPaise: number,
  ctx?: TenantContext | null,
) {
  ctx = await resolveTenantContextForService(ctx);
  const qty = Number(receivedQty);
  if (qty <= 0) return;

  const [product] = await db
    .select({ stockQty: fyhProducts.stockQty, costPricePaise: fyhProducts.costPricePaise })
    .from(fyhProducts)
    .where(and(orgFilter(fyhProducts.organizationId, ctx), eq(fyhProducts.id, productId)))
    .limit(1);
  if (!product) throw new Error('Product not found');

  const currentQty = Number(product.stockQty);
  const currentCost = product.costPricePaise;
  const totalQty = currentQty + qty;
  const newCost =
    totalQty > 0
      ? Math.round((currentQty * currentCost + qty * unitCostPaise) / totalQty)
      : unitCostPaise;

  await db
    .update(fyhProducts)
    .set({ costPricePaise: newCost, updatedAt: new Date() })
    .where(and(orgFilter(fyhProducts.organizationId, ctx), eq(fyhProducts.id, productId)));
}

export async function listLowStockProducts(ctx?: TenantContext | null) {
  ctx = await resolveTenantContextForService(ctx);
  return hairDb
    .select()
    .from(fyhProducts)
    .where(
      and(
        orgFilter(fyhProducts.organizationId, ctx),
        eq(fyhProducts.isActive, true),
        sql`${fyhProducts.stockQty} <= ${fyhProducts.minStock}`,
        sql`${fyhProducts.minStock} > 0`,
      ),
    )
    .orderBy(asc(fyhProducts.name));
}

export async function listStockSummary(ctx?: TenantContext | null) {
  ctx = await resolveTenantContextForService(ctx);
  return hairDb
    .select({
      id: fyhProducts.id,
      name: fyhProducts.name,
      brandName: fyhBrands.name,
      productType: fyhProducts.productType,
      stockQty: fyhProducts.stockQty,
      minStock: fyhProducts.minStock,
      sellingPricePaise: fyhProducts.sellingPricePaise,
      costPricePaise: fyhProducts.costPricePaise,
      isActive: fyhProducts.isActive,
    })
    .from(fyhProducts)
    .innerJoin(fyhBrands, eq(fyhBrands.id, fyhProducts.brandId))
    .where(and(orgFilter(fyhProducts.organizationId, ctx), eq(fyhProducts.isActive, true)))
    .orderBy(asc(fyhProducts.name));
}
