/**
 * Room OS Wave 1 — PropertyProjector unit tests.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  aggregateElectricityProgress,
  aggregateKpiStrip,
  assemblePropertyOsIndex,
  countOccupiedBeds,
  formatRoomOccupancySummary,
  WORK_QUEUE_NOT_MATERIALIZED_HASH,
} from '@/src/roomOs/projectors/property/aggregatePropertyIndex';
import type {
  BedBrainSnapshot,
  BookingLedgerSnapshot,
  RoomOsSharedSnapshot,
} from '@/src/roomOs/types';
import type { PropertyInventory } from '@/src/roomOs/projectors/property/loadPropertyInventory';

const computedAt = '2026-08-01T00:00:00.000Z';

function bedBrain(partial: Partial<BedBrainSnapshot> & Pick<BedBrainSnapshot, 'bedId' | 'roomId'>): BedBrainSnapshot {
  return {
    pgId: 'pg-1',
    asOf: '2026-08-01',
    bookingContext: null,
    computedAt,
    snapshotVersion: 1,
    ...partial,
  };
}

function roomShared(partial: Partial<RoomOsSharedSnapshot> & Pick<RoomOsSharedSnapshot, 'roomId'>): RoomOsSharedSnapshot {
  return {
    pgId: 'pg-1',
    billingMonth: '2026-08-01',
    asOf: '2026-08-01',
    billingMode: 'monthly',
    meterReadingState: 'current',
    electricityStatus: 'complete',
    nextElectricityBillStatus: 'paid',
    computedAt,
    snapshotVersion: 2,
    derivationRefs: [],
    ...partial,
  };
}

function ledger(partial: Partial<BookingLedgerSnapshot> & Pick<BookingLedgerSnapshot, 'bookingId'>): BookingLedgerSnapshot {
  return {
    bookingCode: 'APG-1',
    pgId: 'pg-1',
    customerId: 'cust-1',
    asOf: '2026-08-01',
    rent: { requiredPaise: 0, receivedPaise: 0, outstandingPaise: 0, status: 'none' },
    electricity: { requiredPaise: 0, receivedPaise: 0, outstandingPaise: 0, status: 'none' },
    deposit: { requiredPaise: 0, receivedPaise: 0, outstandingPaise: 0, refundablePaise: 0, status: 'none' },
    totals: { requiredPaise: 0, receivedPaise: 0, outstandingPaise: 0 },
    paymentState: 'clear',
    computedAt,
    snapshotVersion: 1,
    derivationRefs: [],
    ...partial,
  };
}

const inventory: PropertyInventory = {
  pgId: 'pg-1',
  rooms: [
    { roomId: 'room-a', roomNumber: '101', bedIds: ['bed-1', 'bed-2'] },
    { roomId: 'room-b', roomNumber: '102', bedIds: ['bed-3'] },
  ],
};

describe('Room OS Wave 1 — PropertyProjector', () => {
  test('occupancy summary counts active and vacating beds', () => {
    const beds = [
      bedBrain({
        bedId: 'bed-1',
        roomId: 'room-a',
        bookingContext: {
          bookingId: 'b1',
          bedId: 'bed-1',
          pgId: 'pg-1',
          residencyStatus: 'active',
          derivationRefs: [],
        },
      }),
      bedBrain({
        bedId: 'bed-2',
        roomId: 'room-a',
        bookingContext: {
          bookingId: 'b2',
          bedId: 'bed-2',
          pgId: 'pg-1',
          residencyStatus: 'vacating',
          derivationRefs: [],
        },
      }),
      bedBrain({ bedId: 'bed-3', roomId: 'room-b' }),
    ];
    assert.equal(countOccupiedBeds(beds), 2);
    assert.equal(formatRoomOccupancySummary(beds.filter((b) => b.roomId === 'room-a')), '2/2 beds');
    assert.equal(formatRoomOccupancySummary(beds.filter((b) => b.roomId === 'room-b')), '0/1 beds');
  });

  test('electricity progress aggregates room shared statuses', () => {
    const progress = aggregateElectricityProgress([
      roomShared({ roomId: 'room-a', electricityStatus: 'complete' }),
      roomShared({ roomId: 'room-b', electricityStatus: 'blocked' }),
      roomShared({ roomId: 'room-c', electricityStatus: 'pending_collection' }),
    ]);
    assert.deepEqual(progress, { complete: 1, incomplete: 1, blocked: 1 });
  });

  test('kpi strip aggregates ledger, room shared, and bed brain fields', () => {
    const kpi = aggregateKpiStrip({
      pgId: 'pg-1',
      billingMonth: '2026-08-01',
      computedAt,
      ledgers: [
        ledger({ bookingId: 'b1', paymentState: 'proof_pending', rent: { requiredPaise: 1, receivedPaise: 0, outstandingPaise: 1, status: 'outstanding' } }),
        ledger({ bookingId: 'b2', rent: { requiredPaise: 1, receivedPaise: 0, outstandingPaise: 1, status: 'overdue' } }),
      ],
      roomShared: [
        roomShared({ roomId: 'room-a', electricityStatus: 'complete' }),
        roomShared({ roomId: 'room-b', electricityStatus: 'awaiting_bill' }),
      ],
      bedBrains: [
        bedBrain({
          bedId: 'bed-1',
          roomId: 'room-a',
          bookingContext: {
            bookingId: 'b1',
            bedId: 'bed-1',
            pgId: 'pg-1',
            residencyStatus: 'vacating',
            derivationRefs: [],
          },
        }),
      ],
    });
    assert.equal(kpi.proofsPending, 1);
    assert.equal(kpi.overdueRent, 1);
    assert.equal(kpi.rentDueToday, 1);
    assert.equal(kpi.electricityIncomplete, 1);
    assert.equal(kpi.moveOutsPending, 1);
  });

  test('assemblePropertyOsIndex is deterministic for identical inputs', () => {
    const input = {
      pgId: 'pg-1',
      billingMonth: '2026-08-01',
      asOf: '2026-08-01',
      computedAt,
      inventory,
      bedBrains: [
        bedBrain({
          bedId: 'bed-1',
          roomId: 'room-a',
          bookingContext: {
            bookingId: 'b1',
            bedId: 'bed-1',
            pgId: 'pg-1',
            residencyStatus: 'active',
            derivationRefs: [],
          },
        }),
        bedBrain({ bedId: 'bed-2', roomId: 'room-a' }),
        bedBrain({ bedId: 'bed-3', roomId: 'room-b' }),
      ],
      roomShared: [
        roomShared({ roomId: 'room-a', electricityStatus: 'complete' }),
        roomShared({ roomId: 'room-b', electricityStatus: 'blocked' }),
      ],
      ledgers: [
        ledger({
          bookingId: 'b1',
          paymentState: 'proof_pending',
          rent: { requiredPaise: 50_000, receivedPaise: 0, outstandingPaise: 50_000, status: 'outstanding' },
        }),
      ],
    };

    const first = assemblePropertyOsIndex(input);
    const second = assemblePropertyOsIndex(input);
    assert.deepEqual(first, second);
    assert.equal(first.roomIndex.length, 2);
    assert.equal(first.roomIndex[0]?.label, '101');
    assert.equal(first.roomIndex[0]?.occupancySummary, '1/2 beds');
    assert.equal(first.roomIndex[1]?.electricityStatus, 'blocked');
    assert.equal(first.workQueueSummary.contentHash, WORK_QUEUE_NOT_MATERIALIZED_HASH);
    assert.equal(first.workQueueSummary.totalItems, 0);
    assert.equal(first.electricityProgress.complete, 1);
    assert.equal(first.electricityProgress.blocked, 1);
    assert.equal(first.kpiStrip.proofsPending, 1);
  });
});
