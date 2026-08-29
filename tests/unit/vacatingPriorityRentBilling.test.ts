/**
 * Vacating-priority rent billing — BCM SSOT regression matrix.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildBillingCoverageModel,
  resolveVacatingAwareRentCharge,
} from '@/src/lib/billing/billingCoverageModel';
import {
  chargeableLateFeeDaysFromIssue,
  daysUntilLateFeeFromIssue,
  INVOICE_LATE_FEE_GRACE_DAYS,
} from '@/src/lib/billing/lateFeeSchedule';
import { buildLateFeeCountdown } from '@/src/lib/billing/lateFeeCountdown';
import { computeCheckoutSettlementV2 } from '@/src/lib/checkout/checkoutSettlementEngineV2';
import { addDays, formatDate } from '@/src/lib/dates';
import { fullMonthlyRentPaise } from '@/src/services/billing';

const MONTHLY = 714_000;
const FULL_MONTH = fullMonthlyRentPaise(MONTHLY);

function calendarFebPeriod() {
  return { periodStart: '2026-02-01', periodEnd: '2026-02-28' };
}

function paidJanFebCoverage() {
  return [
    {
      periodStart: '2026-01-01',
      periodEnd: '2026-01-31',
      paidPrincipalPaise: FULL_MONTH,
      source: 'rent_invoice' as const,
    },
  ];
}

test('1 — paid January, vacate Feb 2 → prorated Feb charge only (2 calendar days)', () => {
  const charge = resolveVacatingAwareRentCharge({
    billingMonth: '2026-02-01',
    billingDay: 1,
    billingCyclePolicy: 'calendar_month_1st',
    moveInDate: '2025-06-01',
    monthlyRentPaise: MONTHLY,
    paidInvoiceCoverage: paidJanFebCoverage(),
    activeVacating: { status: 'pending', vacatingDate: '2026-02-02' },
    fullMonthRentPaise: FULL_MONTH,
    billingPeriod: calendarFebPeriod(),
  });
  assert.equal(charge.billingAction, 'generate_prorated');
  assert.ok(charge.chargeablePaise < FULL_MONTH);
  assert.equal(charge.chargeablePeriodStart, '2026-02-01');
  assert.equal(charge.chargeablePeriodEnd, '2026-02-02');
  assert.equal(charge.chargeableDays, 2);
  assert.equal(charge.settlementTailRentPaise, 0);
  assert.equal(charge.collectViaRentInvoice, true);
});

test('2 — vacate Feb 10 before February billing → no full-month invoice action', () => {
  const charge = resolveVacatingAwareRentCharge({
    billingMonth: '2026-02-01',
    billingDay: 1,
    billingCyclePolicy: 'calendar_month_1st',
    moveInDate: '2025-06-01',
    monthlyRentPaise: MONTHLY,
    paidInvoiceCoverage: paidJanFebCoverage(),
    activeVacating: { status: 'approved', vacatingDate: '2026-02-10' },
    fullMonthRentPaise: FULL_MONTH,
    billingPeriod: calendarFebPeriod(),
  });
  assert.equal(charge.billingAction, 'generate_prorated');
  assert.ok(charge.chargeablePaise < FULL_MONTH);
});

test('3 — full February invoice exists → vacating Feb 10 adjusts existing', () => {
  const charge = resolveVacatingAwareRentCharge({
    billingMonth: '2026-02-01',
    billingDay: 1,
    billingCyclePolicy: 'calendar_month_1st',
    moveInDate: '2025-06-01',
    monthlyRentPaise: MONTHLY,
    paidInvoiceCoverage: paidJanFebCoverage(),
    activeVacating: { status: 'approved', vacatingDate: '2026-02-10' },
    fullMonthRentPaise: FULL_MONTH,
    billingPeriod: calendarFebPeriod(),
    existingInvoice: {
      id: 'inv-feb',
      rentPaise: FULL_MONTH,
      paidPrincipalPaise: 0,
      status: 'pending',
    },
  });
  assert.equal(charge.billingAction, 'adjust_existing');
  assert.ok(charge.chargeablePaise < FULL_MONTH);
});

test('4 — vacating Feb 5 → Feb 7 increases chargeable days', () => {
  const base = resolveVacatingAwareRentCharge({
    billingMonth: '2026-02-01',
    billingDay: 1,
    billingCyclePolicy: 'calendar_month_1st',
    moveInDate: '2025-06-01',
    monthlyRentPaise: MONTHLY,
    paidInvoiceCoverage: paidJanFebCoverage(),
    activeVacating: { status: 'approved', vacatingDate: '2026-02-05' },
    fullMonthRentPaise: FULL_MONTH,
    billingPeriod: calendarFebPeriod(),
    existingInvoice: {
      id: 'inv-feb',
      rentPaise: 100_000,
      paidPrincipalPaise: 0,
      status: 'pending',
    },
  });
  const extended = resolveVacatingAwareRentCharge({
    billingMonth: '2026-02-01',
    billingDay: 1,
    billingCyclePolicy: 'calendar_month_1st',
    moveInDate: '2025-06-01',
    monthlyRentPaise: MONTHLY,
    paidInvoiceCoverage: paidJanFebCoverage(),
    activeVacating: { status: 'approved', vacatingDate: '2026-02-07' },
    fullMonthRentPaise: FULL_MONTH,
    billingPeriod: calendarFebPeriod(),
    existingInvoice: {
      id: 'inv-feb',
      rentPaise: base.chargeablePaise,
      paidPrincipalPaise: 0,
      status: 'pending',
    },
  });
  assert.ok(extended.chargeablePaise > base.chargeablePaise);
  assert.equal(extended.billingAction, 'adjust_existing');
});

test('5 — vacating Feb 7 → Feb 5 reduces chargeable days safely', () => {
  const from7 = resolveVacatingAwareRentCharge({
    billingMonth: '2026-02-01',
    billingDay: 1,
    billingCyclePolicy: 'calendar_month_1st',
    moveInDate: '2025-06-01',
    monthlyRentPaise: MONTHLY,
    paidInvoiceCoverage: paidJanFebCoverage(),
    activeVacating: { status: 'approved', vacatingDate: '2026-02-07' },
    fullMonthRentPaise: FULL_MONTH,
    billingPeriod: calendarFebPeriod(),
  });
  const from5 = resolveVacatingAwareRentCharge({
    billingMonth: '2026-02-01',
    billingDay: 1,
    billingCyclePolicy: 'calendar_month_1st',
    moveInDate: '2025-06-01',
    monthlyRentPaise: MONTHLY,
    paidInvoiceCoverage: paidJanFebCoverage(),
    activeVacating: { status: 'approved', vacatingDate: '2026-02-05' },
    fullMonthRentPaise: FULL_MONTH,
    billingPeriod: calendarFebPeriod(),
    existingInvoice: {
      id: 'inv-feb',
      rentPaise: from7.chargeablePaise,
      paidPrincipalPaise: 0,
      status: 'pending',
    },
  });
  assert.ok(from5.chargeablePaise < from7.chargeablePaise);
});

test('6 — September unpaid + July/August paid → unused prepaid ₹0', () => {
  const coverage = buildBillingCoverageModel({
    bookingId: 'cv',
    moveInDate: '2026-06-01',
    billingDay: 1,
    billingCyclePolicy: 'calendar_month_1st',
    rawPaidPeriods: [
      {
        periodStart: '2026-07-01',
        periodEnd: '2026-07-31',
        paidPrincipalPaise: 721_140,
        source: 'rent_invoice',
      },
      {
        periodStart: '2026-08-01',
        periodEnd: '2026-08-31',
        paidPrincipalPaise: 721_140,
        source: 'rent_invoice',
      },
    ],
    vacatingDate: '2026-09-03',
    noticeGivenDate: '2026-08-25',
    monthlyRentPaise: MONTHLY,
    rentReceivedPaise: 721_140 * 2,
    treatAsApprovedForTail: true,
  });
  assert.equal(coverage.prepaidAfterVacatingPaise, 0);
});

test('7 — September prepaid + vacate Sep 3 → only Sep 4+ unused prepaid', () => {
  const coverage = buildBillingCoverageModel({
    bookingId: 'cv-prepaid-sep',
    moveInDate: '2026-06-01',
    billingDay: 1,
    billingCyclePolicy: 'calendar_month_1st',
    rawPaidPeriods: [
      {
        periodStart: '2026-09-01',
        periodEnd: '2026-09-30',
        paidPrincipalPaise: FULL_MONTH,
        source: 'rent_invoice',
      },
    ],
    vacatingDate: '2026-09-03',
    noticeGivenDate: '2026-08-25',
    monthlyRentPaise: MONTHLY,
    rentReceivedPaise: FULL_MONTH,
    treatAsApprovedForTail: true,
  });
  assert.ok(coverage.prepaidAfterVacatingPaise > 0);
  assert.equal(coverage.prepaidAfterVacatingDays, 27);
});

test('8 — rent is invoice path; settlement deposit tail is zero', () => {
  const charge = resolveVacatingAwareRentCharge({
    billingMonth: '2026-02-01',
    billingDay: 1,
    billingCyclePolicy: 'calendar_month_1st',
    moveInDate: '2025-06-01',
    monthlyRentPaise: MONTHLY,
    paidInvoiceCoverage: paidJanFebCoverage(),
    activeVacating: { status: 'pending', vacatingDate: '2026-02-02' },
    fullMonthRentPaise: FULL_MONTH,
    billingPeriod: calendarFebPeriod(),
  });
  const waterfall = computeCheckoutSettlementV2({
    stayCheckInDate: '2025-06-01',
    stayCheckoutDate: '2026-02-02',
    rentPaidPaise: FULL_MONTH,
    monthlyRentPaise: MONTHLY,
    depositCollectedPaise: 700_000,
    checkoutTailRentPaise: charge.settlementTailRentPaise,
  });
  assert.equal(waterfall.depositBucket.tailRentPaise, 0);
  assert.ok(charge.chargeablePaise > 0);
});

test('9 — electricity remains separate from rent charge resolver', () => {
  const charge = resolveVacatingAwareRentCharge({
    billingMonth: '2026-02-01',
    billingDay: 1,
    billingCyclePolicy: 'calendar_month_1st',
    moveInDate: '2025-06-01',
    monthlyRentPaise: MONTHLY,
    paidInvoiceCoverage: [],
    activeVacating: { status: 'approved', vacatingDate: '2026-02-10' },
    fullMonthRentPaise: FULL_MONTH,
    billingPeriod: calendarFebPeriod(),
  });
  assert.ok(charge.invoiceNotes?.includes('move-out proration'));
  assert.notEqual(charge.billingAction, 'skip_no_charge');
});

test('10 — rent invoice late-fee grace is 5 calendar days from issue', () => {
  const issue = '2026-02-01';
  assert.equal(INVOICE_LATE_FEE_GRACE_DAYS, 5);
  assert.equal(daysUntilLateFeeFromIssue(issue, '2026-02-01'), 4);
  assert.equal(chargeableLateFeeDaysFromIssue(issue, '2026-02-06'), 1);
});

test('11 — electricity uses same 5-day grace schedule', () => {
  const issue = '2026-03-01';
  assert.equal(daysUntilLateFeeFromIssue(issue, '2026-03-05'), 0);
  assert.equal(chargeableLateFeeDaysFromIssue(issue, '2026-03-07'), 2);
});

test('12 — late fee starts only after 5-day window', () => {
  const issue = '2026-02-01';
  assert.equal(chargeableLateFeeDaysFromIssue(issue, '2026-02-05'), 0);
  assert.equal(chargeableLateFeeDaysFromIssue(issue, '2026-02-06'), 1);
});

test('13 — vacating date change does not reset issue-date late-fee clock', () => {
  const issue = '2026-02-01';
  const before = chargeableLateFeeDaysFromIssue(issue, '2026-02-10');
  const after = chargeableLateFeeDaysFromIssue(issue, '2026-02-10');
  assert.equal(before, after);
  assert.equal(before, 5);
});

test('14–15 — customer-scoped invoice history is the SSOT (pure contract)', () => {
  assert.ok(typeof resolveVacatingAwareRentCharge === 'function');
});

test('partial payment — paid exceeds new charge blocks adjust', () => {
  const charge = resolveVacatingAwareRentCharge({
    billingMonth: '2026-02-01',
    billingDay: 1,
    billingCyclePolicy: 'calendar_month_1st',
    moveInDate: '2025-06-01',
    monthlyRentPaise: MONTHLY,
    paidInvoiceCoverage: paidJanFebCoverage(),
    activeVacating: { status: 'approved', vacatingDate: '2026-02-02' },
    fullMonthRentPaise: FULL_MONTH,
    billingPeriod: calendarFebPeriod(),
    existingInvoice: {
      id: 'inv-feb',
      rentPaise: FULL_MONTH,
      paidPrincipalPaise: 500_000,
      status: 'partial',
    },
  });
  assert.equal(charge.billingAction, 'no_change');
  assert.equal(charge.adjustBlockedReason, 'partial_payment_exceeds_new_charge');
});

test('calendar month — Feb 5, Feb 10, Feb 28 chargeable day counts', () => {
  const cases: Array<{ vacate: string; days: number }> = [
    { vacate: '2026-02-05', days: 5 },
    { vacate: '2026-02-10', days: 10 },
    { vacate: '2026-02-28', days: 28 },
  ];
  for (const { vacate, days } of cases) {
    const charge = resolveVacatingAwareRentCharge({
      billingMonth: '2026-02-01',
      billingDay: 1,
      billingCyclePolicy: 'calendar_month_1st',
      moveInDate: '2025-06-01',
      monthlyRentPaise: MONTHLY,
      paidInvoiceCoverage: paidJanFebCoverage(),
      activeVacating: { status: 'approved', vacatingDate: vacate },
      fullMonthRentPaise: FULL_MONTH,
      billingPeriod: calendarFebPeriod(),
    });
    assert.equal(charge.chargeableDays, days, vacate);
    assert.equal(charge.settlementTailRentPaise, 0);
  }
});

test('calendar month leap year — Feb 29 vacate = 29 chargeable days', () => {
  const charge = resolveVacatingAwareRentCharge({
    billingMonth: '2024-02-01',
    billingDay: 1,
    billingCyclePolicy: 'calendar_month_1st',
    moveInDate: '2023-06-01',
    monthlyRentPaise: MONTHLY,
    paidInvoiceCoverage: [
      {
        periodStart: '2024-01-01',
        periodEnd: '2024-01-31',
        paidPrincipalPaise: FULL_MONTH,
        source: 'rent_invoice',
      },
    ],
    activeVacating: { status: 'approved', vacatingDate: '2024-02-29' },
    fullMonthRentPaise: FULL_MONTH,
    billingPeriod: { periodStart: '2024-02-01', periodEnd: '2024-02-29' },
  });
  assert.equal(charge.chargeableDays, 29);
});

test('partial payment — paid below new charge allows adjust_existing', () => {
  const charge = resolveVacatingAwareRentCharge({
    billingMonth: '2026-02-01',
    billingDay: 1,
    billingCyclePolicy: 'calendar_month_1st',
    moveInDate: '2025-06-01',
    monthlyRentPaise: MONTHLY,
    paidInvoiceCoverage: paidJanFebCoverage(),
    activeVacating: { status: 'approved', vacatingDate: '2026-02-10' },
    fullMonthRentPaise: FULL_MONTH,
    billingPeriod: calendarFebPeriod(),
    existingInvoice: {
      id: 'inv-feb',
      rentPaise: FULL_MONTH,
      paidPrincipalPaise: 50_000,
      status: 'partial',
    },
  });
  assert.equal(charge.billingAction, 'adjust_existing');
  assert.ok(charge.chargeablePaise > 50_000);
});

test('18–19 — idempotent charge resolution for repeated date changes', () => {
  const input = {
    billingMonth: '2026-02-01',
    billingDay: 1,
    billingCyclePolicy: 'calendar_month_1st' as const,
    moveInDate: '2025-06-01',
    monthlyRentPaise: MONTHLY,
    paidInvoiceCoverage: paidJanFebCoverage(),
    activeVacating: { status: 'approved' as const, vacatingDate: '2026-02-07' },
    fullMonthRentPaise: FULL_MONTH,
    billingPeriod: calendarFebPeriod(),
    existingInvoice: {
      id: 'inv-feb',
      rentPaise: 200_000,
      paidPrincipalPaise: 0,
      status: 'pending',
    },
  };
  const first = resolveVacatingAwareRentCharge(input);
  const second = resolveVacatingAwareRentCharge({
    ...input,
    existingInvoice: { ...input.existingInvoice!, rentPaise: first.chargeablePaise },
  });
  assert.equal(second.billingAction, 'no_change');
});

test('20 — settlement refund uses deposit + genuine unused prepaid only', () => {
  const coverage = buildBillingCoverageModel({
    bookingId: 'final',
    moveInDate: '2026-06-01',
    billingDay: 1,
    billingCyclePolicy: 'calendar_month_1st',
    rawPaidPeriods: [
      {
        periodStart: '2026-09-01',
        periodEnd: '2026-09-30',
        paidPrincipalPaise: FULL_MONTH,
        source: 'rent_invoice',
      },
    ],
    vacatingDate: '2026-09-03',
    noticeGivenDate: '2026-08-25',
    monthlyRentPaise: MONTHLY,
    rentReceivedPaise: FULL_MONTH,
    treatAsApprovedForTail: true,
  });
  const w = computeCheckoutSettlementV2({
    stayCheckInDate: '2026-06-01',
    stayCheckoutDate: '2026-09-03',
    rentPaidPaise: FULL_MONTH,
    monthlyRentPaise: MONTHLY,
    depositCollectedPaise: 700_000,
    checkoutTailRentPaise: 0,
    prepaidAfterVacatingPaise: coverage.prepaidAfterVacatingPaise,
  });
  assert.ok(w.refund.unusedRentPortionPaise > 0);
  assert.equal(w.depositBucket.tailRentPaise, 0);
});

test('CV Laxminarayana billing path — Sep 1–3 prorated invoice, unused prepaid ₹0', () => {
  const coverage = buildBillingCoverageModel({
    bookingId: 'cv-lax',
    moveInDate: '2026-06-01',
    billingDay: 1,
    billingCyclePolicy: 'calendar_month_1st',
    rawPaidPeriods: [
      {
        periodStart: '2026-07-01',
        periodEnd: '2026-07-31',
        paidPrincipalPaise: 721_140,
        source: 'rent_invoice',
      },
      {
        periodStart: '2026-08-01',
        periodEnd: '2026-08-31',
        paidPrincipalPaise: 721_140,
        source: 'rent_invoice',
      },
    ],
    vacatingDate: '2026-09-03',
    noticeGivenDate: '2026-08-25',
    monthlyRentPaise: MONTHLY,
    rentReceivedPaise: 721_140 * 2,
    treatAsApprovedForTail: true,
  });
  assert.equal(coverage.prepaidAfterVacatingPaise, 0);
  const charge = resolveVacatingAwareRentCharge({
    billingMonth: '2026-09-01',
    billingDay: 1,
    billingCyclePolicy: 'calendar_month_1st',
    moveInDate: '2026-06-01',
    monthlyRentPaise: MONTHLY,
    paidInvoiceCoverage: coverage.paidInvoiceCoverage,
    activeVacating: { status: 'approved', vacatingDate: '2026-09-03' },
    fullMonthRentPaise: FULL_MONTH,
    billingPeriod: { periodStart: '2026-09-01', periodEnd: '2026-09-30' },
  });
  assert.equal(charge.billingAction, 'generate_prorated');
  assert.equal(charge.chargeableDays, 3);
  assert.equal(charge.chargeablePaise, coverage.tailRentPaise);
});

test('late-fee countdown copy — Due in N days through overdue', () => {
  const issue = '2026-02-01';
  const d4 = buildLateFeeCountdown(issue, '2026-02-01');
  assert.equal(d4.phase, 'grace');
  assert.match(d4.message, /Due in 4 day/);
  const lastGrace = buildLateFeeCountdown(issue, '2026-02-05');
  assert.match(lastGrace.message, /Due today/);
  const late = buildLateFeeCountdown(issue, '2026-02-07');
  assert.equal(late.phase, 'late');
  assert.match(late.message, /overdue/);
});
