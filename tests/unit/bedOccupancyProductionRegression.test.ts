import assert from 'node:assert/strict';
import test from 'node:test';
import {
  computeBedOccupancySnapshot,
  toCustomerAvailabilityView,
} from '../../src/lib/bedOccupancyEngine';

/**
 * Room 102 B1 regression — monthly occupant must not show "Available soon"
 * when the bed is occupied today (BOOKING-APPROVAL-OCCUPANCY / CRITICAL-BOOKING-AUTH).
 */
test('monthly occupied today shows Occupied on public browse, not Available soon', () => {
  const input = {
    bedStatus: 'available' as const,
    isOccupiedToday: true,
    isAvailableNow: false,
    stayType: 'open_ended',
    durationMode: 'open_ended',
    expectedCheckoutDate: null,
    stayUpper: '2027-08-01',
    nextAvailableDate: '2027-08-01',
  };
  const snap = computeBedOccupancySnapshot(input);
  const view = toCustomerAvailabilityView(input, snap);
  assert.equal(snap.publicState, 'occupied');
  assert.equal(view.kind, 'occupied');
  assert.equal(view.label, 'Occupied');
  assert.notEqual(view.label, 'Available soon');
});

test('vacant bed with future reservation shows reserved, not occupied', () => {
  const input = {
    bedStatus: 'available' as const,
    isOccupiedToday: false,
    isAvailableNow: true,
    activeBedReserveCheckIn: '2026-08-01',
    reservedFrom: '2026-08-01',
  };
  const snap = computeBedOccupancySnapshot(input);
  assert.equal(snap.publicState, 'reserved');
});
