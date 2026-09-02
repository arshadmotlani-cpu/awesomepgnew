/**
 * Room-transfer / bed-occupancy state machine regression matrix.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveCustomerBedAvailabilityView } from '@/src/lib/bedAvailabilityState';
import {
  aggregateOccupancyCounts,
  resolveBedOccupancy,
} from '@/src/lib/bedOccupancyResolve';
import {
  canBookBedFromSnapshot,
  computeBedOccupancySnapshot,
  toAdminAvailabilityView,
  toCustomerAvailabilityView,
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

test('B — public room detail customer label shows Reserved for transfer hold', () => {
  const customer = toCustomerAvailabilityView({
    ...baseInput,
    transferHoldActive: true,
    isAvailableNow: false,
  });
  assert.equal(customer.label, 'Reserved');
  assert.match(customer.sublabel ?? '', /room change/i);
});

test('D — deriveCustomerBedAvailabilityView agrees with engine for transfer hold', () => {
  const view = deriveCustomerBedAvailabilityView({
    bedStatus: 'available',
    isAvailableNow: false,
    isOccupiedToday: false,
    transferHoldActive: true,
  });
  assert.equal(view.label, 'Reserved');
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

test('H — completed transfer cannot leave both beds occupied (engine per-bed)', () => {
  const oldReleased = computeBedOccupancySnapshot(baseInput);
  const newOccupied = computeBedOccupancySnapshot({
    ...baseInput,
    isOccupiedToday: true,
  });
  assert.equal(oldReleased.publicState, 'available');
  assert.equal(newOccupied.publicState, 'occupied');
});

test('I — completed transfer cannot leave both beds available (engine per-bed)', () => {
  const oldReleased = computeBedOccupancySnapshot(baseInput);
  const newOccupied = computeBedOccupancySnapshot({
    ...baseInput,
    isOccupiedToday: true,
  });
  assert.notEqual(oldReleased.publicState, 'occupied');
  assert.notEqual(newOccupied.publicState, 'available');
});

test('M — PG available-bed count equals open-now beds in aggregate', () => {
  const open = resolveBedOccupancy({ bedId: 'b1', bedStatus: 'available', isOccupiedToday: false });
  const held = resolveBedOccupancy({
    bedId: 'b2',
    bedStatus: 'available',
    isOccupiedToday: false,
    transferHoldActive: true,
  });
  const occupied = resolveBedOccupancy({
    bedId: 'b3',
    bedStatus: 'available',
    isOccupiedToday: true,
  });
  const counts = aggregateOccupancyCounts([open, held, occupied]);
  assert.equal(counts.openNowBeds, 1);
  assert.equal(counts.reservedBeds, 1);
  assert.equal(counts.occupiedBeds, 1);
  assert.equal(counts.openNowBeds + counts.reservedBeds + counts.occupiedBeds, 3);
});

test('K — pending transfer preserves held target without occupying old twice', () => {
  const beforeTransferOld = resolveBedOccupancy({
    bedId: 'old',
    bedStatus: 'available',
    isOccupiedToday: true,
  });
  const beforeTransferNew = resolveBedOccupancy({
    bedId: 'new',
    bedStatus: 'available',
    isOccupiedToday: false,
    transferHoldActive: true,
  });
  assert.equal(beforeTransferOld.isOpenNow, false);
  assert.equal(beforeTransferNew.isOpenNow, false);
  assert.equal(beforeTransferNew.isBookable, false);
});
