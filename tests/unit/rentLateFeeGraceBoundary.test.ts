/**
 * Rent late-fee grace boundary — 5 inclusive grace days from IST generation date.
 *
 * Regression for the production bug where the nightly rent cron ran at
 * 2026-08-31T18:31:55Z (= 1 Sep 2026 00:01 IST) and every date was bucketed by
 * the UTC calendar day (31 Aug), shifting grace end to 4 Sep and charging 2%
 * on 6 Sep instead of 1%.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { billingBusinessDate } from '@/src/lib/dates/ist';
import { formatDate } from '@/src/lib/dates';
import {
  chargeableLateFeeDaysFromIssue,
  graceEndDateFromIssue,
  lateFeePercentFromIssue,
} from '@/src/lib/billing/lateFeeSchedule';
import { buildLateFeeCountdown } from '@/src/lib/billing/lateFeeCountdown';
import { computeLateFee } from '@/src/services/billing';
import { projectInvoice, rentInvoiceIssueDate } from '@/src/services/rentInvoices';
import type { RentInvoice } from '@/src/db/schema';

/** Real production generation instant for the September 2026 rent run. */
const GENERATED_AT = new Date('2026-08-31T18:31:55.781Z');
const ISSUE_IST = '2026-09-01';
/** ₹2,600 monthly rent — matches production invoice RNT-2026-09-0009. */
const RENT_PAISE = 260_000;

// ── IST business date ──────────────────────────────────────────────────────

test('billingBusinessDate returns calendar dates unchanged', () => {
  assert.equal(billingBusinessDate('2026-09-01'), '2026-09-01');
  assert.equal(billingBusinessDate('2026-08-31'), '2026-08-31');
});

test('billingBusinessDate buckets a midnight-IST instant to the IST day', () => {
  // 1 Sep 2026 00:01:55 IST = 31 Aug 2026 18:31:55 UTC
  assert.equal(billingBusinessDate(GENERATED_AT), ISSUE_IST);
});

test('billingBusinessDate does not slice a timestamptz at its UTC prefix', () => {
  assert.equal(billingBusinessDate('2026-08-31T18:31:55.781Z'), ISSUE_IST);
});

// ── Grace boundary matrix ──────────────────────────────────────────────────

test('grace end is the 5th inclusive grace day from the IST issue date', () => {
  assert.equal(formatDate(graceEndDateFromIssue(ISSUE_IST)), '2026-09-05');
});

test('1-5 Sep carry no late fee; 6 Sep is 1%, then 1% per day', () => {
  const expected: Record<string, number> = {
    '2026-09-01': 0,
    '2026-09-02': 0,
    '2026-09-03': 0,
    '2026-09-04': 0,
    '2026-09-05': 0,
    '2026-09-06': 1,
    '2026-09-07': 2,
    '2026-09-08': 3,
  };
  for (const [today, percent] of Object.entries(expected)) {
    assert.equal(chargeableLateFeeDaysFromIssue(ISSUE_IST, today), percent, `days on ${today}`);
    assert.equal(lateFeePercentFromIssue(ISSUE_IST, today), percent, `percent on ${today}`);
  }
});

test('exact paise on a Rs 2,600 rent across the boundary', () => {
  const fee = (today: string) => computeLateFee({ rentPaise: RENT_PAISE, issueDate: ISSUE_IST, today });
  assert.equal(fee('2026-09-05'), 0);
  assert.equal(fee('2026-09-06'), 2_600); // Rs 26
  assert.equal(fee('2026-09-07'), 5_200); // Rs 52
  assert.equal(fee('2026-09-08'), 7_800); // Rs 78
});

