import { desc, eq, sql } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import {
  fyhBrands,
  fyhExpenses,
  fyhProducts,
  fyhPurchaseAuditEvents,
  fyhPurchaseLines,
  fyhPurchases,
  fyhVendorPayables,
  fyhVendors,
} from '@/src/hair/db/schema';
import type { FyhExpensePaymentMethod } from '@/src/hair/lib/expenseCategories';
import {
  buildPurchaseRecordedEvent,
  emitPurchaseRecordedEvent,
} from '@/src/hair/lib/purchaseEvents';
import { applyMovement, updateWeightedAverageCost } from '@/src/hair/services/stock';
import { refreshPayableBalance } from '@/src/hair/services/vendorPaymentEngine';

export type PurchaseLineInput = {
  productId: string;
  quantity: number;
  unitCostRupees: number;
};

export type CreatePurchaseInput = {
  vendorId: string;
  purchaseDate: string;
  vendorInvoiceRef?: string | null;
  notes?: string | null;
  lines: PurchaseLineInput[];
  staffName: string;
  staffEmployeeId?: string | null;
  paymentMethod?: FyhExpensePaymentMethod;
};

function toPaise(rupees: number): number {
  return Math.round(Number(rupees || 0) * 100);
}

async function nextPurchaseNumber(): Promise<string> {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `PUR-${ts}${rand}`;
}

function validateLines(lines: PurchaseLineInput[]) {
  if (!lines.length) throw new Error('At least one product line is required');
  for (const line of lines) {
    if (!line.productId) throw new Error('Each line requires a product');
    const qty = Number(line.quantity);
    if (!Number.isFinite(qty) || qty <= 0) throw new Error('Quantity must be positive');
    const cost = Number(line.unitCostRupees);
    if (!Number.isFinite(cost) || cost < 0) throw new Error('Unit cost cannot be negative');
  }
}

export async function createPurchase(input: CreatePurchaseInput) {
  validateLines(input.lines);

  const [vendor] = await hairDb
    .select()
    .from(fyhVendors)
    .where(eq(fyhVendors.id, input.vendorId))
    .limit(1);
  if (!vendor) throw new Error('Vendor not found');
  if (!vendor.isActive) throw new Error('Vendor is archived');

  const purchaseNumber = await nextPurchaseNumber();
  const lineTotals = input.lines.map((line) => {
    const qty = Number(line.quantity);
    const unitCostPaise = toPaise(line.unitCostRupees);
    return { ...line, qty, unitCostPaise, lineTotalPaise: Math.round(qty * unitCostPaise) };
  });
  const totalPaise = lineTotals.reduce((sum, l) => sum + l.lineTotalPaise, 0);

  return hairDb.transaction(async (tx) => {
    const db = tx as unknown as typeof hairDb;

    const [purchase] = await tx
      .insert(fyhPurchases)
      .values({
        vendorId: input.vendorId,
        purchaseNumber,
        vendorInvoiceRef: input.vendorInvoiceRef?.trim() || null,
        purchaseDate: input.purchaseDate,
        totalPaise,
        notes: input.notes?.trim() || null,
        status: 'posted',
        staffName: input.staffName.trim(),
        staffEmployeeId: input.staffEmployeeId ?? null,
      })
      .returning();

    for (const line of lineTotals) {
      await tx.insert(fyhPurchaseLines).values({
        purchaseId: purchase!.id,
        productId: line.productId,
        quantity: line.qty,
        unitCostPaise: line.unitCostPaise,
        lineTotalPaise: line.lineTotalPaise,
      });

      await updateWeightedAverageCost(db, line.productId, line.qty, line.unitCostPaise);

      await applyMovement(db, {
        productId: line.productId,
        quantityDelta: line.qty,
        movementType: 'purchase',
        referenceType: 'purchase',
        referenceId: purchase!.id,
        notes: `Purchase ${purchaseNumber} from ${vendor.name}`,
      });
    }

    await tx.insert(fyhVendorPayables).values({
      vendorId: input.vendorId,
      purchaseId: purchase!.id,
      amountPaise: totalPaise,
      balancePaise: totalPaise,
      status: 'open',
    });

    await tx.insert(fyhExpenses).values({
      title: `Purchase ${purchaseNumber} — ${vendor.name}`,
      category: 'inventory_purchase',
      expenseDate: input.purchaseDate,
      amountPaise: totalPaise,
      paymentMethod: input.paymentMethod ?? 'online',
      notes: input.notes?.trim() || null,
      staffName: input.staffName.trim(),
      staffEmployeeId: input.staffEmployeeId ?? null,
      purchaseId: purchase!.id,
    });

    emitPurchaseRecordedEvent(
      buildPurchaseRecordedEvent({
        purchaseId: purchase!.id,
        vendorId: input.vendorId,
        totalPaise,
        purchaseDate: input.purchaseDate,
      }),
    );

    return purchase!;
  });
}

