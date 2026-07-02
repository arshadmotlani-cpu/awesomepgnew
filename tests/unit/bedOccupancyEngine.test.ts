import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canBookBedFromSnapshot,
  computeBedOccupancySnapshot,
  isCheckoutPending,
  resolveBookableFromDate,
  toCustomerAvailabilityView,
} from '../../src/lib/bedOccupancyEngine';

test('monthly occupied ignores billing stay_upper for bookable date', () => {
  const input = {
    bedStatus: 'available' as const,
    isOccupiedToday: true,
    isAvailableNow: false,
    stayType: 'open_ended',
    durationMode: 'open_ended',
    stayUpper: '2027-08-01',
    expectedCheckoutDate: null,
  };
  const snap = computeBedOccupancySnapshot(input);
  assert.equal(snap.publicState, 'occupied');
  assert.equal(snap.bookableFromDate, null);
  const view = toCustomerAvailabilityView(input, snap);
  assert.equal(view.kind, 'occupied');
  assert.equal(view.label, 'Occupied');
  assert.equal(view.sublabel, undefined);
});

test('fixed occupied shows available from checkout plus turnover buffer', () => {
  const input = {
    bedStatus: 'available' as const,
    isOccupiedToday: true,
    isAvailableNow: false,
    stayType: 'fixed_date_stay',
    durationMode: 'fixed_stay',
    expectedCheckoutDate: '2026-06-30',
    stayUpper: '2026-06-30',
  };
  const snap = computeBedOccupancySnapshot(input);
  assert.equal(snap.publicState, 'occupied');
  assert.equal(snap.bookableFromDate, '2026-07-01');
  const view = toCustomerAvailabilityView(input, snap);
  assert.match(view.sublabel ?? '', /1 July 2026/);
});

test('fixed post-checkout without settlement becomes available after buffer', () => {
  const input = {
    bedStatus: 'available' as const,
    isOccupiedToday: false,
    isAvailableNow: true,
    stayType: 'fixed_date_stay',
    durationMode: 'fixed_stay',
    expectedCheckoutDate: '2026-06-30',
    stayUpper: '2026-06-30',
  };
  const snap = computeBedOccupancySnapshot(input);
  assert.equal(snap.publicState, 'available');
  assert.equal(snap.bookableFromDate, '2026-07-01');
  assert.equal(canBookBedFromSnapshot(input, snap), true);
});

test('monthly checkout pending blocks booking even when bed is empty', () => {
  const input = {
    bedStatus: 'available' as const,
    isOccupiedToday: false,
    isAvailableNow: false,
    stayType: 'open_ended',
    durationMode: 'open_ended',
    checkoutSettlement: {
      id: 'cs-1',
      status: 'awaiting_admin_review',
      depositHeldPaise: 5000,
    },
  };
  assert.equal(isCheckoutPending(input), true);
  const snap = computeBedOccupancySnapshot(input);
  assert.equal(snap.adminState, 'checkout_pending');
  assert.equal(snap.publicState, 'occupied');
  assert.equal(canBookBedFromSnapshot(input, snap), false);
});

test('fixed checkout pending only when settlement workflow exists', () => {
  const suppressed = {
    bedStatus: 'available' as const,
    isOccupiedToday: false,
    isAvailableNow: true,
    stayType: 'fixed_date_stay',
    durationMode: 'fixed_stay',
    expectedCheckoutDate: '2026-06-30',
    stayUpper: '2026-06-30',
    checkoutSettlement: {
      id: 'cs-2',
      status: 'awaiting_resident_details',
      suppressed: true,
    },
  };
  assert.equal(isCheckoutPending(suppressed), false);
  const snap = computeBedOccupancySnapshot(suppressed);
  assert.equal(snap.adminState, 'available');

  const withDeposit = {
    ...suppressed,
    checkoutSettlement: {
      id: 'cs-3',
      status: 'refund_pending',
      depositHeldPaise: 1000,
    },
  };
  assert.equal(isCheckoutPending(withDeposit), true);
  assert.equal(computeBedOccupancySnapshot(withDeposit).adminState, 'checkout_pending');
});

test('monthly notice approved pre-books from vacating date plus buffer', () => {
  const input = {
    bedStatus: 'available' as const,
    isOccupiedToday: true,
    isAvailableNow: false,
    stayType: 'open_ended',
    durationMode: 'open_ended',
    vacatingDate: '2026-08-01',
    vacatingStatus: 'approved' as const,
  };
  assert.equal(resolveBookableFromDate(input), '2026-08-02');
});
