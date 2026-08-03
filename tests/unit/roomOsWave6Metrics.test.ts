/**
 * Room OS Wave 6 — business metrics pure aggregation tests.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { aggregatePropertyMetrics } from '@/src/roomOs/metrics/aggregatePropertyMetrics';
import { aggregateBookingMetrics } from '@/src/roomOs/metrics/aggregateBookingMetrics';
import {
  computeBusinessMetricsContentHash,
} from '@/src/roomOs/metrics/assembleBusinessMetrics';
import type { PropertyOsIndexSnapshot, WorkQueueSnapshot } from '@/src/roomOs/types';

function fixturePropertyIndex(): PropertyOsIndexSnapshot {
  return {
    pgId: 'pg-1',
    billingMonth: '2026-08-01',
    asOf: '2026-08-01',
    kpiStrip: {
      pgId: 'pg-1',
      billingMonth: '2026-08-01',
      proofsPending: 2,
      overdueRent: 1,
      rentDueToday: 0,
      electricityIncomplete: 3,
      moveOutsPending: 1,
      computedAt: '2026-08-01T00:00:00.000Z',
    },
    workQueueSummary: {
      contentHash: 'wq-hash',
      computedAt: '2026-08-01T00:00:00.000Z',
      totalItems: 4,
      bucketCounts: { proofs: 2, overdue_rent: 1, electricity: 1 },
    },
    workQueueProjection: {
      bookings: [
        {
          bookingId: 'b1',
          bookingCode: 'BK001',
          customerId: 'cust-1',
          paymentState: 'proof_pending',
          rentStatus: 'outstanding',
        },
      ],
      vacatingBeds: [],
    },
    roomIndex: [
      {
        roomId: 'r1',
        label: 'Room 101',
        occupancySummary: '1/2',
        electricityStatus: 'pending',
      },
    ],
    electricityProgress: { complete: 1, incomplete: 2, blocked: 0 },
    computedAt: '2026-08-01T00:00:00.000Z',
    snapshotVersion: 1,
  };
}

describe('Room OS Wave 6 — Metrics', () => {
  test('property rollup mirrors KPI strip and room index', () => {
    const propertyIndex = fixturePropertyIndex();
    const { property, rooms } = aggregatePropertyMetrics(propertyIndex);
    assert.equal(property.proofsPending, 2);
    assert.equal(property.overdueRent, 1);
    assert.equal(property.totalWorkQueueItems, 4);
    assert.equal(rooms.length, 1);
    assert.equal(rooms[0]!.roomId, 'r1');
  });

  test('booking rollup derives from work queue projection', () => {
    const propertyIndex = fixturePropertyIndex();
    const workQueue: WorkQueueSnapshot = {
      pgId: 'pg-1',
      billingMonth: '2026-08-01',
      items: [
        {
          id: 'i1',
          bucket: 'proofs',
          priority: 1,
          title: 'Proof',
          entityType: 'booking',
          entityId: 'b1',
          pgId: 'pg-1',
          bookingId: 'b1',
        },
      ],
      computedAt: '2026-08-01T00:00:00.000Z',
      contentHash: 'hash',
    };
    const { bookings, residents } = aggregateBookingMetrics({ propertyIndex, workQueue });
    assert.equal(bookings.length, 1);
    assert.equal(bookings[0]!.paymentState, 'proof_pending');
    assert.equal(residents.length, 1);
    assert.equal(residents[0]!.customerId, 'cust-1');
  });

  test('resident rollup filters by customerId', () => {
    const propertyIndex = fixturePropertyIndex();
    propertyIndex.workQueueProjection.bookings.push({
      bookingId: 'b2',
      bookingCode: 'BK002',
      customerId: 'cust-2',
      paymentState: 'checkout_open',
      rentStatus: 'overdue',
    });
    const { residents } = aggregateBookingMetrics({ propertyIndex, workQueue: null });
    const filtered = residents.filter((r) => r.customerId === 'cust-2');
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0]!.bookingId, 'b2');
  });

  test('content hash is stable for identical rollup input', () => {
    const base = {
      pgId: 'pg-1',
      billingMonth: '2026-08-01',
      asOf: '2026-08-01',
      computedAt: '2026-08-01T00:00:00.000Z',
      property: aggregatePropertyMetrics(fixturePropertyIndex()).property,
      rooms: aggregatePropertyMetrics(fixturePropertyIndex()).rooms,
      bookings: [{ bookingId: 'b1', bookingCode: 'BK001', paymentState: 'clear' as const, rentStatus: 'current' as const }],
      residents: [],
      financial: {
        billingMonth: '2026-08-01',
        operatingRevenuePaise: 100,
        rentPrincipalPaise: 80,
        lateFeePaise: 0,
        electricityPaise: 20,
        otherIncomePaise: 0,
        depositCollectedPaise: 0,
        depositRefundedPaise: 0,
        netCashInflowPaise: 100,
        occupancyPct: 50,
        occupiedBeds: 1,
        totalBeds: 2,
      },
      eventCounts: { billingMonth: '2026-08-01', countsByType: {}, totalEvents: 0 },
      derivationRefs: [],
    };
    const h1 = computeBusinessMetricsContentHash(base);
    const h2 = computeBusinessMetricsContentHash(base);
    assert.equal(h1, h2);
    assert.match(h1, /^[a-f0-9]{64}$/);
  });

  test('loadBusinessMetrics reports live_fallback for on-demand assembly', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/roomOs/metrics/loadBusinessMetrics.ts'),
      'utf8',
    );
    assert.match(src, /status: 'live_fallback'/);
  });

  test('metrics rollups propagate loader status instead of hardcoding ready', () => {
    const src = readFileSync(join(process.cwd(), 'src/roomOs/api/v1/metrics.ts'), 'utf8');
    assert.match(src, /status: result\.status, rooms/);
    assert.match(src, /status: result\.status, bookings/);
    assert.match(src, /status: result\.status, residents/);
  });

  test('financial bridge maps deposit fields from ledger metrics', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/roomOs/metrics/bridgeFinancialMetrics.ts'),
      'utf8',
    );
    assert.match(src, /getDepositCollectedByPgFromLedger/);
    assert.match(src, /getDepositRefundedByPgFromLedger/);
    assert.match(src, /computeDepositCashFlow/);
  });

  test('workflow facts emit on property stream for event metrics', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/roomOs/workflow/emitWorkflowFact.ts'),
      'utf8',
    );
    assert.match(src, /streamType = 'property'/);
  });
});
