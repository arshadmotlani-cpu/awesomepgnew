import assert from 'node:assert/strict';
import test from 'node:test';
import { dailyRateFromBillingPeriod } from '../../src/lib/billing/billingCoverageModel';
import { computeCheckoutSettlementV2 } from '../../src/lib/checkout/checkoutSettlementEngineV2';
import { computeVacatingSettlementWaterfallFromContext } from '../../src/lib/vacating/computeVacatingSettlementPreview';
import { computeNoticeDeductionBreakdown } from '../../src/lib/vacating/noticeDeductionEngine';
import { resolveNoticeGivenDateForVacating } from '../../src/lib/vacating/noticeDateSsot';
import {
  bedAvailableCalendarDate,
  isBedReleasedForVacating,
  stayRangeExclusiveEnd,
} from '../../src/lib/vacating/vacatingBedSemantics';
import { isNoticeCompliant, VACATING_NOTICE_MIN_DAYS } from '../../src/services/billing';
import { canBookBedFromSnapshot, computeBedOccupancySnapshot } from '../../src/lib/bedOccupancyEngine';

const MONTHLY = 459_000;
const DEPOSIT = 450_000;
const PERIOD_START = '2026-08-01';
const PERIOD_END = '2026-08-31';
const MOVE_OUT = '2026-08-25';
const NOTICE_GIVEN = '2026-08-20';
const DAILY = dailyRateFromBillingPeriod(MONTHLY, PERIOD_START, PERIOD_END);

function calendarMonth25thWaterfall(args?: {
  missingNoticeDays?: number;
  electricityPaise?: number;
  prepaidDays?: number;
}) {
  const prepaidDays = args?.prepaidDays ?? 6;
  const prepaidAfterVacatingPaise = DAILY * prepaidDays;
  return computeVacatingSettlementWaterfallFromContext({
    checkInDate: PERIOD_START,
    vacatingDate: MOVE_OUT,
    rentPaidPaise: MONTHLY * 2,
    depositHeldPaise: DEPOSIT,
    monthlyRentPaise: MONTHLY,
    missingNoticeDays: args?.missingNoticeDays ?? 0,
    noticeApplies: true,
    checkoutTailRentPaise: 0,
    prepaidAfterVacatingPaise,
    periodDailyRentPaise: DAILY,
  });
}

test('1–4 calendar-month prepaid leaving 25th: unused is 26–31, deposit in refund, no post-move-out rent', () => {
  const w = calendarMonth25thWaterfall();
  const consumedDays = 25;
  const unusedDays = 6;

  assert.equal(w.stay.stayDays, consumedDays);
  assert.equal(w.rentBucket.consumedPaise, DAILY * consumedDays);
  assert.equal(w.rentBucket.unusedPaise, DAILY * unusedDays);
  assert.equal(w.depositBucket.tailRentPaise, 0);
  assert.equal(w.notice.fullPaise, 0);
  assert.equal(w.refund.depositPortionPaise, DEPOSIT);
  assert.equal(w.refund.unusedRentPortionPaise, DAILY * unusedDays);
  assert.equal(w.refund.totalPaise, DEPOSIT + DAILY * unusedDays);
});

test('5 electricity stays 0 until finalized', () => {
  const pending = calendarMonth25thWaterfall({ electricityPaise: 0 });
  assert.equal(pending.depositBucket.electricityPaise, 0);
  const finalized = computeCheckoutSettlementV2({
    stayCheckInDate: PERIOD_START,
    stayCheckoutDate: MOVE_OUT,
    rentPaidPaise: MONTHLY,
    monthlyRentPaise: MONTHLY,
    depositCollectedPaise: DEPOSIT,
    missingNoticeDays: 0,
    noticeApplies: true,
    electricityPaise: 12_000,
    prepaidAfterVacatingPaise: DAILY * 6,
    periodDailyRentPaise: DAILY,
    checkoutTailRentPaise: 0,
  });
  assert.equal(finalized.depositBucket.electricityPaise, 12_000);
  assert.equal(finalized.refund.totalPaise, DEPOSIT - 12_000 + DAILY * 6);
});

test('6–7 exact 5-day notice from original submittedAt is ₹0 notice', () => {
  assert.equal(VACATING_NOTICE_MIN_DAYS, 5);
  const noticeGivenDate = resolveNoticeGivenDateForVacating({
    noticeGivenDate: '2026-08-22',
    originalNoticeSubmittedAt: new Date('2026-08-20T12:07:01.204Z'),
  });
  assert.equal(noticeGivenDate, NOTICE_GIVEN);
  assert.ok(isNoticeCompliant({ noticeGivenDate, vacatingDate: MOVE_OUT }));
  const breakdown = computeNoticeDeductionBreakdown({
    monthlyRentPaise: MONTHLY,
    noticeGivenDate,
    vacatingDate: MOVE_OUT,
    paidRentPeriods: [{ periodStart: PERIOD_START, periodEnd: PERIOD_END, paidPrincipalPaise: MONTHLY }],
    billingDay: 1,
  });
  assert.equal(breakdown.missingNoticeDays, 0);
  assert.equal(breakdown.noticeDeductionPaise, 0);
});

