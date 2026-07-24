import assert from 'node:assert/strict';
import test from 'node:test';
import { computeVacatingFinalPeriodRentDecision } from '@/src/lib/billing/vacatingFinalPeriodRent';
import { dailyRateFromMonthly } from '@/src/services/billing';
import { assertCheckoutSettlementWaterfallConsistent } from '@/src/lib/checkout/settlementInvariants';
import {
  computeCheckoutSettlementV2,
  type CheckoutSettlementWaterfall,
} from '@/src/lib/checkout/checkoutSettlementEngineV2';
import {
  computeVacatingSettlementWaterfallFromContext,
  type VacatingSettlementWaterfallContext,
} from '@/src/lib/vacating/computeVacatingSettlementPreview';
import {
  applyEstimatedSettlementToApprovalPreview,
  buildVacatingApprovalPreview,
} from '@/src/lib/vacating/approvalPreview';

test('pending preview path: tail rent in waterfall reduces refundable deposit (Aug 8 vacate)', () => {
  const monthlyRentPaise = 387_000;
  const dailyRentPaise = dailyRateFromMonthly(monthlyRentPaise);
  const depositHeldPaise = 412_100;
  const rentPaidPaise = 412_100;

  const decision = computeVacatingFinalPeriodRentDecision({
    vacatingApproved: true,
    vacatingDate: '2026-08-08',
    billingDay: 7,
    moveInDate: '2026-07-07',
    monthlyRentPaise,
    paidPeriods: [
      { periodStart: '2026-07-07', periodEnd: '2026-08-06', source: 'rent_invoice' },
    ],
  });

  assert.equal(decision.tailRentPaise, dailyRentPaise);

  const ctx: VacatingSettlementWaterfallContext = {
    checkInDate: '2026-07-07',
    vacatingDate: '2026-08-08',
    rentPaidPaise,
    depositHeldPaise,
    monthlyRentPaise,
    missingNoticeDays: 0,
    noticeApplies: true,
    checkoutTailRentPaise: decision.tailRentPaise,
  };

  const waterfall = computeVacatingSettlementWaterfallFromContext(ctx);
  assertCheckoutSettlementWaterfallConsistent(waterfall);

  assert.equal(waterfall.stay.stayDays, 33);
  assert.equal(waterfall.rentBucket.consumedPaise, rentPaidPaise);
  assert.equal(waterfall.depositBucket.tailRentPaise, decision.tailRentPaise);
  assert.equal(
    waterfall.depositBucket.refundablePaise,
    depositHeldPaise - decision.tailRentPaise,
  );
  assert.notEqual(waterfall.depositBucket.refundablePaise, depositHeldPaise);
});

test('vacate on period end (7 Aug): tail zero; rent consumed can cap at rent paid', () => {
  const monthlyRentPaise = 387_000;
  const depositHeldPaise = 412_100;
  const rentPaidPaise = 412_100;

  const ctx: VacatingSettlementWaterfallContext = {
    checkInDate: '2026-07-07',
    vacatingDate: '2026-08-07',
    rentPaidPaise,
    depositHeldPaise,
    monthlyRentPaise,
    missingNoticeDays: 0,
    noticeApplies: true,
    checkoutTailRentPaise: 0,
  };

  const waterfall = computeVacatingSettlementWaterfallFromContext(ctx);
  assertCheckoutSettlementWaterfallConsistent(waterfall);
  assert.equal(waterfall.stay.stayDays, 32);
  assert.equal(waterfall.rentBucket.consumedPaise, rentPaidPaise);
  assert.equal(waterfall.depositBucket.refundablePaise, depositHeldPaise);
});

test('assertCheckoutSettlementWaterfallConsistent accepts valid V2 output', () => {
  const w: CheckoutSettlementWaterfall = computeCheckoutSettlementV2({
    stayCheckInDate: '2026-07-07',
    stayCheckoutDate: '2026-08-07',
    rentPaidPaise: 412_100,
    monthlyRentPaise: 387_000,
    depositCollectedPaise: 412_100,
    missingNoticeDays: 0,
    noticeApplies: true,
    checkoutTailRentPaise: dailyRateFromMonthly(387_000),
  });
  assert.doesNotThrow(() => assertCheckoutSettlementWaterfallConsistent(w));
});

test('tail rent zero when no suppression — invariants still hold', () => {
  const w = computeCheckoutSettlementV2({
    stayCheckInDate: '2026-07-07',
    stayCheckoutDate: '2026-08-06',
    rentPaidPaise: 412_100,
    monthlyRentPaise: 387_000,
    depositCollectedPaise: 412_100,
    missingNoticeDays: 0,
    noticeApplies: true,
    checkoutTailRentPaise: 0,
  });
  assertCheckoutSettlementWaterfallConsistent(w);
  assert.equal(w.depositBucket.refundablePaise, 412_100);
});

test('approval preview legacy refund fields sync from estimated settlement waterfall', () => {
  const monthlyRentPaise = 387_000;
  const tail = dailyRateFromMonthly(monthlyRentPaise);
  const depositHeldPaise = 412_100;
  const waterfall = computeCheckoutSettlementV2({
    stayCheckInDate: '2026-07-07',
    stayCheckoutDate: '2026-08-07',
    rentPaidPaise: depositHeldPaise,
    monthlyRentPaise,
    depositCollectedPaise: depositHeldPaise,
    missingNoticeDays: 0,
    noticeApplies: true,
    checkoutTailRentPaise: tail,
  });

  const sync = buildVacatingApprovalPreview(
    {
      id: 'vr-1',
      bookingId: 'bk-1',
      bookingCode: 'PG26-001',
      customerId: 'c-1',
      customerFullName: 'Resident',
      customerPhone: '+919876543210',
      pgName: 'Test PG',
      bedCode: 'B1',
      roomNumber: '101',
      noticeGivenDate: '2026-07-01',
      vacatingDate: '2026-08-07',
      noticeCompliant: true,
      deductionPaise: 0,
      depositRefundPaise: 0,
      monthlyRentPaiseSnapshot: monthlyRentPaise,
      noticeRentCoveredDays: 0,
      noticeChargeableDays: 0,
      durationMode: 'monthly',
      stayType: 'monthly',
      status: 'pending',
      resolvedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    depositHeldPaise,
  );

  assert.equal(sync.estimatedRefundPaise, depositHeldPaise);

  const estimatedSettlement = {
    sections: [],
    auditTrace: [],
    waterfall,
    estimatedRefundPaise: waterfall.refund.totalPaise,
    estimatedUnusedRentCreditPaise: 0,
    estimatedRefundableDepositPaise: waterfall.depositBucket.refundablePaise,
    depositHeldPaise,
    disclaimer: '',
    mode: 'estimate' as const,
  };

  const merged = applyEstimatedSettlementToApprovalPreview(sync, estimatedSettlement);
  assert.equal(merged.estimatedRefundPaise, waterfall.refund.totalPaise);
  assert.equal(merged.estimatedDeductionPaise, tail);
  assert.equal(merged.estimatedSettlement, estimatedSettlement);
});
