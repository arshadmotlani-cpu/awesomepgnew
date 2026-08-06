import { and, asc, eq, ilike, or } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import { fyhBrands, fyhProducts } from '@/src/hair/db/schema';
import type { FyhProduct } from '@/src/hair/db/schema';
import type { FyhProductType } from '@/src/hair/lib/productTypes';
import { parseProductType } from '@/src/hair/lib/productTypes';
import { applyMovement } from '@/src/hair/services/stock';

function toPaise(rupees: number): number {
  return Math.round(Number(rupees || 0) * 100);
}

export type ProductInput = {
  name: string;
  brandId: string;
  description?: string | null;
  productType: FyhProductType;
  costPriceRupees?: number;
  sellingPriceRupees?: number;
  stockQty?: number;
  isActive?: boolean;
};

export type ProductWithBrand = FyhProduct & { brandName: string };

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

export async function listProducts(opts?: {
  q?: string;
  status?: 'active' | 'inactive' | 'all';
}): Promise<ProductWithBrand[]> {
  const conditions = [];
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
    })
    .from(fyhProducts)
    .innerJoin(fyhBrands, eq(fyhBrands.id, fyhProducts.brandId))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(asc(fyhProducts.name))
    .limit(300);

  return rows.map((r) => ({ ...r.product, brandName: r.brandName }));
}

/** Professional products for service consumable kits. */
export async function listConsumableProducts() {
  return hairDb
    .select()
    .from(fyhProducts)
    .where(and(eq(fyhProducts.isActive, true), eq(fyhProducts.productType, 'professional')))
    .orderBy(asc(fyhProducts.name));
}

export async function getProduct(id: string): Promise<ProductWithBrand | null> {
  const [row] = await hairDb
    .select({
      product: fyhProducts,
      brandName: fyhBrands.name,
    })
    .from(fyhProducts)
    .innerJoin(fyhBrands, eq(fyhBrands.id, fyhProducts.brandId))
    .where(eq(fyhProducts.id, id))
    .limit(1);
  return row ? { ...row.product, brandName: row.brandName } : null;
}

export async function createProduct(input: ProductInput) {
  const name = validateProductInput(input);
  const openingQty = input.stockQty ?? 0;
  const productType = parseProductType(input.productType);
  const sellingPricePaise =
    productType === 'retail' ? toPaise(input.sellingPriceRupees ?? 0) : 0;

  return hairDb.transaction(async (tx) => {
    const db = tx as unknown as typeof hairDb;
    const [row] = await tx
      .insert(fyhProducts)
      .values({
        name,
        brandId: input.brandId,
        description: input.description?.trim() || null,
        productType,
        sellingPricePaise,
        costPricePaise: toPaise(input.costPriceRupees ?? 0),
        stockQty: 0,
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

    const created = await getProduct(row!.id);
    return created!;
  });
}

export async function updateProduct(id: string, input: ProductInput) {
  const name = validateProductInput(input);
  const isActive = input.isActive !== false;
  const productType = parseProductType(input.productType);
  const sellingPricePaise =
    productType === 'retail' ? toPaise(input.sellingPriceRupees ?? 0) : 0;

  const existing = await getProduct(id);
  if (!existing) throw new Error('Product not found');

  const desiredQty = input.stockQty ?? Number(existing.stockQty);
  const currentQty = Number(existing.stockQty);
  const delta = desiredQty - currentQty;

  return hairDb.transaction(async (tx) => {
    const db = tx as unknown as typeof hairDb;
    await tx
      .update(fyhProducts)
      .set({
        name,
        brandId: input.brandId,
        description: input.description?.trim() || null,
        productType,
        sellingPricePaise,
        costPricePaise: toPaise(input.costPriceRupees ?? 0),
        isActive,
        archivedAt: isActive ? null : new Date(),
        updatedAt: new Date(),
      })
      .where(eq(fyhProducts.id, id));

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

    const updated = await getProduct(id);
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

export async function deleteProduct(id: string) {
  const existing = await getProduct(id);
  if (!existing) throw new Error('Product not found');
  await hairDb.delete(fyhProducts).where(eq(fyhProducts.id, id));
}
