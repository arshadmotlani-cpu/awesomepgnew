import { desc, eq } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import {
  fyhGoodsReceiptLines,
  fyhGoodsReceipts,
  fyhProducts,
  fyhPurchaseOrderLines,
  fyhPurchaseOrders,
  fyhStockAdjustments,
  fyhVendors,
} from '@/src/hair/db/schema';
import { applyMovement, updateWeightedAverageCost } from '@/src/hair/services/stock';

export type PoLineInput = {
  productId: string;
  quantityOrdered: number;
  unitCostRupees?: number;
};

export type GrnLineInput = {
  productId: string;
  quantityReceived: number;
  unitCostRupees?: number;
  batchNumber?: string | null;
  expiryDate?: string | null;
};

function toPaise(rupees: number): number {
  return Math.round(Number(rupees || 0) * 100);
}

async function nextPoNumber(): Promise<string> {
  const ts = Date.now().toString(36).toUpperCase();
  return `PO-${ts}`;
}

export async function listPurchaseOrders(limit = 100) {
  return hairDb
    .select({
      po: fyhPurchaseOrders,
      vendorName: fyhVendors.name,
    })
    .from(fyhPurchaseOrders)
    .innerJoin(fyhVendors, eq(fyhVendors.id, fyhPurchaseOrders.vendorId))
    .orderBy(desc(fyhPurchaseOrders.createdAt))
    .limit(limit);
}

export async function getPurchaseOrder(id: string) {
  const [header] = await hairDb
    .select({
      po: fyhPurchaseOrders,
      vendorName: fyhVendors.name,
    })
    .from(fyhPurchaseOrders)
    .innerJoin(fyhVendors, eq(fyhVendors.id, fyhPurchaseOrders.vendorId))
    .where(eq(fyhPurchaseOrders.id, id))
    .limit(1);
  if (!header) return null;

  const lines = await hairDb
    .select({
      line: fyhPurchaseOrderLines,
      productName: fyhProducts.name,
      productSku: fyhProducts.sku,
    })
    .from(fyhPurchaseOrderLines)
    .innerJoin(fyhProducts, eq(fyhProducts.id, fyhPurchaseOrderLines.productId))
    .where(eq(fyhPurchaseOrderLines.purchaseOrderId, id));

  return { ...header, lines };
}

export async function createPurchaseOrder(input: {
  vendorId: string;
  notes?: string | null;
  lines: PoLineInput[];
  markOrdered?: boolean;
}) {
  if (!input.lines.length) throw new Error('At least one line is required');

  const [vendor] = await hairDb
    .select()
    .from(fyhVendors)
    .where(eq(fyhVendors.id, input.vendorId))
    .limit(1);
  if (!vendor) throw new Error('Vendor not found');

  const poNumber = await nextPoNumber();
  const markOrdered = input.markOrdered === true;

  return hairDb.transaction(async (tx) => {
    const [po] = await tx
      .insert(fyhPurchaseOrders)
      .values({
        vendorId: input.vendorId,
        poNumber,
        status: markOrdered ? 'ordered' : 'draft',
        orderedAt: markOrdered ? new Date() : null,
        notes: input.notes?.trim() || null,
      })
      .returning();

    for (const line of input.lines) {
      if (line.quantityOrdered <= 0) throw new Error('Quantity must be positive');
      await tx.insert(fyhPurchaseOrderLines).values({
        purchaseOrderId: po!.id,
        productId: line.productId,
        quantityOrdered: line.quantityOrdered,
        unitCostPaise: toPaise(line.unitCostRupees ?? 0),
      });
    }

    return po!;
  });
}

