import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  buildBillingCoverageModel,
  resolveVacatingAwareRentCharge,
} from '@/src/lib/billing/billingCoverageModel';
import { computeCheckoutSettlementV2 } from '@/src/lib/checkout/checkoutSettlementEngineV2';
import type { FinalPeriodRentInvoiceOutstanding } from '@/src/lib/checkout/checkoutSettlementV2Compute';
import {
  computeCalendarMonthPrepaidMoveOutSettlement,
} from '@/src/lib/vacating/calendarMonthPrepaidMoveOutSettlement';
import { buildResidentMoveOutRentSection } from '@/src/lib/vacating/residentMoveOutRentPresentation';
import { bedAvailableCalendarDate, formatBedAvailableLabel } from '@/src/lib/vacating/vacatingBedSemantics';
import { VACATING_NOTICE_MIN_DAYS, fullMonthlyRentPaise } from '@/src/services/billing';

const MONTHLY_RENT = 721_100;
const FULL_MONTH = fullMonthlyRentPaise(MONTHLY_RENT);
const NOTICE_GIVEN = '2026-09-04';
const VACATE = '2026-09-10';
const DEPOSIT = 700_000;

function sepPeriod() {
  return { periodStart: '2026-09-01', periodEnd: '2026-09-30' };
}

function paidAugCoverage() {
  return [
    {
      periodStart: '2026-08-01',
      periodEnd: '2026-08-31',
      paidPrincipalPaise: FULL_MONTH,
      source: 'rent_invoice' as const,
    },
  ];
}

function buildWaterfall(args: {
  vacatingDate: string;
  rentPaidPaise: number;
  prepaidAfterVacatingPaise?: number;
  outstandingRentInvoicePaise?: number;
}) {
  const coverage = buildBillingCoverageModel({
    bookingId: 'bk-move-out-ux',
    moveInDate: '2026-06-01',
    billingDay: 1,
    billingCyclePolicy: 'calendar_month_1st',
    rawPaidPeriods: paidAugCoverage(),
    vacatingDate: args.vacatingDate,
    noticeGivenDate: NOTICE_GIVEN,
    monthlyRentPaise: MONTHLY_RENT,
    treatAsApprovedForTail: true,
    noticeApplies: true,
  });
  const prepaidAfterVacatingPaise =
    args.prepaidAfterVacatingPaise ?? coverage.prepaidAfterVacatingPaise;
  const daily = Math.floor(MONTHLY_RENT / 30);
  return {
    coverage,
    waterfall: computeCheckoutSettlementV2({
      stayCheckInDate: '2026-06-01',
      stayCheckoutDate: args.vacatingDate,
      rentPaidPaise: args.rentPaidPaise,
      monthlyRentPaise: MONTHLY_RENT,
      depositCollectedPaise: DEPOSIT,
      missingNoticeDays: 0,
      noticeApplies: true,
      prepaidAfterVacatingPaise,
      checkoutTailRentPaise: 0,
      periodDailyRentPaise: daily,
      outstandingRentInvoicePaise: args.outstandingRentInvoicePaise,
    }),
  };
}

test('screenshot scenario — 5-day notice compliant (4 Sep → 10 Sep)', () => {
  assert.equal(VACATING_NOTICE_MIN_DAYS, 5);
  const calendar = computeCalendarMonthPrepaidMoveOutSettlement({
    monthlyRentPaise: MONTHLY_RENT,
    vacatingDate: VACATE,
    noticeGivenDate: NOTICE_GIVEN,
    securityDepositPaise: DEPOSIT,
  });
  assert.equal(calendar.noticeGivenDays, 6);
  assert.equal(calendar.noticeShortfallDays, 0);
});

test('bed available next day at midnight — 10 Sep → 11 Sep · 12:00 AM', () => {
  assert.equal(bedAvailableCalendarDate(VACATE), '2026-09-11');
  assert.match(formatBedAvailableLabel(VACATE), /11 Sept · 12:00 AM/);
});

