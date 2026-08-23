/**
 * Regression: pending vacating request must appear in Admin Operations move-out
 * queue after calendar-day settlement engine — even when DB returns
 * originalNoticeSubmittedAt as a string (postgres driver) and settlement is estimate-only.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  buildVacatingApprovalPreview,
  applyEstimatedSettlementToApprovalPreview,
  type VacatingApprovalPreview,
} from '@/src/lib/vacating/approvalPreview';
import { computeCalendarMonthPrepaidMoveOutSettlement } from '@/src/lib/vacating/calendarMonthPrepaidMoveOutSettlement';
import { computeCheckoutSettlementV2 } from '@/src/lib/checkout/checkoutSettlementEngineV2';
import {
  buildMoveOutPipeline,
  toClientMoveOutPipelineItem,
} from '@/src/lib/moveOut/moveOutPipeline';
import { moveOutClientRequiresAdminActionNow } from '@/src/lib/operations/moveOutAdminAction';
import { resolveAdminMoveOutFinancialSummary } from '@/src/lib/vacating/adminMoveOutFinancialSummary';
import { toMoveOutAdvancedToolsRow } from '@/src/lib/moveOut/moveOutAdvancedToolsProps';

const ANGATRA_ID = '198831f7-189c-4aaf-874b-c066d6323d05';
const ANGATRA_BOOKING = 'ad24c0d2-f2d1-4c08-99d1-74487560feb5';
const ANGATRA_AUG_RENT_PAISE = 463_590;
const ANGATRA_DEPOSIT_PAISE = 450_000;
const NOTICE_TS = '2026-08-20T12:07:01.204Z';
const NOTICE = '2026-08-20';
const VACATE = '2026-08-24';

function angatraVacatingRow(overrides: Record<string, unknown> = {}) {
  return {
    id: ANGATRA_ID,
    bookingId: ANGATRA_BOOKING,
    bookingCode: 'APG-2026-0013',
    customerId: 'cust-angatra',
    customerFullName: 'Angatra Mandal',
    customerPhone: '+917074754939',
    pgId: 'pg-1',
    pgName: 'Shanti Nagar',
    bedCode: 'B3',
    roomNumber: '202',
    noticeGivenDate: NOTICE,
    vacatingDate: VACATE,
    // Production driver often returns timestamp as string — this crashed Ops queue.
    originalNoticeSubmittedAt: NOTICE_TS,
    noticeCompliant: false,
    deductionPaise: 15_300,
    depositRefundPaise: 0,
    monthlyRentPaiseSnapshot: 459_000,
    noticeRentCoveredDays: 0,
    noticeChargeableDays: 1,
    durationMode: 'open_ended' as const,
    stayType: 'monthly_stay' as const,
    status: 'pending' as const,
    resolvedAt: null,
    createdAt: NOTICE_TS,
    updatedAt: '2026-08-21T09:00:00.000Z',
    ...overrides,
  };
}

test('buildVacatingApprovalPreview does not throw when originalNoticeSubmittedAt is a string', () => {
  assert.doesNotThrow(() => {
    const preview = buildVacatingApprovalPreview(angatraVacatingRow() as never, ANGATRA_DEPOSIT_PAISE);
    assert.equal(preview.noticeSubmittedAt, NOTICE_TS);
    assert.equal(preview.noticeSubmittedDate, NOTICE);
    assert.equal(preview.moveOutDate, VACATE);
    assert.equal(preview.residentName, 'Angatra Mandal');
  });
});

test('toMoveOutAdvancedToolsRow survives string timestamps (Ops advanced tools path)', () => {
  const row = toMoveOutAdvancedToolsRow(angatraVacatingRow() as never, ANGATRA_DEPOSIT_PAISE);
  assert.ok(row.approvalPreview);
  assert.equal(row.approvalPreview!.noticeSubmittedAt, NOTICE_TS);
  assert.doesNotThrow(() => JSON.stringify(row));
});

test('pending vacating request appears in Admin Operations queue after calendar-day settlement', () => {
  const vacatingRows = [angatraVacatingRow()];
  const pipeline = buildMoveOutPipeline({
    vacatingRows: vacatingRows as never,
    settlements: [],
    depositHeldByBooking: { [ANGATRA_BOOKING]: ANGATRA_DEPOSIT_PAISE },
    today: '2026-08-23',
  });

  assert.equal(pipeline.length, 1, 'Move-out pipeline count must be 1');
  const item = pipeline[0]!;
  assert.equal(item.vacatingRequestId, ANGATRA_ID);
  assert.equal(item.customerFullName, 'Angatra Mandal');
  assert.equal(item.vacatingStatus, 'pending');
  assert.equal(item.continueKind, 'approve');

  const client = toClientMoveOutPipelineItem(item);
  assert.equal(moveOutClientRequiresAdminActionNow(client), true, 'Review move-out must be enabled');

  // Calendar-day SSOT settlement applied as estimate (electricity pending, no checkout yet).
  const calendar = computeCalendarMonthPrepaidMoveOutSettlement({
    monthlyRentPaise: ANGATRA_AUG_RENT_PAISE,
    vacatingDate: VACATE,
    noticeGivenDate: NOTICE,
    securityDepositPaise: ANGATRA_DEPOSIT_PAISE,
  });
  const waterfall = computeCheckoutSettlementV2({
    stayCheckInDate: '2026-08-01',
    stayCheckoutDate: VACATE,
    rentPaidPaise: ANGATRA_AUG_RENT_PAISE,
    monthlyRentPaise: ANGATRA_AUG_RENT_PAISE,
    depositCollectedPaise: ANGATRA_DEPOSIT_PAISE,
    missingNoticeDays: calendar.noticeShortfallDays,
    noticeApplies: true,
    prepaidAfterVacatingPaise: calendar.unusedPrepaidRentPaise,
    checkoutTailRentPaise: 0,
    periodDailyRentPaise: calendar.dailyRentPaise,
  });

  const sync = buildVacatingApprovalPreview(angatraVacatingRow() as never, ANGATRA_DEPOSIT_PAISE);
  const preview: VacatingApprovalPreview = applyEstimatedSettlementToApprovalPreview(sync, {
    sections: [],
    auditTrace: [],
    waterfall,
    estimatedRefundPaise: waterfall.refund.totalPaise,
    estimatedUnusedRentCreditPaise: waterfall.refund.unusedRentPortionPaise,
    estimatedRefundableDepositPaise: waterfall.depositBucket.refundablePaise,
    depositHeldPaise: ANGATRA_DEPOSIT_PAISE,
    disclaimer: '',
    mode: 'estimate',
  });

  assert.ok(preview.estimatedSettlement, 'Settlement preview must load');
  const admin = resolveAdminMoveOutFinancialSummary(client, preview);
  assert.equal(admin.noticeDeductionPaise, calendar.noticeDeductionPaise);
  assert.equal(admin.unusedPrepaidRentPaise, calendar.unusedPrepaidRentPaise);
  assert.equal(admin.netUnusedRentWalletCreditPaise, calendar.netUnusedRentWalletCreditPaise);
  assert.equal(admin.securityDepositPaise, ANGATRA_DEPOSIT_PAISE);
  assert.equal(admin.estimatedRefundPaise, calendar.estimatedRefundablePaise);
  assert.equal(admin.estimatedRefundPaise, 539_724);
  assert.equal(admin.electricityPending, true);

  // Ops empty-state only when no action-required pipeline rows — Angatra must not hit that.
  const actionRequired = [client].filter((r) => moveOutClientRequiresAdminActionNow(r));
  assert.equal(actionRequired.length, 1);
  assert.equal(actionRequired[0]!.customerFullName, 'Angatra Mandal');
});

test('Operations page isolates pipeline load from approval-preview failures', () => {
  const page = readFileSync('app/(admin)/admin/operations/page.tsx', 'utf8');
  assert.match(page, /moveOutApprovalPreviews/);
  assert.match(page, /loadMoveOutPipelineBundle/);
  // Inner preview catch clears previews only — not the pipeline rows.
  const previewLog = "logOperationsLoaderError('moveOutApprovalPreviews'";
  const i = page.indexOf(previewLog);
  assert.ok(i > 0);
  const previewCatchOnly = page.slice(i, page.indexOf('} catch (err)', i + previewLog.length));
  assert.match(previewCatchOnly, /approvalPreviewByRequestId = \{\}/);
  assert.doesNotMatch(previewCatchOnly, /moveOutPipelineActiveItems = \[\]/);
});

test('loadPendingVacatingApprovalPreviews wraps sync fallback so one row cannot wipe queue', () => {
  const src = readFileSync('src/lib/vacating/loadAdminVacatingPageData.ts', 'utf8');
  assert.match(src, /approval preview sync fallback failed/);
  assert.match(src, /One corrupt\/legacy timestamp must not wipe/);
});