export async function receiveGoodsReceipt(input: {
  vendorId: string;
  purchaseOrderId?: string | null;
  notes?: string | null;
  lines: GrnLineInput[];
}) {
  if (!input.lines.length) throw new Error('At least one line is required');

  const [vendor] = await hairDb
    .select()
    .from(fyhVendors)
    .where(eq(fyhVendors.id, input.vendorId))
    .limit(1);
  if (!vendor) throw new Error('Vendor not found');

  if (input.purchaseOrderId) {
    const [po] = await hairDb
      .select()
      .from(fyhPurchaseOrders)
      .where(eq(fyhPurchaseOrders.id, input.purchaseOrderId))
      .limit(1);
    if (!po) throw new Error('Purchase order not found');
    if (po.status === 'cancelled') throw new Error('Cannot receive against a cancelled PO');
  }

  return hairDb.transaction(async (tx) => {
    const db = tx as unknown as typeof hairDb;

    const [grn] = await tx
      .insert(fyhGoodsReceipts)
      .values({
        vendorId: input.vendorId,
        purchaseOrderId: input.purchaseOrderId ?? null,
        notes: input.notes?.trim() || null,
      })
      .returning();

    for (const line of input.lines) {
      const qty = Number(line.quantityReceived);
      if (qty <= 0) throw new Error('Quantity must be positive');
      const unitCostPaise = toPaise(line.unitCostRupees ?? 0);

      await updateWeightedAverageCost(db, line.productId, qty, unitCostPaise);

      await tx.insert(fyhGoodsReceiptLines).values({
        goodsReceiptId: grn!.id,
        productId: line.productId,
        quantityReceived: qty,
        unitCostPaise,
        batchNumber: line.batchNumber?.trim() || null,
        expiryDate: line.expiryDate || null,
      });

      await applyMovement(db, {
        productId: line.productId,
        quantityDelta: qty,
        movementType: 'purchase',
        referenceType: 'goods_receipt',
        referenceId: grn!.id,
        notes: `GRN from ${vendor.name}`,
      });
    }

    if (input.purchaseOrderId) {
      await tx
        .update(fyhPurchaseOrders)
        .set({ status: 'received' })
        .where(eq(fyhPurchaseOrders.id, input.purchaseOrderId));
    }

    return grn!;
  });
}

export async function listAdjustments(limit = 100) {
  return hairDb
    .select({
      adjustment: fyhStockAdjustments,
      productName: fyhProducts.name,
      productSku: fyhProducts.sku,
    })
    .from(fyhStockAdjustments)
    .innerJoin(fyhProducts, eq(fyhProducts.id, fyhStockAdjustments.productId))
    .orderBy(desc(fyhStockAdjustments.createdAt))
    .limit(limit);
}

export async function createStockAdjustment(input: {
  productId: string;
  quantityDelta: number;
  reason: string;
  notes?: string | null;
}) {
  const delta = Number(input.quantityDelta);
  if (delta === 0) throw new Error('Adjustment quantity cannot be zero');
  const reason = input.reason.trim();
  if (!reason) throw new Error('Reason is required');

  const [product] = await hairDb
    .select()
    .from(fyhProducts)
    .where(eq(fyhProducts.id, input.productId))
    .limit(1);
  if (!product) throw new Error('Product not found');

  return hairDb.transaction(async (tx) => {
    const db = tx as unknown as typeof hairDb;

    const [adjustment] = await tx
      .insert(fyhStockAdjustments)
      .values({
        productId: input.productId,
        quantityDelta: delta,
        reason,
        notes: input.notes?.trim() || null,
      })
      .returning();

    await applyMovement(db, {
      productId: input.productId,
      quantityDelta: delta,
      movementType: 'adjustment',
      referenceType: 'stock_adjustment',
      referenceId: adjustment!.id,
      notes: reason,
    });

    return adjustment!;
  });
}

export async function listGoodsReceipts(limit = 100) {
  return hairDb
    .select({
      grn: fyhGoodsReceipts,
      vendorName: fyhVendors.name,
    })
    .from(fyhGoodsReceipts)
    .innerJoin(fyhVendors, eq(fyhVendors.id, fyhGoodsReceipts.vendorId))
    .orderBy(desc(fyhGoodsReceipts.receivedAt))
    .limit(limit);
}
