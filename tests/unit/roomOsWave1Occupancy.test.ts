/**
 * Room OS Wave 1 — Occupancy Engine unit tests.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { mapBedResidencyStatus } from '@/src/roomOs/engines/occupancy/buildBedBrain';

describe('Room OS Wave 1 — Occupancy', () => {
  test('residency mapping: vacant bed → none', () => {
    assert.equal(mapBedResidencyStatus({ isOccupiedForKpi: false, vacatingStatus: null }), 'none');
  });

  test('residency mapping: occupied → active', () => {
    assert.equal(mapBedResidencyStatus({ isOccupiedForKpi: true, vacatingStatus: null }), 'active');
  });

  test('residency mapping: vacating approved → vacating', () => {
    assert.equal(
      mapBedResidencyStatus({ isOccupiedForKpi: true, vacatingStatus: 'approved' }),
      'vacating',
    );
  });
});
