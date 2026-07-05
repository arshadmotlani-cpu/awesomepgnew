import assert from 'node:assert/strict';
import test from 'node:test';
import { computeReservePricing, calendarDaysInMonth } from '../../src/lib/pricing/reservePricing';
import { reserveFeePaise } from '../../src/lib/bedReservePolicy';

test('calendarDaysInMonth uses actual month length', () => {
  assert.equal(calendarDaysInMonth('2026-02-01'), 28);
  assert.equal(calendarDaysInMonth('2024-02-01'), 29);
  assert.equal(calendarDaysInMonth('2026-04-01'), 30);
  assert.equal(calendarDaysInMonth('2026-07-01'), 31);
});

test('reserve pricing — ₹9,000 monthly, 10 days in 30-day month', () => {
  const q = computeReservePricing({
    monthlyRentPaise: 900_000,
    reserveStart: '2026-06-01',
    reservedDays: 10,
  });
  assert.equal(q.daysInMonth, 30);
  assert.equal(q.dailyRentPaise, 30_000);
  assert.equal(q.fullReservationPaise, 300_000);
  assert.equal(q.feePaise, 150_000);
  assert.equal(q.savingsPaise, 150_000);
});

test('reserve pricing — ₹7,500 monthly, 5 days in 30-day month', () => {
  const q = computeReservePricing({
    monthlyRentPaise: 750_000,
    reserveStart: '2026-06-01',
    reservedDays: 5,
  });
  assert.equal(q.dailyRentPaise, 25_000);
  assert.equal(q.fullReservationPaise, 125_000);
  assert.equal(q.feePaise, 62_500);
});

test('reserveFeePaise is half of full reservation amount', () => {
  assert.equal(reserveFeePaise(300_000), 150_000);
  assert.equal(reserveFeePaise(125_000), 62_500);
});
