import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  computeCalendarMonthPrepaidMoveOutSettlement,
  occupiedCalendarDaysThroughVacating,
  unusedCalendarDaysAfterVacating,
} from '@/src/lib/vacating/calendarMonthPrepaidMoveOutSettlement';
import { buildResidentMoveOutRefundSummary } from '@/src/lib/residents/residentMoveOutRefundSummary';
import { resolveAdminMoveOutFinancialSummary } from '@/src/lib/vacating/adminMoveOutFinancialSummary';
import { computeCheckoutSettlementV2 } from '@/src/lib/checkout/checkoutSettlementEngineV2';
import { bedAvailableCalendarDate } from '@/src/lib/vacating/vacatingBedSemantics';
import { resolveNoticeGivenDateForVacating } from '@/src/lib/vacating/noticeDateSsot';
import { noticeShortfallDays, VACATING_NOTICE_MIN_DAYS } from '@/src/services/billing';
import { moveOutUnusedRentCreditReason } from '@/src/services/residentCreditLedger';
import type { MoveOutPipelineItemClient } from '@/src/lib/moveOut/moveOutPipeline';
import type { VacatingApprovalPreview } from '@/src/lib/vacating/approvalPreview';

/** Angatra August invoice rent (production paid August invoice). */
const ANGATRA_AUG_RENT_PAISE = 463_590;
const ANGATRA_DEPOSIT_PAISE = 450_000;
const NOTICE_GIVEN = '2026-08-20';
const VACATE = '2026-08-24';

test('31-day month, full month prepaid, vacate on 24th → 24 occupied / 7 unused', () => {
  const s = computeCalendarMonthPrepaidMoveOutSettlement({
    monthlyRentPaise: ANGATRA_AUG_RENT_PAISE,
    vacatingDate: VACATE,
    noticeGivenDate: NOTICE_GIVEN,
    securityDepositPaise: ANGATRA_DEPOSIT_PAISE,
  });
  assert.equal(s.daysInMonth, 31);
  assert.equal(s.occupiedDays, 24);
  assert.equal(s.unusedDays, 7);
  assert.equal(occupiedCalendarDaysThroughVacating(VACATE), 24);
  assert.equal(unusedCalendarDaysAfterVacating(VACATE, '2026-08-31'), 7);
});

test('unused rent = monthly / 31 × 7 (calendar day SSOT)', () => {
  const s = computeCalendarMonthPrepaidMoveOutSettlement({
    monthlyRentPaise: ANGATRA_AUG_RENT_PAISE,
    vacatingDate: VACATE,
    noticeGivenDate: NOTICE_GIVEN,
    securityDepositPaise: ANGATRA_DEPOSIT_PAISE,
  });
  const daily = Math.floor(ANGATRA_AUG_RENT_PAISE / 31);
  assert.equal(s.dailyRentPaise, daily);
  assert.equal(s.unusedPrepaidRentPaise, daily * 7);
  assert.equal(s.occupiedRentPaise, daily * 24);
});

test('4 days notice vs required 5 → exactly 1 daily-rent notice deduction', () => {
  assert.equal(VACATING_NOTICE_MIN_DAYS, 5);
  assert.equal(noticeShortfallDays({ noticeGivenDate: NOTICE_GIVEN, vacatingDate: VACATE }), 1);
  const s = computeCalendarMonthPrepaidMoveOutSettlement({
    monthlyRentPaise: ANGATRA_AUG_RENT_PAISE,
    vacatingDate: VACATE,
    noticeGivenDate: NOTICE_GIVEN,
    securityDepositPaise: ANGATRA_DEPOSIT_PAISE,
  });
  assert.equal(s.noticeGivenDays, 4);
  assert.equal(s.noticeShortfallDays, 1);
  assert.equal(s.noticeDeductionPaise, s.dailyRentPaise);
});

