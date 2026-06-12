import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveCustomerBedAvailabilityView } from '../../src/lib/bedAvailabilityState';
import {
  RESERVE_CLEANING_BUFFER_DAYS,
  RESERVE_FEE_PERCENT,
  reserveBufferDate,
  reserveFeePaise,
  reserveShortStayEndExclusive,
} from '../../src/lib/bedReservePolicy';

test('charges 50% of monthly rent', () => {
  assert.equal(reserveFeePaise(408_000), 204_000);
  assert.equal(RESERVE_FEE_PERCENT, 50);
});

test('sets cleaning buffer one day before check-in', () => {
  assert.equal(RESERVE_CLEANING_BUFFER_DAYS, 1);
  assert.equal(reserveBufferDate('2026-06-21'), '2026-06-20');
});

test('caps short stays at check-in (exclusive end)', () => {
  assert.equal(reserveShortStayEndExclusive('2026-06-21'), '2026-06-21');
});

test('active bed reserve shows Reserved on customer map', () => {
  const view = deriveCustomerBedAvailabilityView({
    bedStatus: 'available',
    isAvailableNow: true,
    activeBedReserveCheckIn: '2026-06-21',
  });
  assert.equal(view.kind, 'reserved');
  assert.match(view.sublabel ?? '', /Short stays until/i);
});
