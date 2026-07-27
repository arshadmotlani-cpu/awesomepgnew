import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BILLING_EVENT_TYPES,
  billingEventTypeLabel,
  isBillingEventType,
} from '../../src/services/billingEvents';
import { invoiceLifecycleLabel } from '../../src/lib/collections/invoiceLifecycleLabel';

test('BILLING_EVENT_TYPES covers Phase 2 lifecycle signals', () => {
  assert.ok(BILLING_EVENT_TYPES.includes('invoice.generated'));
  assert.ok(BILLING_EVENT_TYPES.includes('invoice.overdue'));
  assert.ok(BILLING_EVENT_TYPES.includes('invoice.paid'));
  assert.ok(BILLING_EVENT_TYPES.includes('invoice.partial'));
  assert.ok(BILLING_EVENT_TYPES.includes('invoice.proof_submitted'));
  assert.ok(BILLING_EVENT_TYPES.includes('invoice.upcoming'));
});

test('isBillingEventType accepts known types only', () => {
  assert.equal(isBillingEventType('invoice.paid'), true);
  assert.equal(isBillingEventType('invoice.generated'), true);
  assert.equal(isBillingEventType('not.a.type'), false);
});

test('billingEventTypeLabel is stable for UI timeline', () => {
  assert.equal(billingEventTypeLabel('invoice.generated'), 'Generated');
  assert.equal(billingEventTypeLabel('invoice.overdue'), 'Marked overdue');
  assert.equal(billingEventTypeLabel('invoice.paid'), 'Paid');
  assert.equal(billingEventTypeLabel('invoice.partial'), 'Partial payment');
  assert.equal(billingEventTypeLabel('invoice.proof_submitted'), 'Proof submitted');
  assert.equal(billingEventTypeLabel('custom.x'), 'custom.x');
});

test('lifecycle labels still map history-shaped rows (stored + effective)', () => {
  // Mirrors collectionsInvoiceHistory row shape after projectInvoice.
  const historyRows = [
    { status: 'pending', effectiveStatus: 'pending', isUpcoming: false as const },
    { status: 'pending', effectiveStatus: 'overdue', isUpcoming: false as const },
    { status: 'payment_in_progress', effectiveStatus: 'payment_in_progress', isUpcoming: false as const },
    { status: 'paid', effectiveStatus: 'paid', isUpcoming: false as const },
    { status: 'pending', effectiveStatus: 'partial', isUpcoming: false as const },
  ];

  assert.equal(
    invoiceLifecycleLabel(historyRows[0]!),
    'Awaiting Payment',
  );
  assert.equal(invoiceLifecycleLabel(historyRows[1]!), 'Overdue');
  assert.equal(invoiceLifecycleLabel(historyRows[2]!), 'Under Verification');
  assert.equal(invoiceLifecycleLabel(historyRows[3]!), 'Paid');
  assert.equal(invoiceLifecycleLabel(historyRows[4]!), 'Partially Paid');
});