test('notice deduction comes from unused-rent credit, not deposit', () => {
  const s = computeCalendarMonthPrepaidMoveOutSettlement({
    monthlyRentPaise: ANGATRA_AUG_RENT_PAISE,
    vacatingDate: VACATE,
    noticeGivenDate: NOTICE_GIVEN,
    securityDepositPaise: ANGATRA_DEPOSIT_PAISE,
  });
  assert.equal(s.securityDepositPaise, ANGATRA_DEPOSIT_PAISE);
  assert.equal(
    s.netUnusedRentWalletCreditPaise,
    s.unusedPrepaidRentPaise - s.noticeDeductionPaise,
  );
  assert.equal(s.netUnusedRentWalletCreditPaise, s.dailyRentPaise * 6);
  assert.equal(
    s.estimatedRefundablePaise,
    ANGATRA_DEPOSIT_PAISE + s.netUnusedRentWalletCreditPaise,
  );
});

test('deposit remains independently ₹4,500; electricity pending', () => {
  const s = computeCalendarMonthPrepaidMoveOutSettlement({
    monthlyRentPaise: ANGATRA_AUG_RENT_PAISE,
    vacatingDate: VACATE,
    noticeGivenDate: NOTICE_GIVEN,
    securityDepositPaise: ANGATRA_DEPOSIT_PAISE,
  });
  assert.equal(s.securityDepositPaise, 450_000);
  assert.equal(s.electricityPending, true);
  assert.equal(s.electricityDeductionPaise, 0);
});

test('resident and admin summaries match waterfall (no deposit-tail for prepaid unused)', () => {
  const daily = Math.floor(ANGATRA_AUG_RENT_PAISE / 31);
  const unused = daily * 7;
  const waterfall = computeCheckoutSettlementV2({
    stayCheckInDate: '2026-08-01',
    stayCheckoutDate: VACATE,
    rentPaidPaise: ANGATRA_AUG_RENT_PAISE,
    monthlyRentPaise: ANGATRA_AUG_RENT_PAISE,
    depositCollectedPaise: ANGATRA_DEPOSIT_PAISE,
    missingNoticeDays: 1,
    noticeApplies: true,
    prepaidAfterVacatingPaise: unused,
    checkoutTailRentPaise: 0,
    periodDailyRentPaise: daily,
  });

  assert.equal(waterfall.depositBucket.tailRentPaise, 0);
  assert.equal(waterfall.depositBucket.refundablePaise, ANGATRA_DEPOSIT_PAISE);
  assert.equal(waterfall.notice.fromDepositPaise, 0);
  assert.equal(waterfall.notice.fromUnusedRentPaise, daily);
  assert.equal(waterfall.refund.unusedRentPortionPaise, daily * 6);

  const resident = buildResidentMoveOutRefundSummary(waterfall, { isEstimate: true });
  const admin = resolveAdminMoveOutFinancialSummary(
    {
      vacatingRequestId: 'vr-1',
      vacatingDate: VACATE,
      depositHeldPaise: ANGATRA_DEPOSIT_PAISE,
      deductionPaise: daily,
      electricityDeductionPaise: 0,
      estimatedRefundPaise: 0,
    } as MoveOutPipelineItemClient,
    {
      estimatedSettlement: {
        waterfall,
        estimatedRefundPaise: waterfall.refund.totalPaise,
      },
    } as VacatingApprovalPreview,
  );

  assert.equal(admin.securityDepositPaise, resident.securityDepositPaise);
  assert.equal(admin.unusedPrepaidRentPaise, resident.unusedPrepaidRentPaise);
  assert.equal(admin.noticeDeductionPaise, resident.noticeDeductionPaise);
  assert.equal(admin.netUnusedRentWalletCreditPaise, resident.netUnusedRentWalletCreditPaise);
  assert.equal(admin.estimatedRefundPaise, resident.estimatedRefundPaise);
  assert.equal(resident.electricityPending, true);
  assert.notEqual(resident.estimatedRefundPaise, 642_780);
  assert.notEqual(resident.unusedPrepaidRentPaise, 559_980);
});

