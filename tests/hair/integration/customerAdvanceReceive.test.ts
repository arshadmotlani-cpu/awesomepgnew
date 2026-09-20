import { loadAppEnv } from '@/src/lib/db/loadEnv';
loadAppEnv();

import assert from 'node:assert/strict';
import test from 'node:test';
import { and, eq } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import { isFyhSaasTenantEnabled } from '@/src/hair/lib/tenant/flags';
import {
  fyhCommissionEntries,
  fyhCustomers,
  fyhFinancialLedger,
  fyhInvoiceLines,
  fyhInvoicePayments,
  fyhInvoices,
} from '@/src/hair/db/schema';
import { receiveCustomerAdvancePayment } from '@/src/hair/services/customerAdvance';
import { createRcCustomer } from './rcFixtures.ts';
import { migrationSkipMessage, probeHairQuickSaleMigrations } from './migrationGuard.ts';

test('receiveCustomerAdvancePayment creates invoice, ledger credit, wallet balance', async (t) => {
  if (isFyhSaasTenantEnabled()) {
    t.skip('Runs against single-salon tenant mode (production FYH_SAAS_TENANT off)');
    return;
  }
  const probe = await probeHairQuickSaleMigrations();
  if (!probe.ok) t.skip(migrationSkipMessage(probe));

  const customer = await createRcCustomer('adv');

  const idempotencyKey = `test-${Date.now()}`;
  const amountPaise = 5_000_00;

  const first = await receiveCustomerAdvancePayment({
    customerId: customer.id,
    amountPaise,
    method: 'upi',
    idempotencyKey,
    notes: 'integration test',
  });

  assert.equal(first.reused, false);
  assert.ok(first.invoiceId);
  assert.match(first.invoiceNumber, /^FYH-/);

  const [inv] = await hairDb
    .select()
    .from(fyhInvoices)
    .where(eq(fyhInvoices.id, first.invoiceId))
    .limit(1);
  assert.equal(inv?.source, 'advance_payment');
  assert.equal(inv?.status, 'paid');
  assert.equal(inv?.grandTotalPaise, amountPaise);

  const payments = await hairDb
    .select()
    .from(fyhInvoicePayments)
    .where(eq(fyhInvoicePayments.invoiceId, first.invoiceId));
  assert.equal(payments.length, 1);
  assert.equal(payments[0]?.method, 'upi');
  assert.equal(payments[0]?.amountPaise, amountPaise);

  const ledger = await hairDb
    .select()
    .from(fyhFinancialLedger)
    .where(
      and(
        eq(fyhFinancialLedger.customerId, customer.id),
        eq(fyhFinancialLedger.invoiceId, first.invoiceId),
      ),
    );
  const credit = ledger.find((r) => r.kind === 'advance_credit' && r.direction === 'credit');
  const tender = ledger.find((r) => r.kind === 'payment_received' && r.direction === 'debit');
  assert.ok(credit);
  assert.ok(tender);
  assert.equal(credit?.amountPaise, amountPaise);

  const [cust] = await hairDb
    .select({ walletBalancePaise: fyhCustomers.walletBalancePaise })
    .from(fyhCustomers)
    .where(eq(fyhCustomers.id, customer.id))
    .limit(1);
  assert.ok((cust?.walletBalancePaise ?? 0) >= amountPaise);

  const lines = await hairDb
    .select({ id: fyhInvoiceLines.id })
    .from(fyhInvoiceLines)
    .where(eq(fyhInvoiceLines.invoiceId, first.invoiceId));
  assert.equal(lines.length, 1);

  const commissions = await hairDb
    .select()
    .from(fyhCommissionEntries)
    .where(eq(fyhCommissionEntries.invoiceLineId, lines[0]!.id));
  assert.equal(commissions.length, 0);

  const second = await receiveCustomerAdvancePayment({
    customerId: customer.id,
    amountPaise,
    method: 'upi',
    idempotencyKey,
  });
  assert.equal(second.reused, true);
  assert.equal(second.invoiceId, first.invoiceId);

  const allAdvances = await hairDb
    .select({ id: fyhInvoices.id })
    .from(fyhInvoices)
    .where(
      and(eq(fyhInvoices.customerId, customer.id), eq(fyhInvoices.source, 'advance_payment')),
    );
  assert.equal(allAdvances.length, 1);
});
