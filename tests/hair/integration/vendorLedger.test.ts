import { loadAppEnv } from '@/src/lib/db/loadEnv';
loadAppEnv();

import assert from 'node:assert/strict';
import test from 'node:test';
import { eq, sql } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import {
  fyhProducts,
  fyhStockMovements,
  fyhVendorPayables,
} from '@/src/hair/db/schema';
import { findOrCreateBrand } from '@/src/hair/services/brands';
import { getVendorLedger, getVendorOutstanding } from '@/src/hair/services/purchaseBrain';
import { createPurchase } from '@/src/hair/services/purchaseEngine';
import { recordPurchaseReturn } from '@/src/hair/services/purchaseReturnEngine';
import { createVendor } from '@/src/hair/services/vendors';
import {
  allocateVendorPayment,
  recordVendorPayment,
} from '@/src/hair/services/vendorPaymentEngine';
import { migrationSkipMessage, probeHairQuickSaleMigrations } from './migrationGuard.ts';

async function probeVendorLedgerMigrations(): Promise<boolean> {
  try {
    await hairDb.execute(sql`SELECT id FROM fyh_vendor_payments LIMIT 0`);
    await hairDb.execute(sql`SELECT id FROM fyh_vendor_payment_allocations LIMIT 0`);
    await hairDb.execute(sql`SELECT id FROM fyh_purchase_returns LIMIT 0`);
    return true;
  } catch {
    return false;
  }
}