export async function getPurchaseEngineDetail(purchaseId: string) {
  const [header] = await hairDb
    .select({
      purchase: fyhPurchases,
      vendorName: fyhVendors.name,
    })
    .from(fyhPurchases)
    .innerJoin(fyhVendors, eq(fyhVendors.id, fyhPurchases.vendorId))
    .where(eq(fyhPurchases.id, purchaseId))
    .limit(1);
  if (!header) return null;

  const lines = await hairDb
    .select({
      line: fyhPurchaseLines,
      productName: fyhProducts.name,
      brandName: fyhBrands.name,
    })
    .from(fyhPurchaseLines)
    .innerJoin(fyhProducts, eq(fyhProducts.id, fyhPurchaseLines.productId))
    .innerJoin(fyhBrands, eq(fyhBrands.id, fyhProducts.brandId))
    .where(eq(fyhPurchaseLines.purchaseId, purchaseId));

  const [payable] = await hairDb
    .select()
    .from(fyhVendorPayables)
    .where(eq(fyhVendorPayables.purchaseId, purchaseId))
    .limit(1);

  return { ...header, lines, payable: payable ?? null };
}

export type UpdatePurchaseInput = {
  vendorInvoiceRef?: string | null;
  purchaseDate: string;
  notes?: string | null;
  lines: PurchaseLineInput[];
  staffName: string;
  staffEmployeeId?: string | null;
};

export async function attachPurchaseInvoice(
  purchaseId: string,
  input: {
    attachmentUrl: string;
    attachmentContentType: string;
    staffName: string;
  },
) {
  const [updated] = await hairDb
    .update(fyhPurchases)
    .set({
      attachmentUrl: input.attachmentUrl,
      attachmentContentType: input.attachmentContentType,
      attachmentUploadedAt: new Date(),
      attachmentUploadedBy: input.staffName.trim(),
      updatedAt: new Date(),
    })
    .where(eq(fyhPurchases.id, purchaseId))
    .returning();
  if (!updated) throw new Error('Purchase not found');
  return updated;
}