test('CASE A — unpaid September rent + early move-out prorates liability', () => {
  const charge = resolveVacatingAwareRentCharge({
    billingMonth: '2026-09-01',
    billingDay: 1,
    billingCyclePolicy: 'calendar_month_1st',
    moveInDate: '2026-06-01',
    monthlyRentPaise: MONTHLY_RENT,
    paidInvoiceCoverage: paidAugCoverage(),
    activeVacating: { status: 'pending', vacatingDate: VACATE },
    fullMonthRentPaise: FULL_MONTH,
    billingPeriod: sepPeriod(),
    existingInvoice: {
      id: 'inv-sep',
      rentPaise: FULL_MONTH,
      paidPrincipalPaise: 0,
      status: 'pending',
    },
  });
  assert.equal(charge.billingAction, 'adjust_existing');
  assert.ok(charge.chargeablePaise < FULL_MONTH);
  assert.equal(charge.chargeablePeriodEnd, VACATE);

  // Screenshot regression: invoice still full-month unpaid on the ledger —
  // presentation must still show rent-through = chargeable, not ₹0 / full month.
  const { coverage, waterfall } = buildWaterfall({
    vacatingDate: VACATE,
    rentPaidPaise: 0,
    outstandingRentInvoicePaise: FULL_MONTH,
    prepaidAfterVacatingPaise: 0,
  });
  assert.equal(coverage.tailRentPaise, charge.chargeablePaise);
  const finalPeriodInvoice: FinalPeriodRentInvoiceOutstanding = {
    invoiceId: 'inv-sep',
    rentPaise: FULL_MONTH,
    paidPrincipalPaise: 0,
    outstandingPaise: FULL_MONTH,
  };
  const rent = buildResidentMoveOutRentSection({
    vacatingDate: VACATE,
    monthlyRentPaise: MONTHLY_RENT,
    coverage,
    waterfall,
    finalPeriodInvoice,
  });

  assert.equal(rent.scenario, 'unpaid');
  assert.match(rent.headline, /currently unpaid/i);
  assert.match(rent.headline, /adjusted to your valid move-out date/i);
  assert.equal(rent.paidPaise, 0);
  assert.equal(rent.monthlyRentPaise, MONTHLY_RENT);
  assert.equal(rent.rentThroughVacatingPaise, charge.chargeablePaise);
  assert.equal(rent.finalRentSettlementPaise, charge.chargeablePaise);
  assert.equal(rent.remainingRentLiabilityPaise, charge.chargeablePaise);
  assert.equal(rent.unusedPrepaidRentPaise, 0);
  assert.match(rent.billingCycleNote, /1st of every month/i);
});

test('CASE B — paid September rent + early move-out → unused prepaid wallet credit', () => {
  const calendar = computeCalendarMonthPrepaidMoveOutSettlement({
    monthlyRentPaise: MONTHLY_RENT,
    vacatingDate: VACATE,
    noticeGivenDate: NOTICE_GIVEN,
    securityDepositPaise: DEPOSIT,
  });
  const { coverage, waterfall } = buildWaterfall({
    vacatingDate: VACATE,
    rentPaidPaise: FULL_MONTH,
    prepaidAfterVacatingPaise: calendar.unusedPrepaidRentPaise,
    outstandingRentInvoicePaise: 0,
  });
  const finalPeriodInvoice: FinalPeriodRentInvoiceOutstanding = {
    invoiceId: 'inv-sep',
    rentPaise: FULL_MONTH,
    paidPrincipalPaise: FULL_MONTH,
    outstandingPaise: 0,
  };
  const rent = buildResidentMoveOutRentSection({
    vacatingDate: VACATE,
    monthlyRentPaise: MONTHLY_RENT,
    coverage,
    waterfall,
    finalPeriodInvoice,
  });

  assert.equal(rent.scenario, 'paid');
  assert.match(rent.headline, /already paid/i);
  assert.match(rent.headline, /credited to your wallet/i);
  assert.equal(rent.paidPaise, FULL_MONTH);
  assert.equal(rent.unusedPrepaidRentPaise, calendar.unusedPrepaidRentPaise);
  assert.ok(rent.rentThroughVacatingPaise > 0);
  assert.ok(rent.unusedPrepaidRentPaise > 0);
});

test('partial rent payment scenario — paid below rent-through liability', () => {
  const { coverage, waterfall } = buildWaterfall({
    vacatingDate: VACATE,
    rentPaidPaise: 100_000,
    outstandingRentInvoicePaise: FULL_MONTH - 100_000,
    prepaidAfterVacatingPaise: 0,
  });
  const through = coverage.tailRentPaise;
  assert.ok(through > 100_000);
  const rent = buildResidentMoveOutRentSection({
    vacatingDate: VACATE,
    monthlyRentPaise: MONTHLY_RENT,
    coverage,
    waterfall,
    finalPeriodInvoice: {
      invoiceId: 'inv-sep',
      rentPaise: FULL_MONTH,
      paidPrincipalPaise: 100_000,
      outstandingPaise: FULL_MONTH - 100_000,
    },
  });
  assert.equal(rent.scenario, 'partial');
  assert.equal(rent.rentThroughVacatingPaise, through);
  assert.equal(rent.remainingRentLiabilityPaise, through - 100_000);
  assert.equal(rent.finalRentSettlementPaise, through - 100_000);
  assert.equal(rent.unusedPrepaidRentPaise, 0);
});

