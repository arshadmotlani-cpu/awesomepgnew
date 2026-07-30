import { loadAppEnv } from '@/src/lib/db/loadEnv';
loadAppEnv();

import assert from 'node:assert/strict';
import test from 'node:test';
import { and, eq } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import {
  fyhCustomerMemberships,
  fyhInvoices,
  fyhStockMovements,
} from '@/src/hair/db/schema';
import {
  createQuickSaleInvoice,
  getInvoiceGrandTotal,
  recordInvoicePayments,
} from '@/src/hair/services/invoices';
import { loadQuickSaleHold, saveQuickSaleHold } from '@/src/hair/services/quickSaleHold';
import { getOnHand } from '@/src/hair/services/stock';
import { createRcCustomer, requireRcFixtures } from './rcFixtures.ts';
import { migrationSkipMessage, probeHairQuickSaleMigrations } from './migrationGuard.ts';

test('quick sale paid: activates membership, deducts service consumables', async (t) => {
  const probe = await probeHairQuickSaleMigrations();
  if (!probe.ok) t.skip(migrationSkipMessage(probe));
  const f = await requireRcFixtures();
  const customer = await createRcCustomer('qs');

  const invoiceId = await createQuickSaleInvoice(customer.id, [
    { kind: 'service', refId: f.cut.id, quantity: 1, staffId: f.staff.id },
    { kind: 'membership', refId: f.membership.id, quantity: 1 },
  ]);

  const due = await getInvoiceGrandTotal(invoiceId);
  assert.ok(due > 0);
  const beforePay = await getOnHand(f.product.id);
  await recordInvoicePayments(invoiceId, [{ method: 'cash', amountPaise: due }]);

  assert.ok(invoiceId);

  const [inv] = await hairDb
    .select()
    .from(fyhInvoices)
    .where(eq(fyhInvoices.id, invoiceId))
    .limit(1);
  assert.equal(inv?.source, 'quick_sale');

  const after = await getOnHand(f.product.id);

  const movements = await hairDb
    .select()
    .from(fyhStockMovements)
    .where(eq(fyhStockMovements.referenceId, invoiceId));
  assert.ok(movements.length >= 1);
  const consumption = movements.filter((m) => m.movementType === 'consumption');
  assert.ok(consumption.length >= 1);
  const consumedQty = consumption.reduce((sum, m) => sum + Number(m.quantityDelta), 0);
  assert.ok(consumedQty < 0);
  assert.equal(after, beforePay + consumedQty);
  assert.ok(consumption.every((m) => m.quantityAfter != null));

  const [mem] = await hairDb
    .select()
    .from(fyhCustomerMemberships)
    .where(
      and(
        eq(fyhCustomerMemberships.customerId, customer.id),
        eq(fyhCustomerMemberships.planId, f.membership.id),
        eq(fyhCustomerMemberships.isActive, true),
      ),
    )
    .limit(1);
  assert.ok(mem);
});

test('quick sale hold: save draft and restore cart', async (t) => {
  const probe = await probeHairQuickSaleMigrations();
  if (!probe.ok) t.skip(migrationSkipMessage(probe));

  const f = await requireRcFixtures();
  const customer = await createRcCustomer('hold');

  const holdId = await saveQuickSaleHold({
    customerId: customer.id,
    lines: [
      { kind: 'service', refId: f.cut.id, quantity: 1, servicedBy: [{ staffId: f.staff.id }] },
    ],
    posDraft: { paymentDraft: { cash: '500' }, tipPaise: 1000 },
    tipPaise: 1000,
  });

  const [inv] = await hairDb
    .select()
    .from(fyhInvoices)
    .where(eq(fyhInvoices.id, holdId))
    .limit(1);
  assert.equal(inv?.status, 'draft');
  assert.equal(inv?.source, 'quick_sale');
  assert.match(inv?.invoiceNumber ?? '', /^HOLD-/);

  const loaded = await loadQuickSaleHold(holdId);
  assert.ok(loaded);
  assert.equal(loaded!.cart.length, 1);
  assert.equal(loaded!.cart[0]!.servicedBy[0]?.id, f.staff.id);
  assert.equal(loaded!.posDraft?.paymentDraft?.cash, '500');
});