async function createTestProduct(label: string) {
  const brand = await findOrCreateBrand(`Vendor Ledger Brand ${label}`);
  const [row] = await hairDb
    .insert(fyhProducts)
    .values({
      name: `Vendor Ledger Product ${label}`,
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

test('partial vendor payment reduces invoice payable balance', async (t) => {
  const probe = await probeHairQuickSaleMigrations();
  if (!probe.ok) t.skip(migrationSkipMessage(probe));
  if (!(await probeVendorLedgerMigrations())) {
    t.skip('Vendor ledger migration not applied. Run: npm run hair:db:migrate');
  }

  const suffix = Date.now().toString(36);
  const vendor = await createVendor({ name: `VL Vendor ${suffix}` });
  const product = await createTestProduct(suffix);

  const purchase = await createPurchase({
    vendorId: vendor!.id,
    purchaseDate: '2026-08-06',
    lines: [{ productId: product.id, quantity: 10, unitCostRupees: 2000 }],
    staffName: 'Test Owner',
  });

  const [payable] = await hairDb
    .select()
    .from(fyhVendorPayables)
    .where(eq(fyhVendorPayables.purchaseId, purchase.id))
    .limit(1);

  await recordVendorPayment({
    vendorId: vendor!.id,
    amountPaise: 8_000_00,
    paymentMethod: 'upi',
    paymentDate: '2026-08-07',
    staffName: 'Test Owner',
    allocations: [{ payableId: payable!.id, amountPaise: 8_000_00 }],
  });

  const [updated] = await hairDb
    .select()
    .from(fyhVendorPayables)
    .where(eq(fyhVendorPayables.id, payable!.id))
    .limit(1);

  assert.equal(updated!.balancePaise, 12_000_00);
  assert.equal(updated!.status, 'partial');
  assert.equal(await getVendorOutstanding(vendor!.id), 12_000_00);
});

test('one payment can allocate across multiple invoice payables', async (t) => {
  const probe = await probeHairQuickSaleMigrations();
  if (!probe.ok) t.skip(migrationSkipMessage(probe));
  if (!(await probeVendorLedgerMigrations())) {
    t.skip('Vendor ledger migration not applied. Run: npm run hair:db:migrate');
  }

  const suffix = Date.now().toString(36);
  const vendor = await createVendor({ name: `VL Multi ${suffix}` });
  const product = await createTestProduct(`${suffix}-multi`);

  const purchaseA = await createPurchase({
    vendorId: vendor!.id,
    purchaseDate: '2026-08-06',
    lines: [{ productId: product.id, quantity: 1, unitCostRupees: 1000 }],
    staffName: 'Test Owner',
  });
  const purchaseB = await createPurchase({
    vendorId: vendor!.id,
    purchaseDate: '2026-08-07',
    lines: [{ productId: product.id, quantity: 1, unitCostRupees: 500 }],
    staffName: 'Test Owner',
  });

  const payables = await hairDb
    .select()
    .from(fyhVendorPayables)
    .where(eq(fyhVendorPayables.vendorId, vendor!.id));

  const payableA = payables.find((p) => p.purchaseId === purchaseA.id)!;
  const payableB = payables.find((p) => p.purchaseId === purchaseB.id)!;

  await recordVendorPayment({
    vendorId: vendor!.id,
    amountPaise: 1_200_00,
    paymentMethod: 'bank',
    paymentDate: '2026-08-08',
    staffName: 'Test Owner',
    allocations: [
      { payableId: payableA.id, amountPaise: 1_000_00 },
      { payableId: payableB.id, amountPaise: 200_00 },
    ],
  });

  const refreshed = await hairDb
    .select()
    .from(fyhVendorPayables)
    .where(eq(fyhVendorPayables.vendorId, vendor!.id));

  const rowA = refreshed.find((p) => p.id === payableA.id)!;
  const rowB = refreshed.find((p) => p.id === payableB.id)!;
  assert.equal(rowA.balancePaise, 0);
  assert.equal(rowA.status, 'paid');
  assert.equal(rowB.balancePaise, 300_00);
  assert.equal(rowB.status, 'partial');
});

test('advance payment stays visible until allocated to future invoice', async (t) => {
  const probe = await probeHairQuickSaleMigrations();
  if (!probe.ok) t.skip(migrationSkipMessage(probe));
  if (!(await probeVendorLedgerMigrations())) {
    t.skip('Vendor ledger migration not applied. Run: npm run hair:db:migrate');
  }

  const suffix = Date.now().toString(36);
  const vendor = await createVendor({ name: `VL Advance ${suffix}` });
  const product = await createTestProduct(`${suffix}-adv`);

  const payment = await recordVendorPayment({
    vendorId: vendor!.id,
    amountPaise: 5_000_00,
    paymentMethod: 'cash',
    paymentDate: '2026-08-05',
    staffName: 'Test Owner',
    allocations: [],
  });

  let ledger = await getVendorLedger(vendor!.id);
  assert.equal(ledger!.unallocatedAdvancePaise, 5_000_00);
  assert.equal(ledger!.outstandingPaise, 0);

  const purchase = await createPurchase({
    vendorId: vendor!.id,
    purchaseDate: '2026-08-06',
    lines: [{ productId: product.id, quantity: 2, unitCostRupees: 1000 }],
    staffName: 'Test Owner',
  });

  const [payable] = await hairDb
    .select()
    .from(fyhVendorPayables)
    .where(eq(fyhVendorPayables.purchaseId, purchase.id))
    .limit(1);

  await allocateVendorPayment({
    paymentId: payment.id,
    allocations: [{ payableId: payable!.id, amountPaise: 2_000_00 }],
  });

  ledger = await getVendorLedger(vendor!.id);
  assert.equal(ledger!.unallocatedAdvancePaise, 3_000_00);
  assert.equal(ledger!.outstandingPaise, 0);
});

test('purchase return reduces stock and payable balance', async (t) => {
  const probe = await probeHairQuickSaleMigrations();
  if (!probe.ok) t.skip(migrationSkipMessage(probe));
  if (!(await probeVendorLedgerMigrations())) {
    t.skip('Vendor ledger migration not applied. Run: npm run hair:db:migrate');
  }

  const suffix = Date.now().toString(36);
  const vendor = await createVendor({ name: `VL Return ${suffix}` });
  const product = await createTestProduct(`${suffix}-ret`);

  const purchase = await createPurchase({
    vendorId: vendor!.id,
    purchaseDate: '2026-08-06',
    lines: [{ productId: product.id, quantity: 10, unitCostRupees: 100 }],
    staffName: 'Test Owner',
  });

  await recordPurchaseReturn({
    purchaseId: purchase.id,
    returnDate: '2026-08-07',
    lines: [{ productId: product.id, quantity: 2 }],
    staffName: 'Test Owner',
  });

  const [payable] = await hairDb
    .select()
    .from(fyhVendorPayables)
    .where(eq(fyhVendorPayables.purchaseId, purchase.id))
    .limit(1);

  assert.equal(payable!.balancePaise, 800_00);
  assert.equal(payable!.status, 'partial');

  const [movement] = await hairDb
    .select()
    .from(fyhStockMovements)
    .where(eq(fyhStockMovements.movementType, 'return'))
    .limit(1);
  assert.ok(movement);
  assert.equal(Number(movement.quantityDelta), -2);
});
