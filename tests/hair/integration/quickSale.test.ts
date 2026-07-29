import { loadAppEnv } from '@/src/lib/db/loadEnv';
loadAppEnv();

import assert from 'node:assert/strict';
import test from 'node:test';
import { and, eq, sql } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import {
  fyhCustomerMemberships,
  fyhInvoices,
  fyhProducts,
  fyhStockMovements,
} from '@/src/hair/db/schema';
import {
  createQuickSaleInvoice,
  getInvoiceGrandTotal,
  recordInvoicePayments,
} from '@/src/hair/services/invoices';
import { createRcCustomer, requireRcFixtures } from './rcFixtures.ts';

test('quick sale paid: activates membership, skips product stock', async (t) => {
  try {
    await hairDb.execute(sql`SELECT source FROM fyh_invoices LIMIT 0`);
  } catch {
    t.skip('Hair migration 0012_quick_sale not applied — run npm run hair:db:migrate');
  }
  const f = await requireRcFixtures();
  const customer = await createRcCustomer('qs');
  const [productBefore] = await hairDb
    .select({ stockQty: fyhProducts.stockQty })
    .from(fyhProducts)
    .where(eq(fyhProducts.id, f.product.id))
    .limit(1);

  const invoiceId = await createQuickSaleInvoice(customer.id, [
    { kind: 'service', refId: f.cut.id, quantity: 1, staffId: f.staff.id },
    { kind: 'membership', refId: f.membership.id, quantity: 1 },
  ]);

  const due = await getInvoiceGrandTotal(invoiceId);
  assert.ok(due > 0);
  await recordInvoicePayments(invoiceId, [{ method: 'cash', amountPaise: due }]);

  assert.ok(invoiceId);

  const [inv] = await hairDb
    .select()
    .from(fyhInvoices)
    .where(eq(fyhInvoices.id, invoiceId))
    .limit(1);
  assert.equal(inv?.source, 'quick_sale');

  const [productAfter] = await hairDb
    .select({ stockQty: fyhProducts.stockQty })
    .from(fyhProducts)
    .where(eq(fyhProducts.id, f.product.id))
    .limit(1);
  assert.equal(productAfter?.stockQty, productBefore?.stockQty);

  const movements = await hairDb
    .select()
    .from(fyhStockMovements)
    .where(eq(fyhStockMovements.referenceId, invoiceId));
  assert.equal(movements.length, 0);

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
