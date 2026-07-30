import { loadAppEnv } from '@/src/lib/db/loadEnv';
loadAppEnv();

import assert from 'node:assert/strict';
import test from 'node:test';
import { eq } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import { fyhProducts, fyhStockMovements } from '@/src/hair/db/schema';
import {
  createQuickSaleInvoice,
  getInvoiceGrandTotal,
  recordInvoicePayments,
} from '@/src/hair/services/invoices';
import { createStockAdjustment, receiveGoodsReceipt } from '@/src/hair/services/purchases';
import { createVendor } from '@/src/hair/services/vendors';
import { applyMovement, getOnHand } from '@/src/hair/services/stock';
import { createRcCustomer, requireRcFixtures } from './rcFixtures.ts';
import { migrationSkipMessage, probeHairQuickSaleMigrations } from './migrationGuard.ts';

async function createIsolatedProduct(label: string) {
  const [row] = await hairDb
    .insert(fyhProducts)
    .values({
      name: `Inv Ops ${label}`,
      sku: `INV-${label}-${Date.now()}`,
      sellingPricePaise: 15_000,
      costPricePaise: 8_000,
      stockQty: 0,
      isActive: true,
      isRetail: true,
    })
    .returning();
  await applyMovement(hairDb, {
    productId: row!.id,
    quantityDelta: 20,
    movementType: 'opening',
    notes: 'test seed',
  });
  return row!;
}

test('stock adjustment increases on-hand via StockService', async (t) => {
  const probe = await probeHairQuickSaleMigrations();
  if (!probe.ok) t.skip(migrationSkipMessage(probe));

  const product = await createIsolatedProduct('adj');
  const before = await getOnHand(product.id);

  await createStockAdjustment({
    productId: product.id,
    quantityDelta: 5,
    reason: 'Integration test count',
  });

  const after = await getOnHand(product.id);
  assert.equal(after, before + 5);
});

test('GRN receive increases stock and writes purchase movement', async (t) => {
  const probe = await probeHairQuickSaleMigrations();
  if (!probe.ok) t.skip(migrationSkipMessage(probe));

  const product = await createIsolatedProduct('grn');
  const vendor = await createVendor({ name: `RC Vendor ${Date.now()}` });
  const before = await getOnHand(product.id);

  const grn = await receiveGoodsReceipt({
    vendorId: vendor.id,
    lines: [{ productId: product.id, quantityReceived: 7, unitCostRupees: 50 }],
  });

  const after = await getOnHand(product.id);
  assert.equal(after, before + 7);

  const movements = await hairDb
    .select()
    .from(fyhStockMovements)
    .where(eq(fyhStockMovements.referenceId, grn.id));
  assert.equal(movements.length, 1);
  assert.equal(movements[0]?.movementType, 'purchase');
  assert.equal(Number(movements[0]?.quantityAfter), after);
});

test('paid quick sale decreases product stock via StockService', async (t) => {
  const probe = await probeHairQuickSaleMigrations();
  if (!probe.ok) t.skip(migrationSkipMessage(probe));

  const f = await requireRcFixtures();
  const customer = await createRcCustomer('inv-sale');
  const product = await createIsolatedProduct('sale');
  const before = await getOnHand(product.id);

  const invoiceId = await createQuickSaleInvoice(customer.id, [
    { kind: 'product', refId: product.id, quantity: 2, staffId: f.staff.id },
  ]);

  const due = await getInvoiceGrandTotal(invoiceId);
  await recordInvoicePayments(invoiceId, [{ method: 'cash', amountPaise: due }]);

  const after = await getOnHand(product.id);
  assert.equal(after, before - 2);

  const movements = await hairDb
    .select()
    .from(fyhStockMovements)
    .where(eq(fyhStockMovements.referenceId, invoiceId));
  assert.ok(movements.some((m) => m.movementType === 'sale'));
  assert.ok(movements.every((m) => m.quantityAfter != null));
});
