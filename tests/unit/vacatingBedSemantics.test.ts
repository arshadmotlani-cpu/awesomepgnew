import assert from 'node:assert/strict';
import test from 'node:test';
import {
  bedAvailableCalendarDate,
  buildVacatingDateConfirmation,
  finalStayDate,
  formatBedAvailableLabel,
  isBedReleasedForVacating,
  stayRangeExclusiveEnd,
} from '@/src/lib/vacating/vacatingBedSemantics';
import { shouldShortenStayOnVacatingApproval } from '@/src/lib/occupancyEligibility';
import { canBookBedFromSnapshot, computeBedOccupancySnapshot } from '@/src/lib/bedOccupancyEngine';

test('final stay date is the selected vacating date', () => {
  assert.equal(finalStayDate('2026-08-15'), '2026-08-15');
});

test('today selected → bed available tomorrow calendar date', () => {
  assert.equal(stayRangeExclusiveEnd('2026-08-15'), '2026-08-16');
  assert.equal(bedAvailableCalendarDate('2026-08-15'), '2026-08-16');
  const conf = buildVacatingDateConfirmation('2026-08-15', '2026-08-15');
  assert.equal(conf.isTodaySelected, true);
  assert.match(conf.lines.join(' '), /tomorrow at 12:00 AM/i);
});

test('month-end vacating → next month bed availability date', () => {
  assert.equal(bedAvailableCalendarDate('2026-08-31'), '2026-09-01');
  assert.match(formatBedAvailableLabel('2026-08-31'), /1 September 2026 at 12:00 AM/);
});

test('February leap year — 28 Feb final stay → 29 Feb bed date', () => {
  assert.equal(bedAvailableCalendarDate('2024-02-28'), '2024-02-29');
});

test('February non-leap — 28 Feb final stay → 1 Mar bed date', () => {
  assert.equal(bedAvailableCalendarDate('2026-02-28'), '2026-03-01');
});

test('bed not released before midnight IST on release day', () => {
  const releaseDay = bedAvailableCalendarDate('2026-08-15');
  assert.equal(releaseDay, '2026-08-16');
  const beforeMidnightIst = new Date('2026-08-15T18:29:00.000Z');
  const atMidnightIst = new Date('2026-08-15T18:30:00.000Z');
  assert.equal(isBedReleasedForVacating('2026-08-15', beforeMidnightIst), false);
  assert.equal(isBedReleasedForVacating('2026-08-15', atMidnightIst), true);
});

test('bed released on day after final stay at midnight calendar (date-only paths)', () => {
  const dayAfter = new Date('2026-08-17T00:00:00.000Z');
  assert.equal(isBedReleasedForVacating('2026-08-15', dayAfter), true);
});

test('same-day vacating approval shortens stay (final day inclusive)', () => {
  assert.equal(shouldShortenStayOnVacatingApproval('2026-06-13', '2026-06-13'), true);
  assert.equal(shouldShortenStayOnVacatingApproval('2026-06-12', '2026-06-13'), false);
  assert.equal(shouldShortenStayOnVacatingApproval('2026-06-14', '2026-06-13'), true);
});

test('canBookBedFromSnapshot blocks when bed not yet released', () => {
  const vacatingDate = '2026-08-15';
  const input = {
    bedStatus: 'available' as const,
    isOccupiedToday: false,
    vacatingDate,
    vacatingStatus: 'approved' as const,
    durationMode: 'monthly',
    stayType: 'monthly_stay',
    asOfDate: '2026-08-15',
  };
  const snap = computeBedOccupancySnapshot(input);
  assert.equal(snap.bookableFromDate, '2026-08-16');
  assert.equal(canBookBedFromSnapshot({ ...input, isAvailableNow: true }, snap), false);
});

test('canBookBedFromSnapshot allows after bed release calendar date', () => {
  const vacatingDate = '2025-07-15';
  const input = {
    bedStatus: 'available' as const,
    isOccupiedToday: false,
    vacatingDate,
    vacatingStatus: 'approved' as const,
    durationMode: 'monthly',
    stayType: 'monthly_stay',
    asOfDate: '2025-07-16',
  };
  const snap = computeBedOccupancySnapshot(input);
  assert.equal(canBookBedFromSnapshot({ ...input, isAvailableNow: true }, snap), true);
});

test('half-open stay_range ends day after final stay — no extra rent day for 11 AM checkout', () => {
  assert.equal(finalStayDate('2026-08-15'), '2026-08-15');
  assert.equal(stayRangeExclusiveEnd('2026-08-15'), '2026-08-16');
  assert.notEqual(stayRangeExclusiveEnd('2026-08-15'), '2026-08-17');
});

test('confirmation copy includes rent charge for selected final stay date', () => {
  const conf = buildVacatingDateConfirmation('2026-08-18');
  assert.match(conf.lines.join('\n'), /charged rent for 18 August 2026/);
  assert.match(conf.lines.join('\n'), /19 August 2026 at 12:00 AM/);
});

test('5-day notice validation unchanged — uses noticeGivenDate not bed release date', async () => {
  const { isNoticeCompliant, VACATING_NOTICE_MIN_DAYS } = await import('@/src/services/billing');
  const noticeGivenDate = '2026-08-01';
  assert.equal(VACATING_NOTICE_MIN_DAYS, 5);
  assert.equal(
    isNoticeCompliant({ noticeGivenDate, vacatingDate: '2026-08-06' }),
    true,
  );
  assert.equal(
    isNoticeCompliant({ noticeGivenDate, vacatingDate: '2026-08-05' }),
    false,
  );
});
