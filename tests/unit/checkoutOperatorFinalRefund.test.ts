import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCheckoutElectricityOperatorAudit } from '@/src/lib/checkout/checkoutElectricityOperatorAudit';
import {
  buildOperatorFinalRefundBreakdown,
  resolveEffectiveCheckoutElectricityDeductionPaise,
} from '@/src/lib/checkout/checkoutOperatorFinalRefund';
import { computeCheckoutSettlementV2 } from '@/src/lib/checkout/checkoutSettlementEngineV2';
import type { RoomOccupantSlice } from '@/src/lib/checkout/roomElectricityAllocation';
import type { CheckoutSettlementDetail } from '@/src/services/checkoutSettlement';

const occupants: RoomOccupantSlice[] = [
  {
    bookingId: 'b-d',
    customerId: 'dhruv',
    customerName: 'Dhruv',
    stayStart: '2026-07-01',
    stayEndExclusive: '2026-09-26',
  },
  {
    bookingId: 'b-a',
    customerId: 'ameen',
    customerName: 'Ameen',
    stayStart: '2026-08-01',
    stayEndExclusive: '2026-09-20',
  },
  {
    bookingId: 'b-s',
    customerId: 'saswat',
    customerName: 'Saswat',
    stayStart: '2026-08-08',
    stayEndExclusive: '2026-09-26',
  },
  {
    bookingId: 'b-g',
    customerId: 'sagar',
    customerName: 'Sagar',
    stayStart: '2026-09-20',
    stayEndExclusive: null,
  },
];

function dhruvLikeDetail(electricitySharePaise: number): CheckoutSettlementDetail {
  const audit = buildCheckoutElectricityOperatorAudit({
    billingMonth: '2026-09-01',
    vacatingDate: '2026-09-25',
    ratePerUnitPaise: 1600,
    chainOpeningUnits: 424,
    checkoutClosingUnits: 479,
    finalizedBill: {
      billingMonth: '2026-09-01',
      openingUnits: 337,
      closingUnits: 424,
      grossPaise: 139_200,
      ratePerUnitPaise: 1600,
      periodStartDate: '2026-09-01',
      periodEndDate: '2026-09-25',
      finalizedOnDate: '2026-09-26',
    },
    invoiceCredits: [
      {
        customerId: 'dhruv',
        customerName: 'Dhruv',
        amountPaise: 62_600,
        paidPaise: 62_600,
        status: 'paid',
      },
    ],
    occupants,
    tailOccupants: occupants,
    currentCustomerId: 'dhruv',
    electricityCalculationMethod: 'meter_reading',
    electricitySharePaise,
    electricityDeductFromDeposit: true,
  });

  const waterfall = computeCheckoutSettlementV2({
    stayCheckInDate: '2026-07-01',
    stayCheckoutDate: '2026-09-25',
    rentPaidPaise: 500_000,
    monthlyRentPaise: 412_000,
    depositCollectedPaise: 412_080,
    missingNoticeDays: 0,
    electricityPaise: electricitySharePaise,
    electricityDeductFromDeposit: true,
    prepaidAfterVacatingPaise: 68_680,
    periodDailyRentPaise: 13_712,
  });

  return {
    id: 'settlement-dhruv',
    status: 'awaiting_admin_review',
    customerName: 'Dhruv',
    bookingCode: 'APG-2026-0040',
    vacatingDate: '2026-09-25',
    depositRefundablePaise: 412_080,
    monthlyRentPaiseSnapshot: 412_000,
    settlementEngineVersion: 2,
    electricityCalculationMethod: 'meter_reading',
    electricitySharePaise,
    electricityDeductFromDeposit: true,
    preview: {
      finalRefundPaise: waterfall.refund.totalPaise,
      noticeDeductionPaise: 0,
      electricityDeductionPaise: electricitySharePaise,
      electricityDeductFromDeposit: true,
      electricitySharePaise,
      totalDeductionsPaise: electricitySharePaise,
      damageChargePaise: 0,
      cleaningChargePaise: 0,
      customChargePaise: 0,
      unusedRentRefundPaise: 68_680,
    },
    waterfall,
    electricityOperatorAudit: audit,
  } as CheckoutSettlementDetail;
}

test('uses ledger suggested electricity when persisted share is zero', () => {
  const detail = dhruvLikeDetail(0);
  const effective = resolveEffectiveCheckoutElectricityDeductionPaise(detail);
  assert.ok(effective > 0);
  assert.equal(
    effective,
    detail.electricityOperatorAudit!.meterPeriodLedger.suggestedDepositDeductionPaise,
  );
});

test('final refund includes unused prepaid rent minus electricity deduction', () => {
  const detail = dhruvLikeDetail(0);
  const breakdown = buildOperatorFinalRefundBreakdown(detail);
  assert.equal(breakdown.unusedPrepaidRentPaise, 68_680);
  assert.ok(breakdown.electricityDeductionPaise > 0);
  assert.equal(
    breakdown.finalRefundPaise,
    breakdown.depositRemainingPaise + breakdown.unusedPrepaidRentPaise,
  );
  assert.ok(breakdown.finalRefundPaise < 480_700);
});

test('override electricity recomputes final refund for V2', () => {
  const detail = dhruvLikeDetail(0);
  const base = buildOperatorFinalRefundBreakdown(detail);
  const higher = buildOperatorFinalRefundBreakdown(detail, base.electricityDeductionPaise + 10_000);
  assert.equal(higher.electricityDeductionPaise, base.electricityDeductionPaise + 10_000);
  assert.equal(higher.finalRefundPaise, base.finalRefundPaise - 10_000);
});
