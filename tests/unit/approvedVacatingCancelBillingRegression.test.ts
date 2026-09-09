import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { billingTransitionOverlapsPaidThrough } from '@/src/services/billingCycleMigration';
import { buildLateFeeCountdown } from '@/src/lib/billing/lateFeeCountdown';
import { billingBusinessDate } from '@/src/lib/dates/ist';
import { prorateForMonth } from '@/src/services/billing';
import { addDays, formatDate, parseDate } from '@/src/lib/dates';
import { projectInvoice } from '@/src/services/rentInvoices';

const vacatingService = readFileSync(join(process.cwd(), 'src/services/vacating.ts'), 'utf8');
const vacatingCheckoutBilling = readFileSync(
  join(process.cwd(), 'src/services/vacatingCheckoutBilling.ts'),
  'utf8',
);
const rentInvoicesSource = readFileSync(
  join(process.cwd(), 'src/services/rentInvoices.ts'),
  'utf8',
);

function restoreBillingBody() {
  const start = vacatingCheckoutBilling.indexOf(
    'export async function restoreRentBillingAfterVacatingCancel',
  );
  const end = vacatingCheckoutBilling.indexOf(
    'export async function resolveVacatingFinalPeriodInvoiceSuppression',
  );
  return vacatingCheckoutBilling.slice(start, end);
}

test('recalculatePendingRentInvoicesForBooking excludes transition and adhoc invoices', () => {
  const fn = rentInvoicesSource.slice(
    rentInvoicesSource.indexOf('export async function recalculatePendingRentInvoicesForBooking'),
    rentInvoicesSource.indexOf('export async function reconcileRentInvoicesAfterRoomTransfer'),
  );
  assert.match(fn, /eq\(rentInvoices\.isAdhoc, false\)/);
  assert.match(fn, /ne\(rentInvoices\.invoiceSubtype, 'billing_cycle_transition'\)/);
  assert.match(fn, /move-out proration/);
});

test('restoreRentBillingAfterVacatingCancel realigns billing transition invoices', () => {
  const body = restoreBillingBody();
  assert.match(body, /realignBillingTransitionInvoicesAfterVacatingCancel/);
  assert.match(body, /transitionRealigned: transition\.realignedCount/);
});

test('realignBillingTransitionInvoicesAfterVacatingCancel uses paid-through overlap guard', () => {
  const start = vacatingCheckoutBilling.indexOf(
    'export async function realignBillingTransitionInvoicesAfterVacatingCancel',
  );
  const end = vacatingCheckoutBilling.indexOf(
    'export async function restoreRentBillingAfterVacatingCancel',
  );
  const body = vacatingCheckoutBilling.slice(start, end);
  assert.match(body, /billingTransitionOverlapsPaidThrough/);
  assert.match(body, /paidLateFeePaise: 0/);
  assert.match(body, /createdAt: now/);
  assert.match(body, /prorateForMonth/);
});

test('billing transition overlap detects Sep 9 start when paid through Sep 9', () => {
  assert.equal(billingTransitionOverlapsPaidThrough('2026-09-09', '2026-09-09'), true);
  assert.equal(billingTransitionOverlapsPaidThrough('2026-09-10', '2026-09-09'), false);
});

test('Sep 10–30 bridge rent uses existing prorateForMonth SSOT', () => {
  const monthly = 412_080;
  const pr = prorateForMonth({
    monthlyRatePaise: monthly,
    billingMonth: '2026-09-01',
    activeStart: '2026-09-10',
    activeEnd: formatDate(addDays(parseDate('2026-09-30'), 1)),
  });
  assert.equal(pr.daysActive, 21);
  assert.equal(pr.amountPaise, 288_456);
});

test('fresh transition issue date gets grace countdown not overdue', () => {
  const issueDate = billingBusinessDate(new Date('2026-09-09T12:00:00Z'));
  const countdown = buildLateFeeCountdown(issueDate, '2026-09-09');
  assert.equal(countdown.phase, 'grace');
  if (countdown.phase === 'grace') {
    assert.match(countdown.message, /Due in/);
  }
});

test('billing_cycle_transition projection keeps accruedLateFeePaise at zero', () => {
  const projected = projectInvoice({
    id: 'inv-transition',
    invoiceNumber: 'RNT-TEST',
    bookingId: 'bk-1',
    customerId: 'c-1',
    bedId: 'bed-1',
    pgId: 'pg-1',
    billingMonth: '2026-09-01',
    dueDate: null,
    rentPaise: 288_456,
    discountPaise: 0,
    paidPrincipalPaise: 0,
    paidLateFeePaise: 0,
    lateFeeLockedPaise: null,
    status: 'pending',
    paidAt: null,
    invoiceSubtype: 'billing_cycle_transition',
    notes:
      'Billing cycle transition rent — Prorated bridge rent for 21/30 days (2026-09-10 → 2026-09-30) before regular 1st-of-month billing. Billing period: 10 Sept 2026 → 30 Sept 2026',
    paymentProofUrl: null,
    proofSubmittedAt: null,
    proofSnapshotOutstandingPaise: null,
    proofSnapshotLateFeePaise: null,
    proofSnapshotPrincipalDuePaise: null,
    paymentId: null,
    isAdhoc: true,
    createdAt: new Date('2026-09-09T07:00:00Z'),
    updatedAt: new Date('2026-09-09T07:00:00Z'),
    cancelledAt: null,
    cancellationReason: null,
    lateFeeBasePaise: 412_080,
  });
  assert.equal(projected.accruedLateFeePaise, 0);
  assert.equal(projected.outstandingPaise, 288_456);
});

test('approved customer cancel rejects vacating before billing restore', () => {
  const start = vacatingService.indexOf('export async function cancelApprovedVacatingByCustomer');
  const end = vacatingService.indexOf('export async function finalizeVacatingOccupancy');
  const body = vacatingService.slice(start, end);
  const rejectAt = body.indexOf("status: 'rejected'");
  const restoreAt = body.indexOf('await restoreCheckoutRentAfterVacatingCancel(');
  assert.ok(rejectAt >= 0 && restoreAt >= 0);
  assert.ok(rejectAt < restoreAt);
});

test('pending customer cancel still deletes pending rows without transition realign dependency', () => {
  const start = vacatingService.indexOf('export async function cancelVacatingRequestByCustomer');
  const end = vacatingService.indexOf('/** Resident withdraws an approved move-out');
  const body = vacatingService.slice(start, end);
  assert.match(body, /db\.delete\(vacatingRequests\)/);
  assert.match(body, /await restoreCheckoutRentAfterVacatingCancel\(/);
});
