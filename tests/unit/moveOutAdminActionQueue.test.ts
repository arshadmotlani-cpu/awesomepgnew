import assert from 'node:assert/strict';
import test from 'node:test';
import { buildMoveOutPipeline } from '@/src/lib/moveOut/moveOutPipeline';
import { buildMoveOutCommandStats } from '@/src/lib/moveOut/moveOutPipelineUi';
import {
  moveOutOperationsQueueTarget,
  moveOutRequiresAdminActionNow,
  vacatingRowRequiresAdminOpsAction,
} from '@/src/lib/operations/moveOutAdminAction';
import {
  mapVacatingPipelineItemToOpsItem,
  vacatingOperationsQueueTarget,
} from '@/src/lib/operations/operationsQueueVacating';
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

test('approved waiting for resident is not admin action', () => {
  const pipeline = buildMoveOutPipeline({
    vacatingRows: [
      {
        ...baseVacating,
        id: 'vr-wait',
        vacatingDate: '2026-09-01',
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
  const item = pipeline[0]!;
  assert.equal(moveOutRequiresAdminActionNow(item), false);
  assert.equal(vacatingOperationsQueueTarget(item), null);
});

test('zero-refund settlement waiting on resident stays out of move-out ops', () => {
  const pipeline = buildMoveOutPipeline({
    vacatingRows: [
      {
        ...baseVacating,
        id: 'vr-zero',
        vacatingDate: '2026-08-01',
        status: 'approved',
        depositHeldPaise: 0,
      },
    ],
    settlements: [
      {
        id: 'cs-zero',
        vacatingRequestId: 'vr-zero',
        status: 'awaiting_resident_details',
        createdAt: new Date('2026-07-01'),
        updatedAt: new Date('2026-07-01'),
        approvedAt: null,
        refundPaidAt: null,
        finalRefundPaise: 0,
      },
    ],
  });
  const item = pipeline[0]!;
  assert.equal(item.continueKind, 'settlement');
  assert.equal(moveOutOperationsQueueTarget(item), null);
});

test('awaiting_admin_review maps to refund_due with checkout copy', () => {
  const pipeline = buildMoveOutPipeline({
    vacatingRows: [
      {
        ...baseVacating,
        id: 'vr-review',
        vacatingDate: '2026-07-10',
        status: 'approved',
      },
    ],
    settlements: [
      {
        id: 'cs-review',
        vacatingRequestId: 'vr-review',
        status: 'awaiting_admin_review',
        createdAt: new Date('2026-07-08'),
        updatedAt: new Date('2026-07-09'),
        approvedAt: null,
        refundPaidAt: null,
        finalRefundPaise: 12_000,
      },
    ],
  });
  const item = pipeline[0]!;
  assert.equal(moveOutRequiresAdminActionNow(item), true);
  assert.equal(moveOutOperationsQueueTarget(item), 'refund_due');
  assert.equal(vacatingOperationsQueueTarget(item), 'refund_due');
  const mapped = mapVacatingPipelineItemToOpsItem(item, 'pg-1');
  assert.equal(mapped?.queue, 'refund_due');
  assert.equal(mapped?.reason, 'Resident submitted checkout details');
});

test('vacatingRowRequiresAdminOpsAction matches pipeline SSOT', () => {
  assert.equal(vacatingRowRequiresAdminOpsAction({ status: 'pending' }), true);
  assert.equal(
    vacatingRowRequiresAdminOpsAction({
      status: 'approved',
      settlementStatus: 'awaiting_resident_details',
    }),
    false,
  );
  assert.equal(
    vacatingRowRequiresAdminOpsAction({
      status: 'approved',
      settlementStatus: 'awaiting_admin_review',
    }),
    true,
  );
});

test('needsAction stats count only pending and admin checkout work', () => {
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
        vacatingDate: '2026-08-01',
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
  assert.equal(stats.needsAction, 1);
  assert.equal(stats.pendingApproval, 1);
});
