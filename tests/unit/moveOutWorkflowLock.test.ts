import assert from 'node:assert/strict';
import test from 'node:test';
import { buildMoveOutPipeline } from '@/src/lib/moveOut/moveOutPipeline';
import {
  deriveMoveOutWorkflowStage,
  moveOutWorkflowWaitingOnLabel,
  RESIDENT_MOVE_OUT_COMPLETED,
  RESIDENT_WAITING_METER_UPI_ON_VACATE_DATE,
  RESIDENT_WAITING_PG_VERIFICATION,
} from '@/src/lib/moveOut/moveOutWorkflowStages';
import { moveOutRequiresAdminActionNow } from '@/src/lib/operations/moveOutAdminAction';
import { dedupeOperationsQueueItems } from '@/src/lib/operations/operationsQueueDefinition';
import { residentWorkflowStatusLine } from '@/src/lib/residents/vacatingPresentation';
import type { UnifiedOpsItem } from '@/src/services/unifiedOperationsQueue';

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

test('approved waiting stage is not admin action', () => {
  const [item] = buildMoveOutPipeline({
    vacatingRows: [
      { ...baseVacating, id: 'vr-a', vacatingDate: '2026-09-01', status: 'approved' },
    ],
    settlements: [],
  });
  assert.equal(moveOutRequiresAdminActionNow(item!), false);
  assert.equal(deriveMoveOutWorkflowStage(item!).waitingOn, 'resident');
});

test('resident workflow status lines', () => {
  assert.equal(
    residentWorkflowStatusLine({
      vacatingStatus: 'approved',
      checkoutStatus: 'awaiting_resident_details',
    }),
    RESIDENT_WAITING_METER_UPI_ON_VACATE_DATE,
  );
  assert.equal(
    residentWorkflowStatusLine({
      vacatingStatus: 'approved',
      checkoutStatus: 'awaiting_admin_review',
    }),
    RESIDENT_WAITING_PG_VERIFICATION,
  );
  assert.equal(
    residentWorkflowStatusLine({
      vacatingStatus: 'completed',
      checkoutStatus: 'completed',
    }),
    RESIDENT_MOVE_OUT_COMPLETED,
  );
});

test('waiting on labels for pipeline cards', () => {
  assert.equal(moveOutWorkflowWaitingOnLabel('admin'), 'Waiting on admin');
  assert.equal(moveOutWorkflowWaitingOnLabel('resident'), 'Waiting on resident');
});

test('dedupe collapses duplicate vacating ops rows', () => {
  const item = (id: string): UnifiedOpsItem => ({
    id,
    queue: 'vacating_requests',
    residentName: 'A',
    reason: 'x',
    openHref: '/x',
    openLabel: 'Open',
    category: 'move_out',
    vacatingRequestId: 'vr-dup',
  });
  const deduped = dedupeOperationsQueueItems([item('a'), item('b')]);
  assert.equal(deduped.length, 1);
});
