import assert from 'node:assert/strict';
import test from 'node:test';
import { buildMoveOutPipeline } from '@/src/lib/moveOut/moveOutPipeline';
import {
  WAITING_VACATING_DATE_NEXT_ACTION,
  deriveMoveOutWorkflowStage,
} from '@/src/lib/moveOut/moveOutWorkflowStages';
import { moveOutRequiresAdminActionNow } from '@/src/lib/operations/moveOutAdminAction';

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

test('pending vacating maps to pending_request with admin action', () => {
  const [item] = buildMoveOutPipeline({
    vacatingRows: [
      { ...baseVacating, id: 'vr-1', vacatingDate: '2026-08-01', status: 'pending' },
    ],
    settlements: [],
  });
  const stage = deriveMoveOutWorkflowStage(item!);
  assert.equal(stage.id, 'pending_request');
  assert.equal(stage.requiresAdminAction, true);
  assert.equal(moveOutRequiresAdminActionNow(item!), true);
});

test('approved awaiting resident maps to waiting_vacating_date without admin action', () => {
  const [item] = buildMoveOutPipeline({
    vacatingRows: [
      { ...baseVacating, id: 'vr-w', vacatingDate: '2026-09-01', status: 'approved' },
    ],
    settlements: [
      {
        id: 'cs-w',
        vacatingRequestId: 'vr-w',
        status: 'awaiting_resident_details',
        createdAt: new Date('2026-06-15'),
        updatedAt: new Date('2026-06-15'),
        approvedAt: null,
        refundPaidAt: null,
      },
    ],
  });
  const stage = deriveMoveOutWorkflowStage(item!);
  assert.equal(stage.id, 'waiting_vacating_date');
  assert.equal(stage.nextAction, WAITING_VACATING_DATE_NEXT_ACTION);
  assert.equal(stage.requiresAdminAction, false);
  assert.equal(moveOutRequiresAdminActionNow(item!), false);
});

test('approved without settlement row maps to waiting_vacating_date', () => {
  const [item] = buildMoveOutPipeline({
    vacatingRows: [
      { ...baseVacating, id: 'vr-a', vacatingDate: '2026-09-01', status: 'approved' },
    ],
    settlements: [],
  });
  assert.equal(deriveMoveOutWorkflowStage(item!).id, 'waiting_vacating_date');
});

test('awaiting_admin_review maps to settlement_review with admin action', () => {
  const [item] = buildMoveOutPipeline({
    vacatingRows: [
      { ...baseVacating, id: 'vr-r', vacatingDate: '2026-07-10', status: 'approved' },
    ],
    settlements: [
      {
        id: 'cs-r',
        vacatingRequestId: 'vr-r',
        status: 'awaiting_admin_review',
        createdAt: new Date('2026-07-08'),
        updatedAt: new Date('2026-07-09'),
        approvedAt: null,
        refundPaidAt: null,
        finalRefundPaise: 12_000,
      },
    ],
  });
  const stage = deriveMoveOutWorkflowStage(item!);
  assert.equal(stage.id, 'settlement_review');
  assert.equal(stage.requiresAdminAction, true);
  assert.equal(moveOutRequiresAdminActionNow(item!), true);
});

test('refund_pending maps to refund_ready with admin action', () => {
  const [item] = buildMoveOutPipeline({
    vacatingRows: [
      { ...baseVacating, id: 'vr-f', vacatingDate: '2026-07-01', status: 'approved' },
    ],
    settlements: [
      {
        id: 'cs-f',
        vacatingRequestId: 'vr-f',
        status: 'refund_pending',
        createdAt: new Date('2026-06-20'),
        updatedAt: new Date('2026-06-25'),
        approvedAt: new Date('2026-06-25'),
        refundPaidAt: null,
        finalRefundPaise: 20_000,
      },
    ],
  });
  const stage = deriveMoveOutWorkflowStage(item!);
  assert.equal(stage.id, 'refund_ready');
  assert.equal(stage.requiresAdminAction, true);
});

test('completed checkout maps to completed', () => {
  const [item] = buildMoveOutPipeline({
    vacatingRows: [
      {
        ...baseVacating,
        id: 'vr-c',
        vacatingDate: '2026-06-01',
        status: 'completed',
        resolvedAt: new Date('2026-06-05'),
      },
    ],
    settlements: [
      {
        id: 'cs-c',
        vacatingRequestId: 'vr-c',
        status: 'completed',
        createdAt: new Date('2026-06-02'),
        updatedAt: new Date('2026-06-05'),
        approvedAt: new Date('2026-06-04'),
        refundPaidAt: new Date('2026-06-05'),
        finalRefundPaise: 10_000,
      },
    ],
  });
  assert.equal(deriveMoveOutWorkflowStage(item!).id, 'completed');
});
