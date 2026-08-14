import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildAdminSettlementAuditBreakdown,
  formatAuditDays,
  formatAuditPaise,
  isAuditEmpty,
} from '../../src/lib/checkout/adminSettlementAuditBreakdown';
import { computeCheckoutSettlementV2 } from '../../src/lib/checkout/checkoutSettlementEngineV2';
import type { CheckoutSettlementDetail } from '../../src/services/checkoutSettlement';

function findRow(
  audit: ReturnType<typeof buildAdminSettlementAuditBreakdown>,
  id: string,
) {
  for (const section of audit.sections) {
    const row = section.rows.find((r) => r.id === id);
    if (row) return row;
  }
  return undefined;
}

function kunalLikeDetail(): CheckoutSettlementDetail {
  const dailyRentPaise = 5000;
  const unusedPrepaidDays = 14;
  const waterfall = computeCheckoutSettlementV2({
    stayCheckInDate: '2026-07-04',
    stayCheckoutDate: '2026-07-21',
    rentPaidPaise: 412_080,
    monthlyRentPaise: 150_000,
    depositCollectedPaise: 412_100,
    missingNoticeDays: 5,
    noticeApplies: true,
    electricityPaise: 0,
    damageChargePaise: 0,
    customChargePaise: 0,
    prepaidAfterVacatingPaise: unusedPrepaidDays * dailyRentPaise,
  });

  return {
    id: 'settlement-1',
    status: 'awaiting_admin_review',
    customerName: 'Kunal Chaudhari',
    bookingCode: 'APG-2026-0045',
    vacatingDate: '2026-07-21',
    moveInDate: '2026-07-04',
    noticeGivenDate: '2026-07-21',
    noticeRequiredDays: 5,
    noticeGivenDays: 0,
    noticeShortfallDays: 5,
    noticeRentCoveredDays: 5,
    noticeChargeableDays: 0,
    noticeDeductionPaise: waterfall.notice.fromDepositPaise,
    noticeFromDepositPaise: waterfall.notice.fromDepositPaise,
    noticeFromUnusedRentPaise: waterfall.notice.fromUnusedRentPaise,
    monthlyRentPaiseSnapshot: 150_000,
    depositRefundablePaise: 412_100,
    settlementEngineVersion: 2,
    noticeBreakdownJson: {
      noticeRequiredDays: 5,
      noticeGivenDays: 0,
      missingNoticeDays: 5,
      billingDay: 5,
      billingCycleLabel: '5 Jul 2026 – 4 Aug 2026',
      paidUntilDate: '2026-08-04',
      vacatingDate: '2026-07-21',
      unusedPrepaidRentDays: unusedPrepaidDays,
      noticeCoveredByPrepaidRent: 5,
      rentCoveredDays: 5,
      chargeableNoticeDays: 0,
      dailyRentPaise: dailyRentPaise,
      noticeDeductionPaise: 0,
      paidPeriodUsed: {
        periodStart: '2026-07-05',
        periodEnd: '2026-08-04',
        source: 'rent_invoice',
      },
    },
    preview: {
      finalRefundPaise: waterfall.refund.totalPaise,
      noticeDeductionPaise: waterfall.notice.fromDepositPaise,
      electricityDeductionPaise: 0,
      electricityDeductFromDeposit: true,
      electricitySharePaise: 0,
      totalDeductionsPaise: waterfall.notice.fromDepositPaise,
      damageChargePaise: 0,
      cleaningChargePaise: 0,
      customChargePaise: 0,
      unusedRentRefundPaise: waterfall.refund.unusedRentPortionPaise,
    },
    waterfall,
    settlementNoticeDisplay: {
      noticeRequiredDays: 5,
      noticeGivenDays: 0,
      missingNoticeDays: 5,
      billingDay: 5,
      billingCycleLabel: '5 Jul 2026 – 4 Aug 2026',
      paidUntilDate: '2026-08-04',
      vacatingDate: '2026-07-21',
      unusedPrepaidRentDays: unusedPrepaidDays,
      noticeCoveredByPrepaidRent: 5,
      chargeableNoticeDays: 0,
      noticeDeductionPaise: 0,
    },
    billingCoverageDaysPaid: {
      value: '31 days',
      hint: '2026-07-05 → 2026-08-04',
      days: 31,
    },
  } as CheckoutSettlementDetail;
}

test('formatAudit helpers treat zero as valid, null as dash', () => {
  assert.equal(isAuditEmpty(null), true);
  assert.equal(isAuditEmpty(undefined), true);
  assert.equal(isAuditEmpty(''), true);
  assert.equal(isAuditEmpty(0), false);
  assert.equal(formatAuditDays(0), '0 days');
  assert.equal(formatAuditPaise(0), '₹0');
});

