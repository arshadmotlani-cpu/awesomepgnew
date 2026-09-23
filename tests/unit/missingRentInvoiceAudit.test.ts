import assert from 'node:assert/strict';
import test from 'node:test';
import {
  decideMissingRentInvoiceForFixedStay,
  decideMissingRentInvoiceForRecurringStay,
} from '@/src/lib/billing/missingRentInvoiceAudit';

const MONTH = '2026-09-01';

test('fixed stay fully paid — no missing invoice', () => {
  const d = decideMissingRentInvoiceForFixedStay({
    billingMonth: MONTH,
    rent: { requiredPaise: 500_000, receivedPaise: 500_000, outstandingPaise: 0 },
    invoices: [
      {
        status: 'paid',
        isAdhoc: true,
        billingMonth: '2026-09-01',
      },
    ],
  });
  assert.equal(d.missing, false);
  if (!d.missing) assert.equal(d.reason, 'fixed_stay_rent_obligation_settled');
});

test('fixed stay partial payment with open adhoc invoice — not missing', () => {
  const d = decideMissingRentInvoiceForFixedStay({
    billingMonth: MONTH,
    rent: { requiredPaise: 500_000, receivedPaise: 200_000, outstandingPaise: 300_000 },
    invoices: [{ status: 'partial', isAdhoc: true, billingMonth: MONTH }],
  });
  assert.equal(d.missing, false);
  if (!d.missing) assert.match(d.reason, /invoice_on_file/);
});

test('fixed stay unpaid with no invoice — missing', () => {
  const d = decideMissingRentInvoiceForFixedStay({
    billingMonth: MONTH,
    rent: { requiredPaise: 500_000, receivedPaise: 0, outstandingPaise: 500_000 },
    invoices: [],
  });
  assert.equal(d.missing, true);
});

test('payment for another period does not settle fixed stay if outstanding remains', () => {
  const d = decideMissingRentInvoiceForFixedStay({
    billingMonth: MONTH,
    rent: { requiredPaise: 1_000_000, receivedPaise: 200_000, outstandingPaise: 800_000 },
    invoices: [],
  });
  assert.equal(d.missing, true);
});

test('recurring stay — generation skipped (paid through) — not missing', () => {
  const d = decideMissingRentInvoiceForRecurringStay({
    billingMonth: MONTH,
    generationEligible: false,
    skipCode: 'already_covered',
    hasStandardMonthlyInvoice: false,
  });
  assert.equal(d.missing, false);
  if (!d.missing) assert.equal(d.metadata?.skipCode, 'already_covered');
});

test('recurring stay — eligible but no invoice — missing', () => {
  const d = decideMissingRentInvoiceForRecurringStay({
    billingMonth: MONTH,
    generationEligible: true,
    hasStandardMonthlyInvoice: false,
  });
  assert.equal(d.missing, true);
});

test('recurring stay — standard invoice exists — not missing', () => {
  const d = decideMissingRentInvoiceForRecurringStay({
    billingMonth: MONTH,
    generationEligible: true,
    hasStandardMonthlyInvoice: true,
  });
  assert.equal(d.missing, false);
});

test('vacating skip — not missing when generation ineligible', () => {
  const d = decideMissingRentInvoiceForRecurringStay({
    billingMonth: MONTH,
    generationEligible: false,
    skipCode: 'vacating_skip_already_paid',
    hasStandardMonthlyInvoice: false,
  });
  assert.equal(d.missing, false);
});
