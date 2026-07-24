import assert from 'node:assert/strict';
import test from 'node:test';
import { computeCheckoutSettlementV2 } from '../../src/lib/checkout/checkoutSettlementEngineV2';
import { PENDING_ELECTRICITY_LABEL } from '../../src/lib/checkout/settlementDisplayFormat';
import {
  estimatedSettlementFromCheckoutWaterfall,
  type EstimatedSettlementPreview,
} from '../../src/lib/vacating/estimatedSettlementPreview';

function findRow(preview: EstimatedSettlementPreview, id: string) {
  for (const section of preview.sections) {
    const row = section.rows.find((r) => r.id === id);
    if (row) return row;
  }
  return undefined;
}

function kunalLikeWaterfall() {
  return computeCheckoutSettlementV2({
    stayCheckInDate: '2026-07-04',
    stayCheckoutDate: '2026-07-21',
    rentPaidPaise: 412_080,
    monthlyRentPaise: 150_000,
    depositCollectedPaise: 412_100,
    missingNoticeDays: 14,
    noticeApplies: true,
    electricityPaise: 0,
    damageChargePaise: 0,
    cleaningChargePaise: 0,
    customChargePaise: 0,
  });
}

test('estimated settlement from checkout waterfall shows pending deduction labels at baseline', () => {
  const waterfall = kunalLikeWaterfall();
  const preview = estimatedSettlementFromCheckoutWaterfall({
    detail: {
      bookingId: 'bk-1',
      noticeGivenDate: '2026-07-21',
      vacatingDate: '2026-07-21',
      monthlyRentPaiseSnapshot: 150_000,
      noticeRentCoveredDays: 0,
      noticeChargeableDays: 14,
      noticeDeductionPaise: 0,
      noticeBreakdownJson: {
        noticeRequiredDays: 14,
        noticeGivenDays: 0,
        missingNoticeDays: 14,
        billingDay: 5,
        billingCycleLabel: '5 Jul 2026 – 4 Aug 2026',
        paidUntilDate: '2026-08-04',
        vacatingDate: '2026-07-21',
        unusedPrepaidRentDays: 14,
        noticeCoveredByPrepaidRent: 0,
        rentCoveredDays: 0,
        chargeableNoticeDays: 14,
        dailyRentPaise: 5000,
        noticeDeductionPaise: 0,
        paidPeriodUsed: {
          periodStart: '2026-07-05',
          periodEnd: '2026-08-04',
          source: 'rent_invoice',
        },
      },
      stayType: 'monthly',
      durationMode: 'monthly',
      depositRefundablePaise: 412_100,
      preview: {
        electricityDeductionPaise: 0,
        damageChargePaise: 0,
        cleaningChargePaise: 0,
        customChargePaise: 0,
      },
      approvalBaselineLocked: true,
      amountsLocked: false,
      settlementNoticeDisplay: {
        noticeRequiredDays: 14,
        noticeGivenDays: 0,
        missingNoticeDays: 14,
        billingDay: 5,
        billingCycleLabel: '5 Jul 2026 – 4 Aug 2026',
        paidUntilDate: '2026-08-04',
        vacatingDate: '2026-07-21',
        unusedPrepaidRentDays: 14,
        noticeCoveredByPrepaidRent: 0,
        chargeableNoticeDays: 14,
        noticeDeductionPaise: 0,
      },
      billingCoverageDaysPaid: {
        value: '31 days',
        hint: '2026-07-05 → 2026-08-04',
        days: 31,
      },
    },
    waterfall,
  });

  assert.equal(preview.mode, 'baseline');
  assert.equal(preview.estimatedRefundPaise, waterfall.refund.totalPaise);
  assert.match(preview.disclaimer, /Final amount may change/);

  const electricity = findRow(preview, 'pending_electricity');
  assert.ok(electricity);
  assert.equal(electricity!.value, PENDING_ELECTRICITY_LABEL);

  const daysPaid = findRow(preview, 'days_paid');
  assert.ok(daysPaid);
  assert.match(daysPaid!.value, /31 day/);

  const billingCycle = findRow(preview, 'billing_cycle');
  assert.ok(billingCycle);
  assert.match(billingCycle!.value, /Jul 2026/);
});

test('estimated settlement switches to final mode when amounts locked', () => {
  const waterfall = kunalLikeWaterfall();
  const preview = estimatedSettlementFromCheckoutWaterfall({
    detail: {
      bookingId: 'bk-1',
      noticeGivenDate: '2026-07-21',
      vacatingDate: '2026-07-21',
      monthlyRentPaiseSnapshot: 150_000,
      depositRefundablePaise: 412_100,
      preview: { electricityDeductionPaise: 0 },
      approvalBaselineLocked: true,
      amountsLocked: true,
    },
    waterfall,
  });

  assert.equal(preview.mode, 'final');
  assert.match(preview.disclaimer, /Final refund/);
});
