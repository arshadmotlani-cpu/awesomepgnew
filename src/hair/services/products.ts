import { and, asc, eq, ilike, or } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import { fyhProducts } from '@/src/hair/db/schema';

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
  const [row] = await hairDb
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
      stockQty: input.stockQty ?? 0,
      reorderLevel: input.reorderLevel ?? 0,
      unit: input.unit?.trim() || 'unit',
      gstBps: Math.round((input.gstPercent ?? 0) * 100),
      isRetail: input.isRetail !== false,
      isConsumable: input.isConsumable !== false,
      isActive: input.isActive !== false,
    })
    .returning();
  return row;
}

export async function updateProduct(id: string, input: ProductInput) {
  const name = input.name.trim();
  if (!name) throw new Error('Product name is required');
  const isActive = input.isActive !== false;
  const [row] = await hairDb
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
      stockQty: input.stockQty ?? 0,
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
  if (!row) throw new Error('Product not found');
  return row;
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