test('IST end-of-grace instant is 0% and the next minute is 1%', () => {
  // 5 Sep 23:59 IST = 5 Sep 18:29 UTC — still the last grace day.
  assert.equal(computeLateFee({
    rentPaise: RENT_PAISE,
    issueDate: ISSUE_IST,
    today: new Date('2026-09-05T18:29:00.000Z'),
  }), 0);
  // 6 Sep 00:00 IST = 5 Sep 18:30 UTC — first chargeable day.
  assert.equal(computeLateFee({
    rentPaise: RENT_PAISE,
    issueDate: ISSUE_IST,
    today: new Date('2026-09-05T18:30:00.000Z'),
  }), 2_600);
});

test('a UTC-bucketed issue date would have over-charged by one day', () => {
  // Documents the bug: 31 Aug issue puts grace end at 4 Sep and 6 Sep at 2%.
  assert.equal(chargeableLateFeeDaysFromIssue('2026-08-31', '2026-09-06'), 2);
  assert.equal(chargeableLateFeeDaysFromIssue(GENERATED_AT, '2026-09-06'), 1);
});

// ── Invoice projection ─────────────────────────────────────────────────────

function stubInvoice(
  over: Partial<RentInvoice> & Pick<RentInvoice, 'rentPaise' | 'status' | 'createdAt'>,
): RentInvoice {
  return {
    id: 'inv-1',
    invoiceNumber: 'RNT-2026-09-0009',
    bookingId: 'bk-1',
    customerId: 'c-1',
    bedId: 'bed-1',
    pgId: 'pg-1',
    billingMonth: '2026-09-01',
    dueDate: '2026-09-05',
    discountPaise: 0,
    promoCode: null,
    paidPrincipalPaise: 0,
    paidLateFeePaise: 0,
    lateFeeLockedPaise: null,
    paymentProofUrl: null,
    paymentProofTransactionRef: null,
    possibleDuplicate: false,
    duplicateOfIds: [],
    proofSubmittedAt: null,
    proofSnapshotOutstandingPaise: null,
    proofSnapshotLateFeePaise: null,
    proofSnapshotPrincipalDuePaise: null,
    paymentId: null,
    paidAt: null,
    cancelledAt: null,
    cancellationReason: null,
    notes: 'Billing period: 1 Sept 2026 -> 11 Sept 2026',
    isAdhoc: false,
    invoiceSubtype: 'standard',
    updatedAt: new Date('2026-09-06T17:00:00Z'),
    ...over,
  } as RentInvoice;
}

test('rentInvoiceIssueDate uses the IST generation day', () => {
  const invoice = stubInvoice({ rentPaise: RENT_PAISE, status: 'pending', createdAt: GENERATED_AT });
  assert.equal(rentInvoiceIssueDate(invoice), ISSUE_IST);
});

test('unpaid invoice generated at midnight IST accrues 1% on 6 Sep', () => {
  const invoice = stubInvoice({ rentPaise: RENT_PAISE, status: 'overdue', createdAt: GENERATED_AT });
  const view = projectInvoice(invoice, '2026-09-06');
  assert.equal(view.accruedLateFeePaise, 2_600);
  assert.equal(view.lateFeePercent, 1);
  assert.equal(view.graceEndDate, '2026-09-05');
  assert.equal(view.outstandingPaise, RENT_PAISE + 2_600);
});

test('invoice still inside grace shows zero late fee', () => {
  const invoice = stubInvoice({ rentPaise: RENT_PAISE, status: 'pending', createdAt: GENERATED_AT });
  const view = projectInvoice(invoice, '2026-09-05');
  assert.equal(view.accruedLateFeePaise, 0);
  assert.equal(view.outstandingPaise, RENT_PAISE);
});

test('paid invoice keeps its locked late fee and accrues nothing new', () => {
  const invoice = stubInvoice({
    rentPaise: RENT_PAISE,
    status: 'paid',
    createdAt: GENERATED_AT,
    paidPrincipalPaise: RENT_PAISE,
    paidLateFeePaise: 2_600,
    lateFeeLockedPaise: 2_600,
    paidAt: new Date('2026-09-06T17:17:08.851Z'),
  });
  const view = projectInvoice(invoice, '2026-09-20');
  assert.equal(view.accruedLateFeePaise, 2_600);
  assert.equal(view.outstandingPaise, 0);
  assert.equal(view.effectiveStatus, 'paid');
});

