/**
 * Room-transfer / bed-occupancy state machine regression matrix.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canBookBedFromSnapshot,
  computeBedOccupancySnapshot,
  toAdminAvailabilityView,
} from '@/src/lib/bedOccupancyEngine';

const baseInput = {
  bedStatus: 'available' as const,
  isOccupiedToday: false,
  manualOccupied: false,
  isAvailableNow: true,
};

test('C — target bed with active transfer hold is not bookable', () => {
  const snap = computeBedOccupancySnapshot({
    ...baseInput,
    transferHoldActive: true,
  });
  assert.equal(snap.publicState, 'reserved');
  assert.equal(canBookBedFromSnapshot({ ...baseInput, transferHoldActive: true }, snap), false);
  const admin = toAdminAvailabilityView({ ...baseInput, transferHoldActive: true }, snap);
  assert.equal(admin.label, 'Held');
  assert.match(admin.sublabel ?? '', /room change/i);
});

test('A — active vacating/occupied bed stays occupied', () => {
  const snap = computeBedOccupancySnapshot({
    ...baseInput,
    isOccupiedToday: true,
    vacatingDate: '2026-09-15',
    vacatingStatus: 'approved',
  });
  assert.equal(snap.publicState, 'notice_period');
});

test('F — normal available bed without hold remains available', () => {
  const snap = computeBedOccupancySnapshot(baseInput);
  assert.equal(snap.publicState, 'available');
  assert.equal(canBookBedFromSnapshot(baseInput, snap), true);
});

test('P — transfer hold prevents NEW available + OLD occupied split on target', () => {
  const targetHeld = computeBedOccupancySnapshot({
    ...baseInput,
    transferHoldActive: true,
  });
  const oldOccupied = computeBedOccupancySnapshot({
    ...baseInput,
    isOccupiedToday: true,
    occupantFirstName: 'Resident',
  });
  assert.equal(targetHeld.publicState, 'reserved');
  assert.equal(oldOccupied.publicState, 'occupied');
  assert.notEqual(targetHeld.publicState, 'available');
});

test('E — idempotent restore: held bed without hold flag becomes available', () => {
  const held = computeBedOccupancySnapshot({ ...baseInput, transferHoldActive: true });
  const released = computeBedOccupancySnapshot(baseInput);
  assert.equal(held.publicState, 'reserved');
  assert.equal(released.publicState, 'available');
});

test('G — low-level invariant: occupied and available flags are mutually exclusive per bed snapshot', () => {
  const occupied = computeBedOccupancySnapshot({ ...baseInput, isOccupiedToday: true });
  assert.notEqual(occupied.publicState, 'available');
  const available = computeBedOccupancySnapshot(baseInput);
  assert.equal(available.publicState, 'available');
});
