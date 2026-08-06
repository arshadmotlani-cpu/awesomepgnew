import { loadAppEnv } from '@/src/lib/db/loadEnv';
loadAppEnv();

import assert from 'node:assert/strict';
import test from 'node:test';
import { eq } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import {
  fyhExpenses,
  fyhPurchaseLines,
  fyhStockMovements,
  fyhVendorPayables,
} from '@/src/hair/db/schema';
import { findOrCreateBrand } from '@/src/hair/services/brands';
import { createPurchase } from '@/src/hair/services/purchaseEngine';
import { createVendor } from '@/src/hair/services/vendors';
import { fyhProducts } from '@/src/hair/db/schema';
import { migrationSkipMessage, probeHairQuickSaleMigrations } from './migrationGuard.ts';

async function createTestProduct(label: string) {
  const brand = await findOrCreateBrand(`Purchase Brain Brand ${label}`);
  const [row] = await hairDb
    .insert(fyhProducts)
    .values({
      name: `Purchase Brain Product ${label}`,
      brandId: brand.id,
      productType: 'professional',
      sellingPricePaise: 0,
      costPricePaise: 0,
      stockQty: 0,
      isActive: true,
    })
    .returning();
  return row!;
}

test('createPurchase atomically creates payable, movement, and expense', async (t) => {
  const probe = await probeHairQuickSaleMigrations();
  if (!probe.ok) t.skip(migrationSkipMessage(probe));

  const suffix = Date.now().toString(36);
  const vendor = await createVendor({ name: `PB Vendor ${suffix}` });
  const product = await createTestProduct(suffix);

  const purchase = await createPurchase({
    vendorId: vendor!.id,
    purchaseDate: '2026-08-06',
    vendorInvoiceRef: `INV-${suffix}`,
    lines: [{ productId: product.id, quantity: 5, unitCostRupees: 100 }],
    staffName: 'Test Owner',
  });

  assert.ok(purchase.id);
  assert.equal(purchase.totalPaise, 50_000);

  const [payable] = await hairDb
    .select()
    .from(fyhVendorPayables)
    .where(eq(fyhVendorPayables.purchaseId, purchase.id))
    .limit(1);
  assert.ok(payable);
  assert.equal(payable.amountPaise, 50_000);
  assert.equal(payable.balancePaise, 50_000);
  assert.equal(payable.status, 'open');

  const lines = await hairDb
    .select()
    .from(fyhPurchaseLines)
    .where(eq(fyhPurchaseLines.purchaseId, purchase.id));
  assert.equal(lines.length, 1);
  assert.equal(Number(lines[0]!.quantity), 5);

  const [movement] = await hairDb
    .select()
    .from(fyhStockMovements)
    .where(eq(fyhStockMovements.referenceId, purchase.id))
    .limit(1);
  assert.ok(movement);
  assert.equal(movement.movementType, 'purchase');
  assert.equal(movement.referenceType, 'purchase');
  assert.equal(Number(movement.quantityDelta), 5);

  const [expense] = await hairDb
    .select()
    .from(fyhExpenses)
    .where(eq(fyhExpenses.purchaseId, purchase.id))
    .limit(1);
  assert.ok(expense);
  assert.equal(expense.category, 'inventory_purchase');
  assert.equal(expense.amountPaise, 50_000);
});

test('each purchase gets its own payable; vendor outstanding is sum of invoice balances', async (t) => {
  const probe = await probeHairQuickSaleMigrations();
  if (!probe.ok) t.skip(migrationSkipMessage(probe));

  const suffix = Date.now().toString(36);
  const vendor = await createVendor({ name: `PB Vendor Multi ${suffix}` });
  const product = await createTestProduct(`${suffix}-multi`);

  const purchaseA = await createPurchase({
    vendorId: vendor!.id,
    purchaseDate: '2026-08-06',
    vendorInvoiceRef: `INV-A-${suffix}`,
    lines: [{ productId: product.id, quantity: 2, unitCostRupees: 100 }],
    staffName: 'Test Owner',
  });
  const purchaseB = await createPurchase({
    vendorId: vendor!.id,
    purchaseDate: '2026-08-07',
    vendorInvoiceRef: `INV-B-${suffix}`,
    lines: [{ productId: product.id, quantity: 3, unitCostRupees: 100 }],
    staffName: 'Test Owner',
  });

  const payables = await hairDb
    .select()
    .from(fyhVendorPayables)
    .where(eq(fyhVendorPayables.vendorId, vendor!.id));

  assert.equal(payables.length, 2, 'one payable row per purchase invoice');
  assert.notEqual(payables[0]!.purchaseId, payables[1]!.purchaseId);
  assert.ok(payables.some((p) => p.purchaseId === purchaseA.id));
  assert.ok(payables.some((p) => p.purchaseId === purchaseB.id));

  const { getVendorOutstanding } = await import('@/src/hair/services/purchaseBrain');
  const outstanding = await getVendorOutstanding(vendor!.id);
  assert.equal(outstanding, 20_000 + 30_000);
});
