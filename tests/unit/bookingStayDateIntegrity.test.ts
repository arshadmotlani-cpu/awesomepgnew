import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveBookingStayDates } from '../../src/services/bookingStayDateIntegrity';

test('resolveBookingStayDates uses stay_range lower when present', () => {
  const resolved = resolveBookingStayDates({
    stayRangeLower: '2026-06-01',
    stayRangeUpper: '2026-07-01',
    stayRangeRaw: '[2026-06-01,2026-07-01)',
    expectedCheckoutDate: '2026-07-01',
    durationMode: 'fixed_stay',
    bookingCreatedAt: new Date('2026-05-20T00:00:00.000Z'),
    reservationCreatedAt: new Date('2026-05-20T00:00:00.000Z'),
  });
  assert.ok(resolved);
  assert.equal(resolved.checkIn, '2026-06-01');
  assert.equal(resolved.checkOut, '2026-07-01');
  assert.equal(resolved.checkInSource, 'stay_range_lower');
});

test('resolveBookingStayDates repairs checkout without check-in using booking created date', () => {
  const resolved = resolveBookingStayDates({
    stayRangeLower: null,
    stayRangeUpper: '2026-07-01',
    stayRangeRaw: '(,2026-07-01)',
    expectedCheckoutDate: '2026-07-01',
    durationMode: 'weekly',
    bookingCreatedAt: new Date('2026-06-01T00:00:00.000Z'),
    reservationCreatedAt: new Date('2026-06-02T00:00:00.000Z'),
  });
  assert.ok(resolved);
  assert.equal(resolved.checkIn, '2026-06-01');
  assert.equal(resolved.checkOut, '2026-07-01');
  assert.equal(resolved.checkInSource, 'booking_created_at');
});

test('resolveBookingStayDates uses open-ended end for monthly stays', () => {
  const resolved = resolveBookingStayDates({
    stayRangeLower: null,
    stayRangeUpper: null,
    stayRangeRaw: '[,)',
    expectedCheckoutDate: null,
    durationMode: 'open_ended',
    bookingCreatedAt: new Date('2026-06-10T00:00:00.000Z'),
    reservationCreatedAt: null,
  });
  assert.ok(resolved);
  assert.equal(resolved.checkIn, '2026-06-10');
  assert.equal(resolved.checkOut, '2099-01-01');
  assert.equal(resolved.checkOutSource, 'open_ended_default');
});

test('resolveBookingStayDates parses check-in from raw stay_range text', () => {
  const resolved = resolveBookingStayDates({
    stayRangeLower: null,
    stayRangeUpper: null,
    stayRangeRaw: '["2026-05-15",2026-06-15)',
    expectedCheckoutDate: '2026-06-15',
    durationMode: 'daily',
    bookingCreatedAt: new Date('2026-05-01T00:00:00.000Z'),
    reservationCreatedAt: null,
  });
  assert.ok(resolved);
  assert.equal(resolved.checkIn, '2026-05-15');
  assert.equal(resolved.checkInSource, 'stay_range_raw');
});
