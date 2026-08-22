import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  computeCheckoutSettlementV2,
  type CheckoutSettlementWaterfall,
} from '../../src/lib/checkout/checkoutSettlementEngineV2';
import { isBedReleasedForVacating, bedAvailableCalendarDate } from '../../src/lib/vacating/vacatingBedSemantics';
import { shouldShortenStayOnVacatingApproval } from '../../src/lib/occupancyEligibility';
import { deriveMoveOutWorkflowStage } from '../../src/lib/moveOut/moveOutWorkflowStages';
import { toClientMoveOutPipelineItem } from '../../src/lib/moveOut/moveOutPipeline';
import {
  applyEstimatedSettlementToApprovalPreview,
  buildVacatingApprovalPreview,
} from '../../src/lib/vacating/approvalPreview';
import { resolveAdminMoveOutFinancialSummary } from '../../src/lib/vacating/adminMoveOutFinancialSummary';
import { buildResidentMoveOutRefundSummary } from '../../src/lib/residents/residentMoveOutRefundSummary';
import { resolveNoticeGivenDateForVacating } from '../../src/lib/vacating/noticeDateSsot';
import { computeNoticeDeductionBreakdown } from '../../src/lib/vacating/noticeDeductionEngine';
import {
  dailyRateFromMonthly,
  isNoticeCompliant,
  VACATING_NOTICE_MIN_DAYS,
} from '../../src/services/billing';

const TODAY = '2026-08-23';
const ANGATRA_VACATE = '2026-08-24';
const ANGATRA_NOTICE = '2026-08-20';
const MONTHLY_RENT_PAISE = 459_000;

function angatraPendingRow() {
  return toClientMoveOutPipelineItem({
    id: '198831f7-189c-4aaf-874b-c066d6323d05',
    vacatingRequestId: '198831f7-189c-4aaf-874b-c066d6323d05',
    bookingId: 'ad24c0d2-f2d1-4c08-99d1-74487560feb5',
    bookingCode: 'APG-2026-0013',
    customerId: 'cust-angatra',
    customerFullName: 'Angatra Mandal',
    customerPhone: '+917074754939',
    pgName: 'Shanti Nagar',
    roomNumber: '202',
    bedCode: 'B3',
    vacatingDate: ANGATRA_VACATE,
    noticeGivenDate: ANGATRA_NOTICE,
    noticeCompliant: false,
    vacatingStatus: 'pending',
    settlementId: null,
    settlementStatus: null,
    stage: 'requested',
    stageIndex: 0,
    stageLabel: 'Requested',
    nextAction: 'Verify notice period and approve move-out',
    continueHref: '/admin/vacating?read=vacating%3A198831f7-189c-4aaf-874b-c066d6323d05',
    continueKind: 'approve',
    sortPriority: 0,
    resolvedAt: null,
    createdAt: new Date('2026-08-20T12:07:01.204Z'),
    updatedAt: new Date('2026-08-21T09:00:00.000Z'),
    deductionPaise: 15_300,
    electricityDeductionPaise: 0,
    depositHeldPaise: 450_000,
    estimatedRefundPaise: 434_700,
    noticeRentCoveredDays: 0,
    noticeChargeableDays: 1,
    daysRemaining: 1,
    urgency: 'normal',
    bedStatus: 'Occupied',
    stageTimestamps: {},
    durationMode: 'open_ended',
    workflowKind: 'monthly_stay',
  });
}

function angatraWaterfall(): CheckoutSettlementWaterfall {
  return computeCheckoutSettlementV2({
    stayCheckInDate: '2026-06-01',
    stayCheckoutDate: ANGATRA_VACATE,
    rentPaidPaise: 927_180,
    monthlyRentPaise: MONTHLY_RENT_PAISE,
    depositCollectedPaise: 450_000,
    missingNoticeDays: 1,
    noticeApplies: true,
    prepaidAfterVacatingPaise: 559_980,
    checkoutTailRentPaise: 351_900,
  });
}

test('pending move-out requires admin review before vacate date', () => {
  const row = angatraPendingRow();
  const workflow = deriveMoveOutWorkflowStage(row);
  assert.equal(workflow.id, 'pending_request');
  assert.equal(workflow.requiresAdminAction, true);
  assert.ok(row.daysRemaining > 0);
  assert.equal(row.vacatingDate > TODAY, true);
});

test('MoveOutPrimaryButton is not gated on move-out date or estimatedSettlement', () => {
  const source = readFileSync('src/components/admin/moveOut/MoveOutPipelineQueue.tsx', 'utf8');
  assert.doesNotMatch(source, /cursor-not-allowed opacity-50/);
  assert.doesNotMatch(source, /!preview\?\.estimatedSettlement/);
});

test('approval before vacate shortens stay to final day but does not release bed early', () => {
  assert.equal(shouldShortenStayOnVacatingApproval(ANGATRA_VACATE, TODAY), true);
  assert.equal(bedAvailableCalendarDate(ANGATRA_VACATE), '2026-08-25');
  const beforeVacateIst = new Date('2026-08-24T12:00:00.000Z');
  assert.equal(isBedReleasedForVacating(ANGATRA_VACATE, beforeVacateIst), false);
});

test('bed becomes available at midnight after final stay day', () => {
  const releaseMidnightIst = new Date('2026-08-24T18:30:00.000Z');
  assert.equal(isBedReleasedForVacating(ANGATRA_VACATE, releaseMidnightIst), true);
});

