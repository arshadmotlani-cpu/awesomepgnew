import { and, eq, sql } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import {
  fyhPurchaseLines,
  fyhPurchaseReturnLines,
  fyhPurchaseReturns,
  fyhPurchases,
  fyhVendorPayables,
} from '@/src/hair/db/schema';
import { applyMovement } from '@/src/hair/services/stock';
import { refreshPayableBalance } from '@/src/hair/services/vendorPaymentEngine';
import type { HairDb } from '@/src/hair/services/stock';
import type { TenantContext } from '@/src/hair/lib/tenant/types';
import { orgFilter, locationFilter, tenantWriteDefaults, tenantOrgDefaults } from '@/src/hair/lib/tenant/filters';

export type PurchaseReturnLineInput = {
  productId: string;
  quantity: number;
};

export type RecordPurchaseReturnInput = {
  purchaseId: string;
  returnDate: string;
  lines: PurchaseReturnLineInput[];
  notes?: string | null;
  staffName: string;
  staffEmployeeId?: string | null;
};

function validateReturnLines(lines: PurchaseReturnLineInput[]) {
  if (!lines.length) throw new Error('Add at least one return line');
  for (const line of lines) {
    const qty = Number(line.quantity);
    if (!line.productId) throw new Error('Each line requires a product');
    if (!Number.isFinite(qty) || qty <= 0) throw new Error('Return quantity must be positive');
  }
}

async function getReturnedQtyByProduct(
  db: HairDb,
  purchaseId: string,
  ctx?: TenantContext | null,
): Promise<Map<string, number>> {
  const rows = await db
    .select({
      productId: fyhPurchaseReturnLines.productId,
      qty: sql<number>`coalesce(sum(${fyhPurchaseReturnLines.quantity}), 0)`,
    })
    .from(fyhPurchaseReturnLines)
    .innerJoin(fyhPurchaseReturns, eq(fyhPurchaseReturns.id, fyhPurchaseReturnLines.returnId))
    .where(and(orgFilter(fyhPurchaseReturns.organizationId, ctx), locationFilter(fyhPurchaseReturns.locationId, ctx), eq(fyhPurchaseReturns.purchaseId, purchaseId)))
    .groupBy(fyhPurchaseReturnLines.productId);

  return new Map(rows.map((r) => [r.productId, Number(r.qty)]));
}

export async function recordPurchaseReturn(input: RecordPurchaseReturnInput, ctx?: TenantContext | null) {
  validateReturnLines(input.lines);

  return hairDb.transaction(async (tx) => {
    const db = tx as unknown as HairDb;

    const [header] = await tx
      .select({
        purchase: fyhPurchases,
        payable: fyhVendorPayables,
      })
      .from(fyhPurchases)
      .innerJoin(fyhVendorPayables, eq(fyhVendorPayables.purchaseId, fyhPurchases.id))
      .where(and(orgFilter(fyhPurchases.organizationId, ctx), locationFilter(fyhPurchases.locationId, ctx), eq(fyhPurchases.id, input.purchaseId)))
      .limit(1);

    if (!header) throw new Error('Purchase not found');
    if (header.purchase.status !== 'posted') throw new Error('Cannot return against a cancelled purchase');

    const purchaseLines = await tx
      .select()
      .from(fyhPurchaseLines)
      .where(and(orgFilter(fyhPurchaseLines.organizationId, ctx), locationFilter(fyhPurchaseLines.locationId, ctx), eq(fyhPurchaseLines.purchaseId, input.purchaseId)));

    const lineByProduct = new Map(purchaseLines.map((l) => [l.productId, l]));
    const alreadyReturned = await getReturnedQtyByProduct(db, input.purchaseId, ctx);

    const computedLines = input.lines.map((line) => {
      const purchaseLine = lineByProduct.get(line.productId);
      if (!purchaseLine) throw new Error('Product was not on the original purchase invoice');
      const qty = Number(line.quantity);
      const purchased = Number(purchaseLine.quantity);
      const priorReturns = alreadyReturned.get(line.productId) ?? 0;
      if (qty + priorReturns > purchased) {
        throw new Error('Return quantity exceeds remaining purchased quantity');
      }
      const unitCostPaise = purchaseLine.unitCostPaise;
      const lineCreditPaise = Math.round(qty * unitCostPaise);
      return {
        productId: line.productId,
        quantity: qty,
        unitCostPaise,
        lineCreditPaise,
      };
    });

    const creditPaise = computedLines.reduce((s, l) => s + l.lineCreditPaise, 0);
    if (creditPaise <= 0) throw new Error('Return credit must be positive');
    if (creditPaise > header.payable.balancePaise) {
      throw new Error('Return credit exceeds invoice balance');
    }

    const [purchaseReturn] = await tx
      .insert(fyhPurchaseReturns)
      .values({
        purchaseId: input.purchaseId,
        payableId: header.payable.id,
        vendorId: header.purchase.vendorId,
        returnDate: input.returnDate,
        creditPaise,
        notes: input.notes?.trim() || null,
        staffName: input.staffName.trim(),
        staffEmployeeId: input.staffEmployeeId ?? null,
      })
      .returning();

    for (const line of computedLines) {
      await tx.insert(fyhPurchaseReturnLines).values({
        returnId: purchaseReturn!.id,
        productId: line.productId,
        quantity: line.quantity,
        unitCostPaise: line.unitCostPaise,
        lineCreditPaise: line.lineCreditPaise,
      });

      await applyMovement(db, {
        productId: line.productId,
        quantityDelta: -line.quantity,
        movementType: 'return',
        referenceType: 'purchase_return',
        referenceId: purchaseReturn!.id,
        notes: `Return against ${header.purchase.purchaseNumber}`,
      });
    }

    await refreshPayableBalance(db, header.payable.id);

    return purchaseReturn!;
  });
}

export async function listPurchaseReturnsForVendor(vendorId: string, ctx?: TenantContext | null) {
  return hairDb
    .select({
      purchaseReturn: fyhPurchaseReturns,
      purchaseNumber: fyhPurchases.purchaseNumber,
    })
    .from(fyhPurchaseReturns)
    .innerJoin(fyhPurchases, eq(fyhPurchases.id, fyhPurchaseReturns.purchaseId))
    .where(and(orgFilter(fyhPurchaseReturns.organizationId, ctx), locationFilter(fyhPurchaseReturns.locationId, ctx), eq(fyhPurchaseReturns.vendorId, vendorId)))
    .orderBy(sql`${fyhPurchaseReturns.returnDate} DESC`);
}
