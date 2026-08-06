import { desc, eq, sql } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import {
  fyhBrands,
  fyhExpenses,
  fyhProducts,
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
  return `PUR-${ts}`;
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
