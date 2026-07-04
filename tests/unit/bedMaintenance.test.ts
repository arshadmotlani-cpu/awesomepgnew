import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canBookBedFromSnapshot,
  computeBedOccupancySnapshot,
  toAdminAvailabilityView,
  toCustomerAvailabilityView,
} from '../../src/lib/bedOccupancyEngine';
import { formatMaintenanceReason } from '../../src/lib/bedMaintenance';

test('maintenance bed is not occupied and not bookable', () => {
  const input = {
    bedStatus: 'maintenance' as const,
    isOccupiedToday: false,
    maintenanceReason: 'plumbing',
    maintenanceStartedAt: '2026-07-01',
    maintenanceExpectedCompletion: '2026-07-05',
  };
  const snap = computeBedOccupancySnapshot(input);
  assert.equal(snap.publicState, 'maintenance');
  assert.equal(snap.adminState, 'maintenance');
  assert.notEqual(snap.publicState, 'occupied');
  assert.equal(canBookBedFromSnapshot(input, snap), false);

  const admin = toAdminAvailabilityView(input, snap);
  assert.equal(admin.kind, 'maintenance');
  assert.equal(admin.label, 'Under Maintenance');
  assert.match(admin.sublabel ?? '', /Plumbing/);
  assert.match(admin.sublabel ?? '', /Since/);

  const customer = toCustomerAvailabilityView(input, snap);
  assert.equal(customer.kind, 'maintenance');
  assert.equal(customer.label, 'Under Maintenance');
});

test('formatMaintenanceReason resolves presets and custom other', () => {
  assert.equal(formatMaintenanceReason('electrical', null), 'Electrical');
  assert.equal(formatMaintenanceReason('other', 'Broken window'), 'Broken window');
});