export async function updatePurchase(purchaseId: string, input: UpdatePurchaseInput) {
  validateLines(input.lines);

  return hairDb.transaction(async (tx) => {
    const db = tx as unknown as typeof hairDb;

    await tx.execute(sql`SELECT id FROM fyh_purchases WHERE id = ${purchaseId} FOR UPDATE`);

    const [purchase] = await tx
      .select()
      .from(fyhPurchases)
      .where(eq(fyhPurchases.id, purchaseId))
      .limit(1);
    if (!purchase) throw new Error('Purchase not found');
    if (purchase.status !== 'posted') throw new Error('Cannot edit a cancelled purchase');

    const [payable] = await tx
      .select()
      .from(fyhVendorPayables)
      .where(eq(fyhVendorPayables.purchaseId, purchaseId))
      .limit(1);
    if (!payable) throw new Error('Payable not found');

    const oldLines = await tx
      .select()
      .from(fyhPurchaseLines)
      .where(eq(fyhPurchaseLines.purchaseId, purchaseId));

    const lineTotals = input.lines.map((line) => {
      const qty = Number(line.quantity);
      const unitCostPaise = toPaise(line.unitCostRupees);
      return { ...line, qty, unitCostPaise, lineTotalPaise: Math.round(qty * unitCostPaise) };
    });
    const newTotalPaise = lineTotals.reduce((sum, l) => sum + l.lineTotalPaise, 0);
    const settledPaise = payable.amountPaise - payable.balancePaise;
    if (newTotalPaise < settledPaise) {
      throw new Error('New purchase total cannot be less than amount already paid or returned');
    }

    const before = {
      vendorInvoiceRef: purchase.vendorInvoiceRef,
      purchaseDate: purchase.purchaseDate,
      notes: purchase.notes,
      totalPaise: purchase.totalPaise,
      lines: oldLines.map((l) => ({
        productId: l.productId,
        quantity: Number(l.quantity),
        unitCostPaise: l.unitCostPaise,
      })),
    };

    const oldByProduct = new Map(
      oldLines.map((l) => [l.productId, { qty: Number(l.quantity), unitCostPaise: l.unitCostPaise }]),
    );
    const newByProduct = new Map(
      lineTotals.map((l) => [l.productId, { qty: l.qty, unitCostPaise: l.unitCostPaise }]),
    );

    const productIds = new Set([...oldByProduct.keys(), ...newByProduct.keys()]);
    for (const productId of productIds) {
      const oldLine = oldByProduct.get(productId);
      const newLine = newByProduct.get(productId);
      const oldQty = oldLine?.qty ?? 0;
      const newQty = newLine?.qty ?? 0;
      const delta = newQty - oldQty;
      if (delta !== 0) {
        await applyMovement(db, {
          productId,
          quantityDelta: delta,
          movementType: 'adjustment',
          referenceType: 'purchase_edit',
          referenceId: purchaseId,
          notes: `Purchase edit ${purchase.purchaseNumber}`,
        });
      }
      if (delta > 0 && newLine) {
        await updateWeightedAverageCost(db, productId, delta, newLine.unitCostPaise);
      }
    }

    await tx.delete(fyhPurchaseLines).where(eq(fyhPurchaseLines.purchaseId, purchaseId));
    for (const line of lineTotals) {
      await tx.insert(fyhPurchaseLines).values({
        purchaseId,
        productId: line.productId,
        quantity: line.qty,
        unitCostPaise: line.unitCostPaise,
        lineTotalPaise: line.lineTotalPaise,
      });
    }

    await tx
      .update(fyhPurchases)
      .set({
        vendorInvoiceRef: input.vendorInvoiceRef?.trim() || null,
        purchaseDate: input.purchaseDate,
        notes: input.notes?.trim() || null,
        totalPaise: newTotalPaise,
        updatedAt: new Date(),
      })
      .where(eq(fyhPurchases.id, purchaseId));

    await tx
      .update(fyhVendorPayables)
      .set({ amountPaise: newTotalPaise, updatedAt: new Date() })
      .where(eq(fyhVendorPayables.id, payable.id));

    await refreshPayableBalance(db, payable.id);

    await tx
      .update(fyhExpenses)
      .set({
        amountPaise: newTotalPaise,
        expenseDate: input.purchaseDate,
        notes: input.notes?.trim() || null,
        updatedAt: new Date(),
      })
      .where(eq(fyhExpenses.purchaseId, purchaseId));

    await tx.insert(fyhPurchaseAuditEvents).values({
      purchaseId,
      action: 'purchase_edited',
      diff: {
        before,
        after: {
          vendorInvoiceRef: input.vendorInvoiceRef?.trim() || null,
          purchaseDate: input.purchaseDate,
          notes: input.notes?.trim() || null,
          totalPaise: newTotalPaise,
          lines: lineTotals.map((l) => ({
            productId: l.productId,
            quantity: l.qty,
            unitCostPaise: l.unitCostPaise,
          })),
        },
      },
      staffName: input.staffName.trim(),
      staffEmployeeId: input.staffEmployeeId ?? null,
    });

    const [updated] = await tx
      .select()
      .from(fyhPurchases)
      .where(eq(fyhPurchases.id, purchaseId))
      .limit(1);
    return updated!;
  });
}