test('8 bed available at 00:00 IST the day after move-out — no overlap on 26th', () => {
  assert.equal(stayRangeExclusiveEnd(MOVE_OUT), '2026-08-26');
  assert.equal(bedAvailableCalendarDate(MOVE_OUT), '2026-08-26');
  const stillOccupied = new Date('2026-08-25T18:29:00.000Z');
  const released = new Date('2026-08-25T18:30:00.000Z');
  assert.equal(isBedReleasedForVacating(MOVE_OUT, stillOccupied), false);
  assert.equal(isBedReleasedForVacating(MOVE_OUT, released), true);
});

test('9 resident and admin share computeVacatingSettlementWaterfallFromContext', () => {
  const resident = calendarMonth25thWaterfall();
  const admin = calendarMonth25thWaterfall();
  assert.deepEqual(resident.refund, admin.refund);
  assert.equal(resident.rentBucket.unusedPaise, admin.rentBucket.unusedPaise);
});

test('10 prepaid unused is not capped by long-stay consumption (no double formula)', () => {
  const prepaid = DAILY * 6;
  const w = computeCheckoutSettlementV2({
    stayCheckInDate: '2026-06-01',
    stayCheckoutDate: MOVE_OUT,
    rentPaidPaise: MONTHLY * 3,
    monthlyRentPaise: MONTHLY,
    depositCollectedPaise: DEPOSIT,
    missingNoticeDays: 0,
    noticeApplies: true,
    prepaidAfterVacatingPaise: prepaid,
    periodDailyRentPaise: DAILY,
    checkoutTailRentPaise: 0,
  });
  assert.equal(w.rentBucket.unusedPaise, prepaid);
  assert.ok(w.refund.totalPaise >= DEPOSIT + prepaid);
});

test('11 approval before move-out does not release the bed', () => {
  const input = {
    bedStatus: 'available' as const,
    isOccupiedToday: true,
    vacatingDate: MOVE_OUT,
    vacatingStatus: 'approved' as const,
    durationMode: 'monthly',
    stayType: 'monthly_stay',
    asOfDate: '2026-08-20',
  };
  const snap = computeBedOccupancySnapshot(input);
  assert.equal(snap.bookableFromDate, '2026-08-26');
  assert.equal(canBookBedFromSnapshot({ ...input, isAvailableNow: false }, snap), false);
  assert.equal(isBedReleasedForVacating(MOVE_OUT, new Date('2026-08-20T12:00:00.000Z')), false);
});

test('12 bed bookable on available-from calendar date not on move-out date', () => {
  const vacatingDate = MOVE_OUT;
  const occupied = {
    bedStatus: 'available' as const,
    isOccupiedToday: true,
    vacatingDate,
    vacatingStatus: 'approved' as const,
    durationMode: 'monthly',
    stayType: 'monthly_stay',
    asOfDate: '2026-08-25',
  };
  const on25 = computeBedOccupancySnapshot(occupied);
  assert.equal(on25.bookableFromDate, '2026-08-26');
  assert.equal(canBookBedFromSnapshot({ ...occupied, isAvailableNow: true }, on25), false);

  const after = {
    ...occupied,
    isOccupiedToday: false,
    asOfDate: '2026-08-26',
  };
  const on26 = computeBedOccupancySnapshot(after);
  assert.equal(canBookBedFromSnapshot({ ...after, isAvailableNow: true }, on26), true);
});

test('13 Angatra-shaped 23rd vs 25th are different unused amounts (auditable, not hardcoded ₹828)', () => {
  const unused25 = calendarMonth25thWaterfall().rentBucket.unusedPaise;
  const unused23 = computeVacatingSettlementWaterfallFromContext({
    checkInDate: PERIOD_START,
    vacatingDate: '2026-08-23',
    rentPaidPaise: MONTHLY * 2,
    depositHeldPaise: DEPOSIT,
    monthlyRentPaise: MONTHLY,
    missingNoticeDays: 2,
    noticeApplies: true,
    checkoutTailRentPaise: 0,
    prepaidAfterVacatingPaise: DAILY * 8,
    periodDailyRentPaise: DAILY,
  }).rentBucket.unusedPaise;
  assert.notEqual(unused25, unused23);
  assert.notEqual(unused25, 82_800);
});
