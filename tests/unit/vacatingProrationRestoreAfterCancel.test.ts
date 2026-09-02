/**
 * Orphaned vacating-proration rent invoices must restore on notice withdrawal.
 * Provenance: notes containing VACATING_MOVE_OUT_PRORATION_NOTE_MARKER only.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  VACATING_MOVE_OUT_PRORATION_NOTE_MARKER,
  vacatingProrationInvoiceNeedsRestore,
} from '@/src/services/vacatingCheckoutBilling';

const PRORATED_NOTE = `Billing period: 1 Sept 2026 → 1 Sept 2026 ${VACATING_MOVE_OUT_PRORATION_NOTE_MARKER}`;
const FULL_NOTE = 'Billing period: 1 Sept 2026 → 30 Sept 2026';
const MONTHLY_RENT_PAISE = 412_080;
const ONE_DAY_PRORATION_PAISE = 13_736;

// A — active vacating: prorated invoice must not be restored
test('A — active vacating keeps legitimate prorated invoice unchanged', () => {
  const restore = vacatingProrationInvoiceNeedsRestore({
    invoiceNotes: PRORATED_NOTE,
    invoiceRentPaise: ONE_DAY_PRORATION_PAISE,
    paidPrincipalPaise: 0,
    eligibleRentPaise: MONTHLY_RENT_PAISE,
    eligibleNotes: FULL_NOTE,
    hasActiveVacating: true,
  });
  assert.equal(restore, null);
});

// B — vacating cancelled: pending proration restores to full month
test('B — vacating cancelled restores pending proration to full-month rent', () => {
  const restore = vacatingProrationInvoiceNeedsRestore({
    invoiceNotes: PRORATED_NOTE,
    invoiceRentPaise: ONE_DAY_PRORATION_PAISE,
    paidPrincipalPaise: 0,
    eligibleRentPaise: MONTHLY_RENT_PAISE,
    eligibleNotes: FULL_NOTE,
    hasActiveVacating: false,
  });
  assert.ok(restore);
  assert.equal(restore.toPaise, MONTHLY_RENT_PAISE);
  assert.equal(restore.toNotes, FULL_NOTE);
  assert.ok(!restore.toNotes.includes(VACATING_MOVE_OUT_PRORATION_NOTE_MARKER));
});

// C — production tail-math scenario (1-day September proration)
test('C — 1-day calendar-month proration restores to full monthly rent', () => {
  const dailyRate = Math.floor(MONTHLY_RENT_PAISE / 30);
  assert.equal(dailyRate, ONE_DAY_PRORATION_PAISE);
  const restore = vacatingProrationInvoiceNeedsRestore({
    invoiceNotes: PRORATED_NOTE,
    invoiceRentPaise: dailyRate,
    paidPrincipalPaise: 0,
    eligibleRentPaise: MONTHLY_RENT_PAISE,
    eligibleNotes: FULL_NOTE,
    hasActiveVacating: false,
  });
  assert.ok(restore);
  assert.equal(restore.toPaise, MONTHLY_RENT_PAISE);
});

// D — paid proration invoice is never rewritten
test('D — fully paid proration invoice is never rewritten', () => {
  const restore = vacatingProrationInvoiceNeedsRestore({
    invoiceNotes: PRORATED_NOTE,
    invoiceRentPaise: ONE_DAY_PRORATION_PAISE,
    paidPrincipalPaise: ONE_DAY_PRORATION_PAISE,
    eligibleRentPaise: MONTHLY_RENT_PAISE,
    eligibleNotes: FULL_NOTE,
    hasActiveVacating: false,
    invoiceFullyPaid: true,
  });
  assert.equal(restore, null);
});

test('D — paid principal covering prorated amount blocks restore even without flag', () => {
  const restore = vacatingProrationInvoiceNeedsRestore({
    invoiceNotes: PRORATED_NOTE,
    invoiceRentPaise: ONE_DAY_PRORATION_PAISE,
    paidPrincipalPaise: ONE_DAY_PRORATION_PAISE,
    eligibleRentPaise: MONTHLY_RENT_PAISE,
    eligibleNotes: FULL_NOTE,
    hasActiveVacating: false,
  });
  assert.equal(restore, null);
});

// E — idempotent second heal
test('E — already-restored invoice is unchanged on second heal', () => {
  const restore = vacatingProrationInvoiceNeedsRestore({
    invoiceNotes: FULL_NOTE,
    invoiceRentPaise: MONTHLY_RENT_PAISE,
    paidPrincipalPaise: 0,
    eligibleRentPaise: MONTHLY_RENT_PAISE,
    eligibleNotes: FULL_NOTE,
    hasActiveVacating: false,
  });
  assert.equal(restore, null);
});

// F — normal full-month invoice without proration marker is untouched
test('F — normal full-month invoice without proration marker is untouched', () => {
  const restore = vacatingProrationInvoiceNeedsRestore({
    invoiceNotes: FULL_NOTE,
    invoiceRentPaise: MONTHLY_RENT_PAISE,
    paidPrincipalPaise: 0,
    eligibleRentPaise: MONTHLY_RENT_PAISE,
    eligibleNotes: FULL_NOTE,
    hasActiveVacating: false,
  });
  assert.equal(restore, null);
});

// G — only proration-marker invoices qualify (not arbitrary low rent)
test('G — low rent without proration provenance is not restored', () => {
  const restore = vacatingProrationInvoiceNeedsRestore({
    invoiceNotes: 'Billing period: 1 Sept 2026 → 1 Sept 2026',
    invoiceRentPaise: ONE_DAY_PRORATION_PAISE,
    paidPrincipalPaise: 0,
    eligibleRentPaise: MONTHLY_RENT_PAISE,
    eligibleNotes: FULL_NOTE,
    hasActiveVacating: false,
  });
  assert.equal(restore, null);
});

test('marker constant matches resolveVacatingAwareRentCharge proration suffix', () => {
  assert.equal(VACATING_MOVE_OUT_PRORATION_NOTE_MARKER, '(move-out proration)');
});
