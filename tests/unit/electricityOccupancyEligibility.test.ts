import test from 'node:test';
import assert from 'node:assert/strict';
import { isMonthlyElectricityBillableOccupant } from '@/src/lib/billing/electricityOccupancyEligibility';

const activeConfirmed = {
  reservationStatus: 'active',
  bookingStatus: 'confirmed',
  residencyStatus: 'active',
  customerEmail: 'resident@example.com',
};

test('monthly electricity includes active confirmed residents', () => {
  assert.equal(isMonthlyElectricityBillableOccupant(activeConfirmed), true);
});

test('monthly electricity excludes completed reservations (checked-out stays)', () => {
  assert.equal(
    isMonthlyElectricityBillableOccupant({
      ...activeConfirmed,
      reservationStatus: 'completed',
    }),
    false,
  );
});

test('monthly electricity excludes completed bookings', () => {
  assert.equal(
    isMonthlyElectricityBillableOccupant({
      ...activeConfirmed,
      bookingStatus: 'completed',
    }),
    false,
  );
});

test('monthly electricity excludes vacated residency', () => {
  assert.equal(
    isMonthlyElectricityBillableOccupant({
      ...activeConfirmed,
      residencyStatus: 'vacated',
    }),
    false,
  );
});
