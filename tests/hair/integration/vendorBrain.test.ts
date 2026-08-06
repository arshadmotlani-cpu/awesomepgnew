import { loadAppEnv } from '@/src/lib/db/loadEnv';
loadAppEnv();

import assert from 'node:assert/strict';
import test from 'node:test';
import { eq, sql } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import { fyhProducts, fyhPurchaseAuditEvents, fyhVendorPayables } from '@/src/hair/db/schema';
import { findOrCreateBrand } from '@/src/hair/services/brands';
import { createPurchase, updatePurchase } from '@/src/hair/services/purchaseEngine';
import {
  defaultStatementDateRange,
  getVendorActivityTimeline,
  getVendorStatement,
} from '@/src/hair/services/vendorBrain';
import { createVendor } from '@/src/hair/services/vendors';
import {
  recordVendorPayment,
  reverseVendorPayment,
} from '@/src/hair/services/vendorPaymentEngine';
import { migrationSkipMessage, probeHairQuickSaleMigrations } from './migrationGuard.ts';

async function probeVendorBrainMigrations(): Promise<boolean> {
  try {
    await hairDb.execute(sql`SELECT payment_number FROM fyh_vendor_payments LIMIT 0`);
    await hairDb.execute(sql`SELECT id FROM fyh_purchase_audit_events LIMIT 0`);
    await hairDb.execute(sql`SELECT id FROM fyh_vendor_notes LIMIT 0`);
    return true;
  } catch {
    return false;
  }
}

async function createTestProduct(label: string) {
  const brand = await findOrCreateBrand(`VB Brand ${label}`);
  const [row] = await hairDb
    .insert(fyhProducts)
    .values({
      name: `VB Product ${label}`,
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

test('payment reversal restores payable balance and appears in timeline', async (t) => {
  const probe = await probeHairQuickSaleMigrations();
  if (!probe.ok) t.skip(migrationSkipMessage(probe));
  if (!(await probeVendorBrainMigrations())) {
    t.skip('Vendor Brain migration not applied. Run: npm run hair:db:migrate');
  }

  const suffix = Date.now().toString(36);
  const vendor = await createVendor({ name: `VB Reverse ${suffix}` });
  const product = await createTestProduct(suffix);

  const purchase = await createPurchase({
    vendorId: vendor!.id,
    purchaseDate: '2026-08-01',
    lines: [{ productId: product.id, quantity: 1, unitCostRupees: 1000 }],
    staffName: 'Test Owner',
  });

  const [payable] = await hairDb
    .select()
    .from(fyhVendorPayables)
    .where(eq(fyhVendorPayables.purchaseId, purchase.id))
    .limit(1);

  const payment = await recordVendorPayment({
    vendorId: vendor!.id,
    amountPaise: 500_00,
    paymentMethod: 'cash',
    paymentDate: '2026-08-02',
    staffName: 'Test Owner',
    allocations: [{ payableId: payable!.id, amountPaise: 500_00 }],
  });

  assert.ok(payment.paymentNumber.startsWith('VP-'));

  let [updated] = await hairDb
    .select()
    .from(fyhVendorPayables)
    .where(eq(fyhVendorPayables.id, payable!.id))
    .limit(1);
  assert.equal(updated!.balancePaise, 500_00);

  await reverseVendorPayment({
    paymentId: payment.id,
    reason: 'Test reversal',
    staffName: 'Test Owner',
  });

  [updated] = await hairDb
    .select()
    .from(fyhVendorPayables)
    .where(eq(fyhVendorPayables.id, payable!.id))
    .limit(1);
  assert.equal(updated!.balancePaise, 1000_00);

  const timeline = await getVendorActivityTimeline(vendor!.id);
  assert.ok(timeline.some((e) => e.type === 'payment_reversed'));
});

test('updatePurchase recalculates payable and writes audit event', async (t) => {
  const probe = await probeHairQuickSaleMigrations();
  if (!probe.ok) t.skip(migrationSkipMessage(probe));
  if (!(await probeVendorBrainMigrations())) {
    t.skip('Vendor Brain migration not applied. Run: npm run hair:db:migrate');
  }

  const suffix = Date.now().toString(36);
  const vendor = await createVendor({ name: `VB Edit ${suffix}` });
  const product = await createTestProduct(`${suffix}-edit`);

  const purchase = await createPurchase({
    vendorId: vendor!.id,
    purchaseDate: '2026-08-01',
    lines: [{ productId: product.id, quantity: 2, unitCostRupees: 100 }],
    staffName: 'Test Owner',
  });

  await updatePurchase(purchase.id, {
    purchaseDate: '2026-08-02',
    vendorInvoiceRef: 'INV-EDIT',
    notes: 'Edited',
    lines: [{ productId: product.id, quantity: 3, unitCostRupees: 100 }],
    staffName: 'Test Owner',
  });

  const [payable] = await hairDb
    .select()
    .from(fyhVendorPayables)
    .where(eq(fyhVendorPayables.purchaseId, purchase.id))
    .limit(1);
  assert.equal(payable!.amountPaise, 300_00);
  assert.equal(payable!.balancePaise, 300_00);

  const audits = await hairDb
    .select()
    .from(fyhPurchaseAuditEvents)
    .where(eq(fyhPurchaseAuditEvents.purchaseId, purchase.id));
  assert.equal(audits.length, 1);
  assert.equal(audits[0]!.action, 'purchase_edited');
});

test('vendor statement opening and closing balance math', async (t) => {
  const probe = await probeHairQuickSaleMigrations();
  if (!probe.ok) t.skip(migrationSkipMessage(probe));
  if (!(await probeVendorBrainMigrations())) {
    t.skip('Vendor Brain migration not applied. Run: npm run hair:db:migrate');
  }

  const suffix = Date.now().toString(36);
  const vendor = await createVendor({ name: `VB Stmt ${suffix}` });
  const product = await createTestProduct(`${suffix}-stmt`);

  await createPurchase({
    vendorId: vendor!.id,
    purchaseDate: '2026-08-10',
    lines: [{ productId: product.id, quantity: 1, unitCostRupees: 1000 }],
    staffName: 'Test Owner',
  });

  const period = { from: '2026-08-01', to: '2026-08-31' };
  const statement = await getVendorStatement(vendor!.id, period);
  assert.ok(statement);
  assert.equal(statement!.openingBalancePaise, 0);
  assert.equal(statement!.periodTotals.purchasesPaise, 1000_00);
  assert.equal(statement!.closingBalancePaise, 1000_00);

  const defaults = defaultStatementDateRange();
  assert.ok(defaults.from);
  assert.ok(defaults.to);
});