test('partial rent payment above rent-through → excess is prepaid credit', () => {
  const partialPaid = Math.floor(FULL_MONTH / 2);
  const { coverage, waterfall } = buildWaterfall({
    vacatingDate: VACATE,
    rentPaidPaise: partialPaid,
    outstandingRentInvoicePaise: FULL_MONTH - partialPaid,
    prepaidAfterVacatingPaise: 0,
  });
  const through = coverage.tailRentPaise;
  assert.ok(partialPaid > through);
  const rent = buildResidentMoveOutRentSection({
    vacatingDate: VACATE,
    monthlyRentPaise: MONTHLY_RENT,
    coverage,
    waterfall,
    finalPeriodInvoice: {
      invoiceId: 'inv-sep',
      rentPaise: FULL_MONTH,
      paidPrincipalPaise: partialPaid,
      outstandingPaise: FULL_MONTH - partialPaid,
    },
  });
  assert.equal(rent.rentThroughVacatingPaise, through);
  assert.equal(rent.remainingRentLiabilityPaise, 0);
  assert.equal(rent.finalRentSettlementPaise, 0);
  assert.equal(rent.unusedPrepaidRentPaise, partialPaid - through);
});

test('unpaid → no wallet credit for nonexistent prepaid', () => {
  const { coverage, waterfall } = buildWaterfall({
    vacatingDate: VACATE,
    rentPaidPaise: 0,
    outstandingRentInvoicePaise: FULL_MONTH,
    prepaidAfterVacatingPaise: 0,
  });
  const rent = buildResidentMoveOutRentSection({
    vacatingDate: VACATE,
    monthlyRentPaise: MONTHLY_RENT,
    coverage,
    waterfall,
    finalPeriodInvoice: {
      invoiceId: 'inv-sep',
      rentPaise: FULL_MONTH,
      paidPrincipalPaise: 0,
      outstandingPaise: FULL_MONTH,
    },
  });
  assert.equal(rent.unusedPrepaidRentPaise, 0);
  assert.ok(rent.rentThroughVacatingPaise > 0);
});

test('canonical outstanding helper caps full-month unpaid to tail', async () => {
  const { canonicalOutstandingRentLiabilityPaise } = await import(
    '@/src/lib/vacating/canonicalRentThroughMoveOut'
  );
  assert.equal(
    canonicalOutstandingRentLiabilityPaise({
      invoiceOutstandingPaise: FULL_MONTH,
      paidPrincipalPaise: 0,
      tailRentPaise: 240_380,
    }),
    240_380,
  );
  assert.equal(
    canonicalOutstandingRentLiabilityPaise({
      invoiceOutstandingPaise: 100_000,
      paidPrincipalPaise: 50_000,
      tailRentPaise: 240_380,
    }),
    100_000,
  );
});

test('extend day 10 → 15 and earlier day 10 → 7 recalculate through amount', () => {
  const base = {
    billingMonth: '2026-09-01',
    billingDay: 1,
    billingCyclePolicy: 'calendar_month_1st' as const,
    moveInDate: '2026-06-01',
    monthlyRentPaise: MONTHLY_RENT,
    paidInvoiceCoverage: paidAugCoverage(),
    fullMonthRentPaise: FULL_MONTH,
    billingPeriod: sepPeriod(),
    existingInvoice: {
      id: 'inv-sep',
      rentPaise: FULL_MONTH,
      paidPrincipalPaise: 0,
      status: 'pending',
    },
  };
  const d10 = resolveVacatingAwareRentCharge({
    ...base,
    activeVacating: { status: 'pending', vacatingDate: '2026-09-10' },
  });
  const d15 = resolveVacatingAwareRentCharge({
    ...base,
    activeVacating: { status: 'pending', vacatingDate: '2026-09-15' },
  });
  const d7 = resolveVacatingAwareRentCharge({
    ...base,
    activeVacating: { status: 'pending', vacatingDate: '2026-09-07' },
  });
  assert.equal(d10.billingAction, 'adjust_existing');
  assert.equal(d15.billingAction, 'adjust_existing');
  assert.equal(d7.billingAction, 'adjust_existing');
  assert.ok(d15.chargeablePaise > d10.chargeablePaise);
  assert.ok(d7.chargeablePaise < d10.chargeablePaise);
  assert.equal(d10.chargeableDays, 10);
  assert.equal(d15.chargeableDays, 15);
  assert.equal(d7.chargeableDays, 7);
});

