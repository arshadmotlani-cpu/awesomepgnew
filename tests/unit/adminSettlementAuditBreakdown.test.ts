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
  const waterfall = computeCheckoutSettlementV2({
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

  return {
    id: 'settlement-1',
    status: 'awaiting_admin_review',
    customerName: 'Kunal Chaudhari',
    bookingCode: 'APG-2026-0045',
    vacatingDate: '2026-07-21',
    moveInDate: '2026-07-04',
    noticeGivenDate: '2026-07-21',
    noticeRequiredDays: 14,
    noticeGivenDays: 0,
    noticeShortfallDays: 14,
    noticeRentCoveredDays: 0,
    noticeChargeableDays: 14,
    noticeDeductionPaise: 27_472,
    noticeFromDepositPaise: waterfall.notice.fromDepositPaise,
    noticeFromUnusedRentPaise: waterfall.notice.fromUnusedRentPaise,
    monthlyRentPaiseSnapshot: 150_000,
    depositRefundablePaise: 412_100,
    settlementEngineVersion: 2,
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
      noticeDeductionPaise: 27_472,
      paidPeriodUsed: {
        periodStart: '2026-07-05',
        periodEnd: '2026-08-04',
        source: 'rent_invoice',
      },
    },
    preview: {
      finalRefundPaise: waterfall.refund.totalPaise,
      noticeDeductionPaise: 27_472,
      electricityDeductionPaise: 0,
      electricityDeductFromDeposit: true,
      electricitySharePaise: 0,
      totalDeductionsPaise: 27_472,
      damageChargePaise: 0,
      cleaningChargePaise: 0,
      customChargePaise: 0,
      unusedRentRefundPaise: waterfall.refund.unusedRentPortionPaise,
    },
    waterfall,
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

  const daysPaid = findRow(audit, 'days_paid');
  assert.ok(daysPaid);
  assert.match(daysPaid!.value, /31 day/);
  assert.match(daysPaid!.hint ?? '', /2026-07-05/);

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
  assert.equal(noticeRequired!.value, '14 days');

  const noticeCovered = findRow(audit, 'notice_covered_by_unused_rent');
  assert.ok(noticeCovered);
  assert.match(noticeCovered!.value, /0 days/);

  const noticeDeposit = findRow(audit, 'notice_from_deposit');
  assert.ok(noticeDeposit);
  assert.equal(noticeDeposit!.value, '₹0');

  const electricity = findRow(audit, 'electricity');
  assert.ok(electricity);
  assert.equal(electricity!.value, '₹0');

  const depositHeld = findRow(audit, 'deposit_held');
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

test('days paid falls back to implied formula when paidPeriodUsed missing', () => {
  const detail = kunalLikeDetail();
  detail.noticeBreakdownJson = {
    ...(detail.noticeBreakdownJson as object),
    paidPeriodUsed: null,
  };

  const audit = buildAdminSettlementAuditBreakdown(detail);
  const daysPaid = findRow(audit, 'days_paid');
  assert.ok(daysPaid);
  assert.match(daysPaid!.hint ?? '', /Implied: floor/);
  assert.match(daysPaid!.value, /day/);
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
