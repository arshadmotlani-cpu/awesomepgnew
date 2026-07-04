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

  test('occupancyFactsForInventory strips stale vacating fields when vacant', () => {
    const stripped = occupancyFactsForInventory({
      bedId: 'bed-b4',
      bedStatus: 'available',
      isOccupiedToday: false,
      stayType: 'open_ended',
      durationMode: 'open_ended',
      vacatingDate: '2026-07-01',
      vacatingStatus: 'approved',
      occupantFirstName: 'Former',
    });
    assert.equal(stripped.vacatingDate, undefined);
    assert.equal(stripped.occupantFirstName, undefined);
  });

  test('physically occupied bed still shows resident name without settlement copy', () => {
    const input = {
      bedStatus: 'available' as const,
      isOccupiedToday: true,
      isAvailableNow: false,
      stayType: 'open_ended',
      durationMode: 'open_ended',
      occupantFirstName: 'Priya',
    };
    const snap = computeBedOccupancySnapshot(input);
    assert.equal(snap.adminState, 'occupied');
    const view = toAdminAvailabilityView(input, snap);
    assert.equal(view.label, 'Priya');
    assert.doesNotMatch(view.sublabel ?? '', /checkout pending/i);
    assert.equal(canBookBedFromSnapshot(input, snap), false);
  });

  test('regression: former resident vacated, new assignee unaffected', () => {
    const formerResidentBed = resolveBedOccupancy({
      bedId: 'bed-b5',
      bedStatus: 'available',
      isOccupiedToday: false,
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
    });
    assert.equal(afterReassign.adminView.label, 'New');
    assert.doesNotMatch(afterReassign.adminView.sublabel ?? '', /settlement/i);
  });
});