test('paid invoice never rewritten — skip_already_paid when vacate inside paid period', () => {
  const charge = resolveVacatingAwareRentCharge({
    billingMonth: '2026-09-01',
    billingDay: 1,
    billingCyclePolicy: 'calendar_month_1st',
    moveInDate: '2026-06-01',
    monthlyRentPaise: MONTHLY_RENT,
    paidInvoiceCoverage: [
      ...paidAugCoverage(),
      {
        periodStart: '2026-09-01',
        periodEnd: '2026-09-30',
        paidPrincipalPaise: FULL_MONTH,
        source: 'rent_invoice' as const,
      },
    ],
    activeVacating: { status: 'approved', vacatingDate: VACATE },
    fullMonthRentPaise: FULL_MONTH,
    billingPeriod: sepPeriod(),
    existingInvoice: {
      id: 'inv-sep',
      rentPaise: FULL_MONTH,
      paidPrincipalPaise: FULL_MONTH,
      status: 'paid',
    },
  });
  assert.equal(charge.billingAction, 'skip_already_paid');
  assert.equal(charge.chargeablePaise, 0);
});

test('UI does not contain confusing prepaid copy', () => {
  const form = readFileSync('src/components/customer/VacatingRequestForm.tsx', 'utf8');
  const panel = readFileSync(
    'src/components/customer/account/resident/vacating/ResidentMoveOutRequestPreviewPanel.tsx',
    'utf8',
  );
  assert.doesNotMatch(form, /No prepaid rent after vacate date/i);
  assert.doesNotMatch(panel, /No prepaid rent after vacate date/i);
  assert.match(panel, /Unused prepaid rent will be credited to your wallet/i);
});

test('date picker uses themed control not native date input in resident variant', () => {
  const form = readFileSync('src/components/customer/VacatingRequestForm.tsx', 'utf8');
  const picker = readFileSync(
    'src/components/customer/account/resident/vacating/MoveOutDatePicker.tsx',
    'utf8',
  );
  assert.match(form, /MoveOutDatePicker/);
  assert.match(picker, /data-testid="move-out-date-picker-trigger"/);
  assert.match(picker, /bg-apg-orange/);
  assert.match(picker, /createPortal/);
  assert.doesNotMatch(picker, /type="date"/);
});

test('preview loads from server action — no UI-local rent math', () => {
  const form = readFileSync('src/components/customer/VacatingRequestForm.tsx', 'utf8');
  const preview = readFileSync('src/lib/vacating/residentMoveOutRequestPreview.ts', 'utf8');
  assert.match(form, /previewMoveOutSettlementAction/);
  assert.doesNotMatch(form, /estimateVacateDepositPreview/);
  assert.doesNotMatch(form, /useNoticeDeductionPreview/);
  assert.match(preview, /loadVacatingBillingPresentation/);
  assert.match(preview, /buildResidentMoveOutRentSection/);
  assert.match(preview, /buildResidentMoveOutElectricityPreview/);
});

test('submit revalidates resident financial views', () => {
  const actions = readFileSync('app/(customer)/account/resident/actions.ts', 'utf8');
  const revalidate = readFileSync('src/lib/vacating/revalidateVacatingViews.ts', 'utf8');
  assert.match(actions, /revalidateResidentMoveOutCustomerViews/);
  assert.match(revalidate, /revalidatePath\('\/account\/profile'/);
  assert.match(revalidate, /revalidatePath\('\/account\/resident'/);
  assert.match(revalidate, /revalidatePath\('\/account\/bookings'/);
});

test('mobile and desktop layout classes present in preview panel', () => {
  const panel = readFileSync(
    'src/components/customer/account/resident/vacating/ResidentMoveOutRequestPreviewPanel.tsx',
    'utf8',
  );
  assert.match(panel, /sm:grid-cols-/);
  assert.match(panel, /data-testid="move-out-settlement-preview"/);
});
