/**
 * Room OS Wave 1 — WorkQueueProjector unit tests.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import {
  assemblePropertyOsIndex,
  WORK_QUEUE_NOT_MATERIALIZED_HASH,
} from '@/src/roomOs/projectors/property/aggregatePropertyIndex';
import {
  assembleWorkQueueSnapshot,
  buildWorkQueueItemsFromPropertyIndex,
  computeWorkQueueContentHash,
  sortWorkQueueItems,
  summarizeWorkQueueSnapshot,
  WORK_QUEUE_BUCKET_ORDER,
} from '@/src/roomOs/projectors/workQueue/aggregateWorkQueue';
import { projectWorkQueueSnapshot } from '@/src/roomOs/projectors/workQueue/projectWorkQueue';
import type {
  BedBrainSnapshot,
  BookingLedgerSnapshot,
  PropertyOsIndexSnapshot,
  RoomOsSharedSnapshot,
} from '@/src/roomOs/types';
import type { PropertyInventory } from '@/src/roomOs/projectors/property/loadPropertyInventory';

const computedAt = '2026-08-01T00:00:00.000Z';

function propertyIndex(): PropertyOsIndexSnapshot {
  return {
    pgId: 'pg-1',
    billingMonth: '2026-08-01',
    asOf: '2026-08-01',
    kpiStrip: {
      pgId: 'pg-1',
      billingMonth: '2026-08-01',
      proofsPending: 1,
      overdueRent: 1,
      rentDueToday: 1,
      electricityIncomplete: 1,
      moveOutsPending: 1,
      computedAt,
    },
    workQueueSummary: {
      totalItems: 0,
      bucketCounts: {},
      contentHash: WORK_QUEUE_NOT_MATERIALIZED_HASH,
      computedAt,
    },
    workQueueProjection: { bookings: [], vacatingBeds: [] },
    roomIndex: [],
    electricityProgress: { complete: 0, incomplete: 0, blocked: 0 },
    computedAt,
    snapshotVersion: 1,
  };
}

describe('Room OS Wave 1 — WorkQueueProjector', () => {
  test('architecture: work queue projector does not import engines or SSOT services', () => {
    const files = [
      'src/roomOs/projectors/workQueue/aggregateWorkQueue.ts',
      'src/roomOs/projectors/workQueue/projectWorkQueue.ts',
    ];
    for (const file of files) {
      const src = readFileSync(join(process.cwd(), file), 'utf8');
      assert.doesNotMatch(src, /from ['"]@\/src\/roomOs\/engines\//);
      assert.doesNotMatch(src, /from ['"]@\/src\/services\//);
      assert.doesNotMatch(src, /from ['"]@\/src\/db\/client['"]/);
      assert.doesNotMatch(src, /residentFinancialEngine/);
      assert.doesNotMatch(src, /occupancySsot/);
    }
  });

  test('queue categorization maps property index fields to buckets', () => {
    const index: PropertyOsIndexSnapshot = {
      ...propertyIndex(),
      workQueueProjection: {
        bookings: [
          {
            bookingId: 'b-proof',
            bookingCode: 'APG-001',
            paymentState: 'proof_pending',
            paymentStateReason: 'payment_proof_awaiting_review',
            rentStatus: 'none',
          },
          {
            bookingId: 'b-overdue',
            bookingCode: 'APG-002',
            paymentState: 'clear',
            rentStatus: 'overdue',
          },
        ],
        vacatingBeds: [
          { bedId: 'bed-1', roomId: 'room-a', bookingId: 'b-move' },
        ],
      },
      roomIndex: [
        {
          roomId: 'room-a',
          label: '101',
          occupancySummary: '1/2 beds',
          electricityStatus: 'awaiting_bill',
          electricityStatusReason: 'no_bill',
        },
      ],
    };

    const items = buildWorkQueueItemsFromPropertyIndex(index);
    const buckets = new Set(items.map((item) => item.bucket));
    assert.ok(buckets.has('proofs'));
    assert.ok(buckets.has('overdue_rent'));
    assert.ok(buckets.has('electricity'));
    assert.ok(buckets.has('move_out'));
    assert.equal(items.find((item) => item.bucket === 'proofs')?.reasonCode, 'payment_proof_awaiting_review');
  });

  test('ordering is stable by bucket order then id', () => {
    const index: PropertyOsIndexSnapshot = {
      ...propertyIndex(),
      workQueueProjection: {
        bookings: [
          {
            bookingId: 'b-z',
            bookingCode: 'APG-Z',
            paymentState: 'proof_pending',
            rentStatus: 'overdue',
          },
          {
            bookingId: 'b-a',
            bookingCode: 'APG-A',
            paymentState: 'proof_pending',
            rentStatus: 'none',
          },
        ],
        vacatingBeds: [],
      },
      roomIndex: [],
    };

    const sorted = sortWorkQueueItems(buildWorkQueueItemsFromPropertyIndex(index));
    assert.equal(sorted[0]?.bucket, 'proofs');
    assert.equal(sorted[0]?.bookingId, 'b-a');
    assert.equal(sorted[1]?.bookingId, 'b-z');
    assert.deepEqual(WORK_QUEUE_BUCKET_ORDER, [
      'proofs',
      'overdue_rent',
      'rent_today',
      'electricity',
      'move_out',
      'day_close',
    ]);
  });

  test('content hash is stable for identical queue items', () => {
    const index: PropertyOsIndexSnapshot = {
      ...propertyIndex(),
      workQueueProjection: {
        bookings: [
          {
            bookingId: 'b1',
            bookingCode: 'APG-1',
            paymentState: 'proof_pending',
            rentStatus: 'none',
          },
        ],
        vacatingBeds: [],
      },
      roomIndex: [],
    };
    const items = sortWorkQueueItems(buildWorkQueueItemsFromPropertyIndex(index));
    assert.equal(computeWorkQueueContentHash(items), computeWorkQueueContentHash(items));
  });

  test('assembleWorkQueueSnapshot is idempotent for identical inputs', () => {
    const input = { propertyIndex: propertyIndex(), computedAt };
    assert.deepEqual(assembleWorkQueueSnapshot(input), assembleWorkQueueSnapshot(input));
  });

  test('projectWorkQueueSnapshot summary aligns with property index KPI counts', () => {
    const inventory: PropertyInventory = { pgId: 'pg-1', rooms: [] };
    const ledgers: BookingLedgerSnapshot[] = [
      {
        bookingId: 'b1',
        bookingCode: 'APG-1',
        pgId: 'pg-1',
        customerId: 'c1',
        asOf: '2026-08-01',
        rent: { requiredPaise: 1, receivedPaise: 0, outstandingPaise: 1, status: 'outstanding' },
        electricity: { requiredPaise: 0, receivedPaise: 0, outstandingPaise: 0, status: 'none' },
        deposit: { requiredPaise: 0, receivedPaise: 0, outstandingPaise: 0, refundablePaise: 0, status: 'none' },
        totals: { requiredPaise: 1, receivedPaise: 0, outstandingPaise: 1 },
        paymentState: 'clear',
        computedAt,
        snapshotVersion: 1,
        derivationRefs: [],
      },
    ];
    const propertyIndexBase = assemblePropertyOsIndex({
      pgId: 'pg-1',
      billingMonth: '2026-08-01',
      asOf: '2026-08-01',
      computedAt,
      inventory,
      bedBrains: [] as BedBrainSnapshot[],
      roomShared: [] as RoomOsSharedSnapshot[],
      ledgers,
    });
    const workQueue = projectWorkQueueSnapshot({
      propertyIndex: propertyIndexBase,
      computedAt,
    });
    const summary = summarizeWorkQueueSnapshot(workQueue);
    assert.equal(summary.totalItems, 1);
    assert.equal(summary.bucketCounts.rent_today, 1);
    assert.notEqual(summary.contentHash, WORK_QUEUE_NOT_MATERIALIZED_HASH);
  });
});