test('Kunal-like V2 audit populates all required fields', () => {
  const audit = buildAdminSettlementAuditBreakdown(kunalLikeDetail());

  assert.equal(audit.usesV2, true);

  const billingCycle = findRow(audit, 'billing_cycle');
  assert.ok(billingCycle);
  assert.notEqual(billingCycle!.value, '—');
  assert.match(billingCycle!.value, /Jul 2026/);

  const paidUntil = findRow(audit, 'paid_until');
  assert.ok(paidUntil);
  assert.notEqual(paidUntil!.value, '—');

  const vacating = findRow(audit, 'vacating_date');
  assert.ok(vacating);
  assert.notEqual(vacating!.value, '—');

  assert.equal(findRow(audit, 'days_paid'), undefined);

  const daysStayed = findRow(audit, 'days_stayed');
  assert.ok(daysStayed);
  assert.equal(daysStayed!.value, '18 days');

  const rentConsumed = findRow(audit, 'rent_consumed');
  assert.ok(rentConsumed);
  assert.notEqual(rentConsumed!.value, '—');

  const unusedPrepaid = findRow(audit, 'unused_prepaid_rent');
  assert.ok(unusedPrepaid);
  assert.match(unusedPrepaid!.value, /14 days/);
  assert.match(unusedPrepaid!.value, /₹/);

  const noticeRequired = findRow(audit, 'notice_required');
  assert.ok(noticeRequired);
  assert.equal(noticeRequired!.value, '5 days');

  const noticeCovered = findRow(audit, 'notice_covered_by_unused_rent');
  assert.ok(noticeCovered);
  assert.match(noticeCovered!.value, /5 days/);

  const noticeDeposit = findRow(audit, 'notice_from_deposit');
  assert.ok(noticeDeposit);
  assert.equal(noticeDeposit!.value, '₹0');

  const electricity = findRow(audit, 'electricity');
  assert.ok(electricity);
  assert.equal(electricity!.value, '₹0');

  const depositHeld = findRow(audit, 'security_deposit_refundable');
  assert.ok(depositHeld);
  assert.notEqual(depositHeld!.value, '—');

  const finalRefund = findRow(audit, 'final_refund');
  assert.ok(finalRefund);
  assert.equal(finalRefund!.emphasis, true);
  assert.notEqual(finalRefund!.value, '—');
});

test('notice from deposit shows deduction when rent bucket exhausted', () => {
  const waterfall = computeCheckoutSettlementV2({
    stayCheckInDate: '2026-01-01',
    stayCheckoutDate: '2026-01-10',
    rentPaidPaise: 100_000,
    monthlyRentPaise: 150_000,
    depositCollectedPaise: 412_100,
    missingNoticeDays: 12,
    noticeApplies: true,
    electricityPaise: 0,
  });
  const detail = {
    ...kunalLikeDetail(),
    waterfall,
    noticeFromDepositPaise: waterfall.notice.fromDepositPaise,
    noticeFromUnusedRentPaise: waterfall.notice.fromUnusedRentPaise,
    preview: {
      ...kunalLikeDetail().preview,
      finalRefundPaise: waterfall.refund.totalPaise,
    },
  } as CheckoutSettlementDetail;

  const audit = buildAdminSettlementAuditBreakdown(detail);
  const noticeDeposit = findRow(audit, 'notice_from_deposit');
  assert.ok(noticeDeposit);
  assert.match(noticeDeposit!.value, /^−₹/);
  assert.ok(waterfall.notice.fromDepositPaise > 0);
});

test('damage, cleaning, and custom appear as separate deduction rows', () => {
  const detail = kunalLikeDetail();
  detail.preview = {
    ...detail.preview,
    damageChargePaise: 5000,
    cleaningChargePaise: 3000,
    customChargePaise: 2000,
  };
  detail.customChargeLabel = 'Key replacement';

  const audit = buildAdminSettlementAuditBreakdown(detail);
  assert.ok(findRow(audit, 'damage'));
  assert.ok(findRow(audit, 'cleaning'));
  assert.ok(findRow(audit, 'custom'));
  assert.equal(findRow(audit, 'custom')!.label, 'Key replacement');
  assert.equal(findRow(audit, 'other_deductions'), undefined);
});

test('baseline locked with zero electricity shows pending label in audit', () => {
  const detail = {
    ...kunalLikeDetail(),
    approvalBaselineLocked: true,
    amountsLocked: false,
  } as CheckoutSettlementDetail;

  const audit = buildAdminSettlementAuditBreakdown(detail);
  const electricity = findRow(audit, 'electricity');
  assert.ok(electricity);
  assert.match(electricity!.value, /Pending final meter/);

  const finalRefund = findRow(audit, 'final_refund');
  assert.ok(finalRefund);
  assert.equal(finalRefund!.label, 'Estimated refund (at approval)');
});

test('zero electricity deduction renders ₹0 not dash when baseline not locked', () => {
  const audit = buildAdminSettlementAuditBreakdown(kunalLikeDetail());
  const electricity = findRow(audit, 'electricity');
  assert.equal(electricity!.value, '₹0');
});
