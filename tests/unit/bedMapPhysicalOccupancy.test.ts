import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  canBookBedFromSnapshot,
  computeBedOccupancySnapshot,
  isPhysicallyOccupiedToday,
  toAdminAvailabilityView,
} from '@/src/lib/bedOccupancyEngine';
import {
  occupancyFactsForInventory,
  resolveBedOccupancy,
} from '@/src/lib/bedOccupancyResolve';

describe('bed map physical occupancy vs financial checkout', () => {
  test('isPhysicallyOccupiedToday follows active reservation only', () => {
    assert.equal(isPhysicallyOccupiedToday({ bedStatus: 'available', isOccupiedToday: true }), true);
    assert.equal(
      isPhysicallyOccupiedToday({ bedStatus: 'available', isOccupiedToday: false }),
      false,
    );
  });

  test('checkout settlement on vacant bed shows Open · book now on admin map', () => {
    const facts = {
      bedId: 'bed-b5',
      bedStatus: 'available' as const,
      isOccupiedToday: false,
      checkoutSettlement: {
        id: 'cs-sahil',
        status: 'awaiting_resident_details',
        depositHeldPaise: 15_000,
      },
      stayType: 'open_ended',
      durationMode: 'open_ended',
      occupantFirstName: 'Sahil',
    };
    const resolved = resolveBedOccupancy(facts);
    assert.equal(resolved.adminView.label, 'Open · book now');
    assert.equal(resolved.adminView.sublabel, undefined);
    assert.equal(resolved.isBookable, true);
    assert.equal(resolved.isOccupiedForKpi, false);
  });

  test('occupancyFactsForInventory strips stale checkout fields when vacant', () => {
    const stripped = occupancyFactsForInventory({
      bedId: 'bed-b4',
      bedStatus: 'available',
      isOccupiedToday: false,
      checkoutSettlement: { id: 'cs-1', status: 'refund_pending' },
      stayType: 'open_ended',
      durationMode: 'open_ended',
      vacatingDate: '2026-07-01',
      vacatingStatus: 'approved',
      occupantFirstName: 'Former',
    });
    assert.equal(stripped.checkoutSettlement, null);
    assert.equal(stripped.vacatingDate, undefined);
    assert.equal(stripped.occupantFirstName, undefined);
  });

  test('physically occupied bed with open settlement still shows resident name', () => {
    const input = {
      bedStatus: 'available' as const,
      isOccupiedToday: true,
      isAvailableNow: false,
      stayType: 'open_ended',
      durationMode: 'open_ended',
      occupantFirstName: 'Priya',
      checkoutSettlement: {
        id: 'cs-live',
        status: 'awaiting_admin_review',
        depositHeldPaise: 5000,
      },
    };
    const snap = computeBedOccupancySnapshot(input);
    assert.equal(snap.adminState, 'occupied');
    const view = toAdminAvailabilityView(input, snap);
    assert.equal(view.label, 'Priya');
    assert.doesNotMatch(view.sublabel ?? '', /checkout pending/i);
    assert.equal(canBookBedFromSnapshot(input, snap), false);
  });

  test('regression: checkout ends reservation, settlement open, new assignee unaffected', () => {
    const formerResidentBed = resolveBedOccupancy({
      bedId: 'bed-b5',
      bedStatus: 'available',
      isOccupiedToday: false,
      checkoutSettlement: {
        id: 'cs-former',
        status: 'awaiting_resident_details',
        depositHeldPaise: 10_000,
      },
      occupantFirstName: 'Former',
    });
    assert.equal(formerResidentBed.adminView.label, 'Open · book now');

    const afterReassign = resolveBedOccupancy({
      bedId: 'bed-b5',
      bedStatus: 'available',
      isOccupiedToday: true,
      isAvailableNow: false,
      occupantFirstName: 'New',
      stayType: 'open_ended',
      durationMode: 'open_ended',
      checkoutSettlement: {
        id: 'cs-former',
        status: 'awaiting_resident_details',
        depositHeldPaise: 10_000,
      },
    });
    assert.equal(afterReassign.adminView.label, 'New');
    assert.notEqual(afterReassign.adminView.sublabel ?? '', 'Checkout pending · open settlement');
  });
});