test('admin settlement summary matches resident SSOT waterfall', () => {
  const waterfall = angatraWaterfall();
  const resident = buildResidentMoveOutRefundSummary(waterfall, { isEstimate: true });
  const sync = buildVacatingApprovalPreview(
    {
      id: '198831f7-189c-4aaf-874b-c066d6323d05',
      bookingId: 'ad24c0d2-f2d1-4c08-99d1-74487560feb5',
      bookingCode: 'APG-2026-0013',
      customerId: 'cust-angatra',
      customerFullName: 'Angatra Mandal',
      customerPhone: '+917074754939',
      pgId: 'pg-1',
      pgName: 'Shanti Nagar',
      bedCode: 'B3',
      roomNumber: '202',
      noticeGivenDate: ANGATRA_NOTICE,
      vacatingDate: ANGATRA_VACATE,
      originalNoticeSubmittedAt: new Date('2026-08-20T12:07:01.204Z'),
      noticeCompliant: false,
      deductionPaise: 15_300,
      depositRefundPaise: 0,
      monthlyRentPaiseSnapshot: MONTHLY_RENT_PAISE,
      noticeRentCoveredDays: 0,
      noticeChargeableDays: 1,
      durationMode: 'open_ended',
      stayType: 'monthly_stay',
      status: 'pending',
      resolvedAt: null,
      createdAt: new Date('2026-08-20T12:07:01.204Z'),
      updatedAt: new Date('2026-08-21T09:00:00.000Z'),
    },
    450_000,
  );
  const preview = applyEstimatedSettlementToApprovalPreview(sync, {
    sections: [],
    auditTrace: [],
    waterfall,
    estimatedRefundPaise: waterfall.refund.totalPaise,
    estimatedUnusedRentCreditPaise: waterfall.refund.unusedRentPortionPaise,
    estimatedRefundableDepositPaise: waterfall.depositBucket.refundablePaise,
    depositHeldPaise: 450_000,
    disclaimer: '',
    mode: 'estimate',
  });
  const admin = resolveAdminMoveOutFinancialSummary(angatraPendingRow(), preview);

  assert.equal(admin.securityDepositPaise, resident.securityDepositPaise);
  assert.equal(admin.unusedPrepaidRentPaise, waterfall.rentBucket.unusedPaise);
  assert.equal(admin.estimatedRefundPaise, resident.estimatedRefundPaise);
  assert.equal(admin.electricityPending, true);
  assert.notEqual(admin.estimatedRefundPaise, 434_700);
});

test('unused prepaid rent is included in estimated refundable total', () => {
  const waterfall = angatraWaterfall();
  assert.equal(waterfall.rentBucket.unusedPaise, 559_980);
  assert.ok(waterfall.refund.unusedRentPortionPaise > 0);
  assert.ok(waterfall.refund.totalPaise > waterfall.depositBucket.refundablePaise);
});

test('notice calculation uses immutable original notice timestamp date', () => {
  const resolved = resolveNoticeGivenDateForVacating({
    noticeGivenDate: '2026-08-21',
    originalNoticeSubmittedAt: '2026-08-20T12:07:01.204Z',
  });
  assert.equal(resolved, ANGATRA_NOTICE);
});

test('exact 5-day notice yields zero notice deduction', () => {
  const vacatingDate = '2026-08-25';
  const noticeGivenDate = '2026-08-20';
  assert.equal(VACATING_NOTICE_MIN_DAYS, 5);
  assert.equal(isNoticeCompliant({ noticeGivenDate, vacatingDate }), true);
  const notice = computeNoticeDeductionBreakdown({
    noticeGivenDate,
    vacatingDate,
    monthlyRentPaise: MONTHLY_RENT_PAISE,
  });
  assert.equal(notice.noticeDeductionPaise, 0);
  assert.equal(notice.chargeableNoticeDays, 0);
});

test('Angatra 20 Aug to 24 Aug notice is 1-day shortfall and ₹153 deduction', () => {
  const notice = computeNoticeDeductionBreakdown({
    noticeGivenDate: ANGATRA_NOTICE,
    vacatingDate: ANGATRA_VACATE,
    monthlyRentPaise: MONTHLY_RENT_PAISE,
  });
  assert.equal(notice.chargeableNoticeDays, 1);
  assert.equal(notice.noticeDeductionPaise, dailyRateFromMonthly(MONTHLY_RENT_PAISE));
  assert.equal(notice.noticeDeductionPaise, 15_300);
});

test('review/load paths do not post wallet credit', () => {
  const loader = readFileSync('src/lib/vacating/loadAdminVacatingPageData.ts', 'utf8');
  const queue = readFileSync('src/components/admin/moveOut/MoveOutPipelineQueue.tsx', 'utf8');
  assert.doesNotMatch(loader, /syncMoveOutUnusedRentWalletCredit/);
  assert.doesNotMatch(queue, /syncMoveOutUnusedRentWalletCredit/);
});

test('approval wallet sync is idempotent per vacating request', () => {
  const source = readFileSync('src/services/residentCreditLedger.ts', 'utf8');
  assert.match(source, /hasResidentCreditEntryWithReasonPrefix/);
  assert.match(source, /moveOutUnusedRentCreditReason\(vr\.id\)/);
  assert.match(readFileSync('src/services/vacating.ts', 'utf8'), /syncMoveOutUnusedRentWalletCredit/);
});
