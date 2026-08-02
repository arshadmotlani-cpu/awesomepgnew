/**
 * Room OS Wave 2 — Operations Centre parity audit tests.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { OpsQueueFilter } from '@/src/lib/operations/operationsFilterLinks';
import {
  bookingIdsForFilter,
  compareBookingIdSets,
  compareOperationsQueueItems,
  filterCount,
} from '@/src/roomOs/acceptance/operationsParityAudit';
import type { UnifiedOpsItem } from '@/src/services/unifiedOperationsQueue';

function item(filter: OpsQueueFilter, bookingId?: string, id?: string): UnifiedOpsItem {
  return {
    id: id ?? `${filter}-${bookingId ?? 'x'}`,
    queue: filter,
    residentName: 'Resident',
    pgName: 'PG',
    roomNumber: '101',
    bedCode: 'B1',
    reason: 'Test',
    openHref: '/admin',
    openLabel: 'Open',
    bookingId: bookingId ?? null,
  };
}

describe('Room OS Wave 2 — Operations parity audit', () => {
  test('shared tabs must match exactly; migrated tabs are informational', () => {
    const legacy = [
      item('waiting_for_approval', 'b1', 'a1'),
      item('rent_due', 'b2', 'rent-legacy-b2'),
      item('kyc_review', 'b3', 'kyc-b3'),
    ];
    const roomOs = [
      item('waiting_for_approval', 'b1', 'a1'),
      item('rent_due', 'b9', 'rent-os-b9'),
      item('kyc_review', 'b3', 'kyc-b3'),
    ];

    const rows = compareOperationsQueueItems(legacy, roomOs);
    const waiting = rows.find((r) => r.filter === 'waiting_for_approval');
    const rent = rows.find((r) => r.filter === 'rent_due');
    const kyc = rows.find((r) => r.filter === 'kyc_review');

    assert.equal(waiting?.matches, true);
    assert.equal(kyc?.matches, true);
    assert.equal(rent?.informational, true);
    assert.equal(rent?.matches, true);
    assert.deepEqual(rent?.bookingIdDelta, ['b2']);
  });

  test('bookingIdsForFilter dedupes and sorts', () => {
    const items = [item('rent_due', 'b2'), item('rent_due', 'b1'), item('rent_due', 'b2')];
    assert.deepEqual(bookingIdsForFilter(items, 'rent_due'), ['b1', 'b2']);
    assert.equal(filterCount(items, 'rent_due'), 3);
  });

  test('compareBookingIdSets finds legacy-only bookings', () => {
    assert.deepEqual(compareBookingIdSets(['a', 'b'], ['b', 'c']), ['a']);
  });
});
