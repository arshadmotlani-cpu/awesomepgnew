import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { aggregateOccupancyCounts, resolveBedOccupancy } from '../../src/lib/bedOccupancyResolve';

describe('availabilityService SSOT mapping', () => {
  test('maintenance beds are excluded from open-now counts', () => {
    const available = resolveBedOccupancy({
      bedId: 'b1',
      bedStatus: 'available',
      isOccupiedToday: false,
    });
    const maintenance = resolveBedOccupancy({
      bedId: 'b2',
      bedStatus: 'maintenance',
      isOccupiedToday: false,
      maintenanceReason: 'electrical',
      maintenanceStartedAt: '2026-07-01',
    });
    const occupied = resolveBedOccupancy({
      bedId: 'b3',
      bedStatus: 'available',
      isOccupiedToday: true,
    });

    const counts = aggregateOccupancyCounts([available, maintenance, occupied]);
    assert.equal(counts.totalBeds, 3);
    assert.equal(counts.openNowBeds, 1);
    assert.equal(counts.maintenanceBeds, 1);
    assert.equal(counts.occupiedBeds, 1);
  });

  test('maintenance customer label is Under Maintenance', () => {
    const resolved = resolveBedOccupancy({
      bedId: 'b1',
      bedStatus: 'maintenance',
      isOccupiedToday: false,
      maintenanceReason: 'plumbing',
    });
    assert.equal(resolved.customerView.label, 'Under Maintenance');
    assert.equal(resolved.isBookable, false);
    assert.equal(resolved.isOpenNow, false);
  });
});
