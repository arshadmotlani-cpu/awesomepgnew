import { and, asc, eq, ilike, or } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import { fyhProducts } from '@/src/hair/db/schema';
import { applyMovement } from '@/src/hair/services/stock';

function toPaise(rupees: number): number {
  return Math.round(Number(rupees || 0) * 100);
}

export type ProductInput = {
  name: string;
  sku?: string | null;
  barcode?: string | null;
  brand?: string | null;
  category?: string | null;
  description?: string | null;
  sellingPriceRupees: number;
  costPriceRupees?: number;
  stockQty?: number;
  reorderLevel?: number;
  unit?: string;
  gstPercent?: number;
  isRetail?: boolean;
  isConsumable?: boolean;
  isActive?: boolean;
};

export async function listProducts(opts?: {
  q?: string;
  status?: 'active' | 'inactive' | 'all';
}) {
  const conditions = [];
  const status = opts?.status ?? 'active';
  if (status === 'active') conditions.push(eq(fyhProducts.isActive, true));
  if (status === 'inactive') conditions.push(eq(fyhProducts.isActive, false));
  const q = opts?.q?.trim();
  if (q) {
    const pattern = `%${q}%`;
    conditions.push(
      or(
        ilike(fyhProducts.name, pattern),
        ilike(fyhProducts.sku, pattern),
        ilike(fyhProducts.brand, pattern),
        ilike(fyhProducts.category, pattern),
      )!,
    );
  }
  return hairDb
    .select()
    .from(fyhProducts)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(asc(fyhProducts.name))
    .limit(300);
}

export async function listConsumableProducts() {
  return hairDb
    .select()
    .from(fyhProducts)
    .where(and(eq(fyhProducts.isActive, true), eq(fyhProducts.isConsumable, true)))
    .orderBy(asc(fyhProducts.name));
}

export async function getProduct(id: string) {
  const [row] = await hairDb.select().from(fyhProducts).where(eq(fyhProducts.id, id)).limit(1);
  return row ?? null;
}

export async function createProduct(input: ProductInput) {
  const name = input.name.trim();
  if (!name) throw new Error('Product name is required');
  if ((input.sellingPriceRupees ?? 0) < 0 || (input.costPriceRupees ?? 0) < 0) {
    throw new Error('Prices cannot be negative');
  }
  const openingQty = input.stockQty ?? 0;

  return hairDb.transaction(async (tx) => {
    const db = tx as unknown as typeof hairDb;
    const [row] = await tx
      .insert(fyhProducts)
      .values({
        name,
        sku: input.sku?.trim() || null,
        barcode: input.barcode?.trim() || null,
        brand: input.brand?.trim() || null,
        category: input.category?.trim() || null,
        description: input.description?.trim() || null,
        sellingPricePaise: toPaise(input.sellingPriceRupees),
        costPricePaise: toPaise(input.costPriceRupees ?? 0),
        stockQty: 0,
        reorderLevel: input.reorderLevel ?? 0,
        unit: input.unit?.trim() || 'unit',
        gstBps: Math.round((input.gstPercent ?? 0) * 100),
        isRetail: input.isRetail !== false,
        isConsumable: input.isConsumable !== false,
        isActive: input.isActive !== false,
      })
      .returning();

    if (openingQty > 0) {
      await applyMovement(db, {
        productId: row!.id,
        quantityDelta: openingQty,
        movementType: 'opening',
        notes: 'Opening stock',
      });
    }

    const [updated] = await tx.select().from(fyhProducts).where(eq(fyhProducts.id, row!.id)).limit(1);
    return updated!;
  });
}

export async function updateProduct(id: string, input: ProductInput) {
  const name = input.name.trim();
  if (!name) throw new Error('Product name is required');
  const isActive = input.isActive !== false;

  const existing = await getProduct(id);
  if (!existing) throw new Error('Product not found');

  const desiredQty = input.stockQty ?? 0;
  const currentQty = Number(existing.stockQty);
  const delta = desiredQty - currentQty;

  return hairDb.transaction(async (tx) => {
    const db = tx as unknown as typeof hairDb;
    const [row] = await tx
      .update(fyhProducts)
      .set({
        name,
        sku: input.sku?.trim() || null,
        barcode: input.barcode?.trim() || null,
        brand: input.brand?.trim() || null,
        category: input.category?.trim() || null,
        description: input.description?.trim() || null,
        sellingPricePaise: toPaise(input.sellingPriceRupees),
        costPricePaise: toPaise(input.costPriceRupees ?? 0),
        reorderLevel: input.reorderLevel ?? 0,
        unit: input.unit?.trim() || 'unit',
        gstBps: Math.round((input.gstPercent ?? 0) * 100),
        isRetail: input.isRetail !== false,
        isConsumable: input.isConsumable !== false,
        isActive,
        archivedAt: isActive ? null : new Date(),
        updatedAt: new Date(),
      })
      .where(eq(fyhProducts.id, id))
      .returning();

    if (delta !== 0) {
      await applyMovement(db, {
        productId: id,
        quantityDelta: delta,
        movementType: 'adjustment',
        referenceType: 'product_edit',
        referenceId: id,
        notes: 'Stock corrected via product edit',
      });
    }

    const [updated] = await tx.select().from(fyhProducts).where(eq(fyhProducts.id, id)).limit(1);
    return updated!;
  });
}

export async function archiveProduct(id: string) {
  const [row] = await hairDb
    .update(fyhProducts)
    .set({ isActive: false, archivedAt: new Date(), updatedAt: new Date() })
    .where(eq(fyhProducts.id, id))
    .returning();
  if (!row) throw new Error('Product not found');
  return row;
}