test('cancelled invoice never carries a late fee', () => {
  const invoice = stubInvoice({
    rentPaise: RENT_PAISE,
    status: 'cancelled',
    createdAt: GENERATED_AT,
    cancelledAt: new Date('2026-09-03T06:00:00Z'),
  });
  const view = projectInvoice(invoice, '2026-09-20');
  assert.equal(view.accruedLateFeePaise, 0);
  assert.equal(view.outstandingPaise, 0);
});

test('future invoice inside its own grace window is 0%', () => {
  const invoice = stubInvoice({
    rentPaise: RENT_PAISE,
    status: 'pending',
    createdAt: new Date('2026-09-30T18:31:00.000Z'), // 1 Oct IST
  });
  assert.equal(rentInvoiceIssueDate(invoice), '2026-10-01');
  assert.equal(projectInvoice(invoice, '2026-10-05').accruedLateFeePaise, 0);
  assert.equal(projectInvoice(invoice, '2026-10-06').accruedLateFeePaise, 2_600);
});

test('a frozen payment-proof snapshot is not re-accrued during admin review', () => {
  const invoice = stubInvoice({
    rentPaise: RENT_PAISE,
    status: 'payment_in_progress',
    createdAt: GENERATED_AT,
    proofSubmittedAt: new Date('2026-09-06T17:07:50.431Z'),
    paymentProofTransactionRef: '66',
    proofSnapshotOutstandingPaise: RENT_PAISE + 2_600,
    proofSnapshotLateFeePaise: 2_600,
    proofSnapshotPrincipalDuePaise: RENT_PAISE,
  });
  const view = projectInvoice(invoice, '2026-09-09');
  assert.equal(view.accruedLateFeePaise, 2_600);
  assert.equal(view.outstandingPaise, RENT_PAISE + 2_600);
});

// ── One source of truth across surfaces ────────────────────────────────────

test('resident countdown, invoice projection and engine agree on the same day', () => {
  const invoice = stubInvoice({ rentPaise: RENT_PAISE, status: 'overdue', createdAt: GENERATED_AT });
  for (const today of ['2026-09-05', '2026-09-06', '2026-09-07', '2026-09-08']) {
    const projected = projectInvoice(invoice, today);
    const engine = computeLateFee({ rentPaise: RENT_PAISE, issueDate: GENERATED_AT, today });
    const countdown = buildLateFeeCountdown(GENERATED_AT, today);
    const countdownPercent = countdown.phase === 'late' ? countdown.percentToday : 0;

    assert.equal(projected.accruedLateFeePaise, engine, `projection vs engine on ${today}`);
    assert.equal(projected.lateFeePercent ?? 0, countdownPercent, `projection vs countdown on ${today}`);
  }
});

test('countdown reports 1 day overdue at 1% on 6 Sep', () => {
  const state = buildLateFeeCountdown(GENERATED_AT, '2026-09-06');
  assert.equal(state.phase, 'late');
  if (state.phase !== 'late') return;
  assert.equal(state.percentToday, 1);
  assert.equal(state.percentTomorrow, 2);
  assert.match(state.message, /^1 day overdue/);
});

test('late fee is computed in exactly one place', () => {
  // Every surface (Bills Due, Pay All, invoice detail, admin review) must reach
  // the fee through projectInvoice rather than recomputing it locally.
  const engine = readFileSync(join(process.cwd(), 'src/services/rentInvoices.ts'), 'utf8');
  assert.ok(engine.includes('computeLateFee('), 'rentInvoices must own the fee call');

  const billRows = readFileSync(
    join(process.cwd(), 'src/lib/residents/residentPortalBillRows.ts'),
    'utf8',
  );
  assert.match(billRows, /projectInvoice\(/);
  assert.match(billRows, /rentInvoiceIssueDate\(/);
  assert.doesNotMatch(billRows, /computeLateFee\(/);
});
