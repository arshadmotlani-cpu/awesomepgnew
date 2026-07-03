import assert from 'node:assert/strict';
import test from 'node:test';
import { buildMoveOutPipeline } from '@/src/lib/moveOut/moveOutPipeline';
import {
  assertOperationsQueueParity,
  buildOperationsQueueFilterCounts,
  countOperationsQueueItems,
  dedupeOperationsQueueItems,
  filterOperationsQueueItems,
} from '@/src/lib/operations/operationsQueueDefinition';
import {
  mapVacatingPipelineItemToOpsItem,
  vacatingOperationsQueueTarget,
} from '@/src/lib/operations/operationsQueueVacating';
import type { UnifiedOpsItem } from '@/src/services/unifiedOperationsQueue';
import { buildMoveOutCommandStats } from '@/src/lib/moveOut/moveOutPipelineUi';
import { toClientMoveOutPipelineItem } from '@/src/lib/moveOut/moveOutPipeline';

const baseVacating = {
  bookingId: 'bk-1',
  bookingCode: 'APG-1',
  customerId: 'cust-1',
  customerFullName: 'Resident One',
  customerPhone: '+910000000000',
  pgName: 'Shanti',
  bedCode: 'B1',
  roomNumber: '101',
  noticeGivenDate: '2026-06-01',
  noticeCompliant: true,
  resolvedAt: null,
  createdAt: new Date('2026-06-01'),
  updatedAt: new Date('2026-06-01'),
  deductionPaise: 0,
  depositHeldPaise: 50_000,
};

function opsItem(queue: UnifiedOpsItem['queue'], id: string): UnifiedOpsItem {
  return {
    id,
    queue,
    residentName: 'Test',
    pgName: 'PG',
    roomNumber: '101',
    bedCode: 'B1',
    reason: 'Test',
    openHref: '/admin',
    openLabel: 'Open',
  };
}

test('empty queue => all badge counts zero', () => {
  const counts = countOperationsQueueItems([]);
  assertOperationsQueueParity([], counts);
  for (const count of Object.values(counts)) {
    assert.equal(count, 0);
  }
});

test('queue with N rows => badge N for that filter', () => {
  const items = [
    opsItem('vacating_requests', 'move-1'),
    opsItem('vacating_requests', 'move-2'),
    opsItem('rent_due', 'rent-1'),
  ];
  const counts = countOperationsQueueItems(items);
  assert.equal(counts.vacating_requests, 2);
  assert.equal(filterOperationsQueueItems(items, 'vacating_requests').length, 2);
  assertOperationsQueueParity(items, counts);
});

test('completed checkout pipeline row excluded from move-out ops queue', () => {
  const pipeline = buildMoveOutPipeline({
    vacatingRows: [
      {
        ...baseVacating,
        id: 'vr-done',
        vacatingDate: '2026-06-10',
        status: 'approved',
      },
    ],
    settlements: [
      {
        id: 'cs-1',
        vacatingRequestId: 'vr-done',
        status: 'completed',
        createdAt: new Date('2026-06-05'),
        updatedAt: new Date('2026-06-06'),
        approvedAt: new Date('2026-06-06'),
        refundPaidAt: null,
        finalRefundPaise: 0,
      },
    ],
  });
  const item = pipeline[0]!;
  assert.equal(vacatingOperationsQueueTarget(item), null);
  assert.equal(mapVacatingPipelineItemToOpsItem(item, 'pg-1'), null);
});

test('rejected vacating never enters pipeline or ops queue', () => {
  const pipeline = buildMoveOutPipeline({
    vacatingRows: [
      {
        ...baseVacating,
        id: 'vr-rej',
        vacatingDate: '2026-06-20',
        status: 'rejected',
      },
    ],
    settlements: [],
  });
  assert.equal(pipeline.length, 0);
});

test('waiting for resident excluded from move-out ops queue', () => {
  const pipeline = buildMoveOutPipeline({
    vacatingRows: [
      {
        ...baseVacating,
        id: 'vr-wait',
        vacatingDate: '2026-07-01',
        status: 'approved',
      },
    ],
    settlements: [
      {
        id: 'cs-wait',
        vacatingRequestId: 'vr-wait',
        status: 'awaiting_resident_details',
        createdAt: new Date('2026-06-15'),
        updatedAt: new Date('2026-06-15'),
        approvedAt: null,
        refundPaidAt: null,
      },
    ],
  });
  assert.equal(vacatingOperationsQueueTarget(pipeline[0]!), null);
});

test('refund pending maps to refund_due not move-out', () => {
  const pipeline = buildMoveOutPipeline({
    vacatingRows: [
      {
        ...baseVacating,
        id: 'vr-ref',
        vacatingDate: '2026-06-15',
        status: 'approved',
      },
    ],
    settlements: [
      {
        id: 'cs-ref',
        vacatingRequestId: 'vr-ref',
        status: 'refund_pending',
        createdAt: new Date('2026-06-10'),
        updatedAt: new Date('2026-06-12'),
        approvedAt: new Date('2026-06-12'),
        refundPaidAt: null,
        finalRefundPaise: 12_000,
      },
    ],
  });
  const mapped = mapVacatingPipelineItemToOpsItem(pipeline[0]!, 'pg-1');
  assert.equal(mapped?.queue, 'refund_due');
});

test('dedupe prevents duplicate refund rows', () => {
  const items = dedupeOperationsQueueItems([
    { ...opsItem('refund_due', 'refund-a'), bookingId: 'bk-1' },
    { ...opsItem('refund_due', 'refund-b'), bookingId: 'bk-1' },
  ]);
  assert.equal(items.length, 1);
});

test('filter chip counts always match visible rows', () => {
  const items = [
    opsItem('vacating_requests', 'm1'),
    opsItem('refund_due', 'r1'),
    opsItem('kyc_review', 'k1'),
  ];
  const filterCounts = buildOperationsQueueFilterCounts(items);
  for (const chip of filterCounts) {
    assert.equal(chip.count, filterOperationsQueueItems(items, chip.id).length);
  }
});

test('move-out command stats match filter-visible rows', () => {
  const pipeline = buildMoveOutPipeline({
    vacatingRows: [
      {
        ...baseVacating,
        id: 'vr-pending',
        vacatingDate: '2026-07-15',
        status: 'pending',
      },
      {
        ...baseVacating,
        id: 'vr-wait',
        customerId: 'cust-2',
        vacatingDate: '2026-07-01',
        status: 'approved',
      },
    ],
    settlements: [
      {
        id: 'cs-wait',
        vacatingRequestId: 'vr-wait',
        status: 'awaiting_resident_details',
        createdAt: new Date('2026-06-20'),
        updatedAt: new Date('2026-06-20'),
        approvedAt: null,
        refundPaidAt: null,
      },
    ],
  });
  const clientItems = pipeline.map((item) => toClientMoveOutPipelineItem(item));
  const stats = buildMoveOutCommandStats(clientItems);
  const needsActionVisible = clientItems.filter(
    (item) => item.stage !== 'bed_released' && item.vacatingStatus === 'pending',
  ).length;
  assert.equal(stats.needsAction, needsActionVisible);
  assert.equal(stats.pendingApproval, 1);
});
