import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveBedOccupancy } from '../../src/lib/bedOccupancyResolve';

test('admin and customer views agree on maintenance bed', () => {
  const resolved = resolveBedOccupancy({
    bedId: 'bed-1',
    bedStatus: 'maintenance',
    isOccupiedToday: false,
    maintenanceReason: 'plumbing',
  });
  assert.equal(resolved.snapshot.publicState, 'maintenance');
  assert.equal(resolved.adminView.kind, resolved.customerView.kind);
});

test('manual occupied aligns KPI and customer occupied label', () => {
  const resolved = resolveBedOccupancy({
    bedId: 'bed-2',
    bedStatus: 'available',
    isOccupiedToday: false,
    manualOccupied: true,
  });
  assert.equal(resolved.isOccupiedForKpi, true);
  assert.equal(resolved.customerView.kind, 'occupied');
});
