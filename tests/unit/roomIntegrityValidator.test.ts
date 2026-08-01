import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateRoomIntegrity } from '@/src/lib/roomIntegrity/validateRoomIntegrity';
import type { RoomIntegritySnapshot } from '@/src/lib/roomIntegrity/types';
import { assertBedRemovalAllowed, assertCapacityReductionAllowed } from '@/src/lib/roomIntegrity/proposedChanges';

function snap(overrides: Partial<RoomIntegritySnapshot>): RoomIntegritySnapshot {
  return {
    roomId: 'r1',
    pgId: 'p1',
    pgName: 'Test PG',
    roomNumber: '101',
    roomTypeName: '4 Sharing',
    storedCapacity: 4,
    physicalBeds: 4,
    bookableBeds: 4,
    blockedBeds: 0,
    maintenanceBeds: 0,
    occupiedBeds: 2,
    ...overrides,
  };
}

describe('validateRoomIntegrity', () => {
  it('passes when capacity = physical = bookable and occupied fits', () => {
    assert.equal(validateRoomIntegrity(snap({})).length, 0);
  });

  it('flags capacity vs physical mismatch', () => {
    const issues = validateRoomIntegrity(snap({ storedCapacity: 5, physicalBeds: 4 }));
    assert.ok(issues.some((i) => i.code === 'capacity_physical_mismatch'));
  });

  it('allows blocked beds to reduce bookable count', () => {
    const issues = validateRoomIntegrity(
      snap({
        roomTypeName: '5 Sharing',
        storedCapacity: 5,
        physicalBeds: 5,
        bookableBeds: 4,
        blockedBeds: 1,
      }),
    );
    assert.equal(issues.length, 0);
  });

  it('flags occupied exceeding capacity', () => {
    const issues = validateRoomIntegrity(snap({ storedCapacity: 1, physicalBeds: 1, occupiedBeds: 2 }));
    assert.ok(issues.some((i) => i.code === 'occupied_exceeds_capacity'));
  });

  it('flags sharing label mismatch', () => {
    const issues = validateRoomIntegrity(snap({ roomTypeName: '5 Sharing', physicalBeds: 4, storedCapacity: 4 }));
    assert.ok(issues.some((i) => i.code === 'sharing_label_mismatch'));
  });
});

describe('assertCapacityReductionAllowed', () => {
  it('blocks reduction when occupied exceeds target', () => {
    assert.throws(
      () => assertCapacityReductionAllowed(5, 5, 4),
      /Cannot reduce room capacity/,
    );
  });
});

describe('assertBedRemovalAllowed', () => {
  it('blocks removal when occupied exceeds new physical count', () => {
    assert.throws(
      () =>
        assertBedRemovalAllowed(
          snap({ physicalBeds: 3, occupiedBeds: 3, bookableBeds: 3 }),
          'available',
        ),
      /Cannot remove bed/,
    );
  });
});