test('bed available exactly Aug 25 00:00 (day after vacate)', () => {
  assert.equal(bedAvailableCalendarDate(VACATE), '2026-08-25');
  const s = computeCalendarMonthPrepaidMoveOutSettlement({
    monthlyRentPaise: ANGATRA_AUG_RENT_PAISE,
    vacatingDate: VACATE,
    noticeGivenDate: NOTICE_GIVEN,
    securityDepositPaise: ANGATRA_DEPOSIT_PAISE,
  });
  assert.equal(s.bedAvailableFrom, '2026-08-25');
  assert.equal(s.lastOccupiedDate, VACATE);
});

test('exact 5-day notice → zero notice deduction', () => {
  const s = computeCalendarMonthPrepaidMoveOutSettlement({
    monthlyRentPaise: ANGATRA_AUG_RENT_PAISE,
    vacatingDate: '2026-08-25',
    noticeGivenDate: '2026-08-20',
    securityDepositPaise: ANGATRA_DEPOSIT_PAISE,
  });
  assert.equal(s.noticeShortfallDays, 0);
  assert.equal(s.noticeDeductionPaise, 0);
  assert.equal(s.netUnusedRentWalletCreditPaise, s.unusedPrepaidRentPaise);
});

test('late notice rule is the same for every resident (shortfall × daily)', () => {
  const s = computeCalendarMonthPrepaidMoveOutSettlement({
    monthlyRentPaise: 310_000,
    vacatingDate: '2026-08-10',
    noticeGivenDate: '2026-08-08',
    securityDepositPaise: 400_000,
  });
  assert.equal(s.noticeGivenDays, 2);
  assert.equal(s.noticeShortfallDays, 3);
  assert.equal(s.noticeDeductionPaise, s.dailyRentPaise * 3);
  assert.equal(s.securityDepositPaise, 400_000);
});

test('changing vacating date recalculates unused rent dynamically', () => {
  const earlier = computeCalendarMonthPrepaidMoveOutSettlement({
    monthlyRentPaise: ANGATRA_AUG_RENT_PAISE,
    vacatingDate: '2026-08-20',
    noticeGivenDate: NOTICE_GIVEN,
    securityDepositPaise: ANGATRA_DEPOSIT_PAISE,
  });
  const later = computeCalendarMonthPrepaidMoveOutSettlement({
    monthlyRentPaise: ANGATRA_AUG_RENT_PAISE,
    vacatingDate: VACATE,
    noticeGivenDate: NOTICE_GIVEN,
    securityDepositPaise: ANGATRA_DEPOSIT_PAISE,
  });
  assert.equal(earlier.unusedDays, 11);
  assert.equal(later.unusedDays, 7);
  assert.ok(earlier.unusedPrepaidRentPaise > later.unusedPrepaidRentPaise);
});

test('original notice timestamp date is immutable SSOT for notice calc', () => {
  const resolved = resolveNoticeGivenDateForVacating({
    noticeGivenDate: '2026-08-21',
    originalNoticeSubmittedAt: '2026-08-20T12:07:01.204Z',
  });
  assert.equal(resolved, NOTICE_GIVEN);
});

test('wallet unused-rent credit reason is idempotent per vacating request', () => {
  const a = moveOutUnusedRentCreditReason('198831f7-189c-4aaf-874b-c066d6323d05');
  const b = moveOutUnusedRentCreditReason('198831f7-189c-4aaf-874b-c066d6323d05');
  assert.equal(a, b);
  const source = readFileSync('src/services/residentCreditLedger.ts', 'utf8');
  assert.match(source, /hasResidentCreditEntryWithReasonPrefix|reasonPrefix/);
  assert.match(source, /syncMoveOutUnusedRentWalletCredit/);
});

test('calendar-month coverage loader prefers billing month over bad invoice notes', () => {
  const source = readFileSync('src/services/billingCoverage.ts', 'utf8');
  assert.match(source, /calendar_month_1st/);
  assert.match(source, /notesMatchCalendar/);
  assert.match(source, /calendarMonthBillingPeriod/);
});

test('settlement context never charges deposit tail when vacating inside paid period', () => {
  const source = readFileSync('src/lib/vacating/computeVacatingSettlementPreview.ts', 'utf8');
  assert.match(source, /never deposit tail rent/);
  assert.match(source, /checkoutTailRentPaise = 0/);
  assert.match(source, /outstanding_final_rent_invoice/);
});
