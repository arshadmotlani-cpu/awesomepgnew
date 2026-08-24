/**
 * Public PG availability badge + customer date formatting (no year).
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  formatCustomerAvailableFrom,
  formatCustomerDayMonth,
  formatFutureOpeningPhrase,
  formatPublicAvailabilityBadge,
  isFutureAvailabilityBadge,
} from '@/src/lib/pgAvailabilityBadge';
import { resolveBedOccupancy, aggregateOccupancyCounts } from '@/src/lib/bedOccupancyResolve';
import { canBookBedFromSnapshot, computeBedOccupancySnapshot } from '@/src/lib/bedOccupancyEngine';
import { formatBedAvailableLabel } from '@/src/lib/vacating/vacatingBedSemantics';

describe('formatPublicAvailabilityBadge priority', () => {
  test('Case 1: all occupied, no future vacancy → fully occupied', () => {
    const label = formatPublicAvailabilityBadge({
      totalBeds: 3,
      openNowBeds: 0,
      occupiedBeds: 3,
      futureOpenings: [],
    });
    assert.equal(label, 'Fully occupied · no beds');
  });

  test('Case 2: all occupied, one approved move-out → available from date', () => {
    const label = formatPublicAvailabilityBadge({
      totalBeds: 3,
      openNowBeds: 0,
      occupiedBeds: 3,
      futureOpenings: [{ availableFromDate: '2026-08-25', bedCount: 1 }],
    });
    assert.equal(label, '1 bed available from 25 Aug');
    assert.ok(isFutureAvailabilityBadge({ openNowBeds: 0, futureOpenings: [{ availableFromDate: '2026-08-25', bedCount: 1 }] }));
    assert.doesNotMatch(label, /Fully occupied/i);
    assert.doesNotMatch(label, /2026/);
  });

  test('Case 3: one bed open now → available now', () => {
    const label = formatPublicAvailabilityBadge({
      totalBeds: 3,
      openNowBeds: 1,
      futureOpenings: [{ availableFromDate: '2026-08-25', bedCount: 1 }],
    });
    assert.equal(label, '1 of 3 beds free today');
  });

  test('Case 4: multiple future vacancies on different dates', () => {
    const label = formatPublicAvailabilityBadge({
      totalBeds: 3,
      openNowBeds: 0,
      futureOpenings: [
        { availableFromDate: '2026-08-25', bedCount: 1 },
        { availableFromDate: '2026-09-01', bedCount: 2 },
      ],
    });
    assert.equal(
      label,
      '1 bed available from 25 Aug · 2 beds available from 1 Sept',
    );
  });

  test('customer date helpers omit the year', () => {
    assert.equal(formatCustomerDayMonth('2026-08-25'), '25 Aug');
    assert.equal(formatCustomerAvailableFrom('2026-08-25'), '25 Aug · 12:00 AM');
    assert.equal(formatFutureOpeningPhrase({ availableFromDate: '2026-08-25', bedCount: 1 }), '1 bed available from 25 Aug');
    assert.doesNotMatch(formatBedAvailableLabel('2026-08-24'), /2026/);
    assert.match(formatBedAvailableLabel('2026-08-24'), /25 Aug · 12:00 AM/);
  });
});

describe('future openings from occupancy SSOT', () => {
  test('approved move-out aggregates as future opening, not open now', () => {
    const occupied = resolveBedOccupancy({
      bedId: 'b1',
      bedStatus: 'available',
      isOccupiedToday: true,
      asOfDate: '2026-08-20',
      stayType: 'monthly_stay',
      durationMode: 'monthly',
    });
    const vacating = resolveBedOccupancy({
      bedId: 'b2',
      bedStatus: 'available',
      isOccupiedToday: true,
      asOfDate: '2026-08-20',
      stayType: 'monthly_stay',
      durationMode: 'monthly',
      vacatingDate: '2026-08-24',
      vacatingStatus: 'approved',
    });
    const pending = resolveBedOccupancy({
      bedId: 'b3',
      bedStatus: 'available',
      isOccupiedToday: true,
      asOfDate: '2026-08-20',
      stayType: 'monthly_stay',
      durationMode: 'monthly',
      vacatingDate: '2026-08-24',
      vacatingStatus: 'pending',
    });

    assert.equal(occupied.isOpenNow, false);
    assert.equal(vacating.isOpenNow, false);
    assert.equal(vacating.snapshot.bookableFromDate, '2026-08-25');
    assert.equal(pending.snapshot.bookableFromDate, null);

    const counts = aggregateOccupancyCounts([occupied, vacating, pending]);
    assert.equal(counts.openNowBeds, 0);
    assert.deepEqual(counts.futureOpenings, [
      { availableFromDate: '2026-08-25', bedCount: 1 },
    ]);

    const badge = formatPublicAvailabilityBadge({
      totalBeds: counts.totalBeds,
      openNowBeds: counts.openNowBeds,
      occupiedBeds: counts.occupiedBeds,
      futureOpenings: counts.futureOpenings,
    });
    assert.equal(badge, '1 bed available from 25 Aug');
  });

  test('Case 5: pending move-out does not create confirmed future opening', () => {
    const pending = resolveBedOccupancy({
      bedId: 'b1',
      bedStatus: 'available',
      isOccupiedToday: true,
      asOfDate: '2026-08-20',
      stayType: 'monthly_stay',
      durationMode: 'monthly',
      vacatingDate: '2026-08-24',
      vacatingStatus: 'pending',
    });
    const counts = aggregateOccupancyCounts([pending]);
    assert.deepEqual(counts.futureOpenings, []);
    assert.equal(
      formatPublicAvailabilityBadge({
        totalBeds: 1,
        openNowBeds: 0,
        futureOpenings: counts.futureOpenings,
      }),
      'Fully occupied · no beds',
    );
  });

  test('Case 6/7: booking blocked before release day, allowed from release day', () => {
    const vacatingDate = '2026-08-24';
    const before = {
      bedStatus: 'available' as const,
      isOccupiedToday: true,
      vacatingDate,
      vacatingStatus: 'approved' as const,
      durationMode: 'monthly',
      stayType: 'monthly_stay',
      asOfDate: '2026-08-24',
    };
    const snapBefore = computeBedOccupancySnapshot(before);
    assert.equal(snapBefore.bookableFromDate, '2026-08-25');
    assert.equal(canBookBedFromSnapshot({ ...before, isAvailableNow: false }, snapBefore), false);

    const after = {
      bedStatus: 'available' as const,
      isOccupiedToday: false,
      vacatingDate,
      vacatingStatus: 'approved' as const,
      durationMode: 'monthly',
      stayType: 'monthly_stay',
      asOfDate: '2026-08-25',
      isAvailableNow: true,
    };
    const snapAfter = computeBedOccupancySnapshot(after);
    assert.equal(snapAfter.bookableFromDate, '2026-08-25');
    assert.equal(canBookBedFromSnapshot(after, snapAfter), true);
  });
});
