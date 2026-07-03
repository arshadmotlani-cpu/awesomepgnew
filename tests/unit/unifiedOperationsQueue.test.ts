import assert from 'node:assert/strict';
import test from 'node:test';
import {
  OPS_QUEUE_FILTERS,
  OPS_QUEUE_LABELS,
  parseOperationsFilter,
} from '@/src/lib/operations/operationsFilterLinks';
import { buildUnifiedOpsFilterTags } from '@/src/services/unifiedOperationsQueue';

test('operations has exactly eight action queues in order', () => {
  assert.deepEqual(OPS_QUEUE_FILTERS, [
    'waiting_for_approval',
    'rent_due',
    'electricity_due',
    'vacating_requests',
    'refund_due',
    'booking_approval',
    'deposit_due',
    'kyc_review',
  ]);
  assert.equal(OPS_QUEUE_LABELS.deposit_due, 'Deposit due');
  assert.equal(OPS_QUEUE_LABELS.vacating_requests, 'Move-out');
  assert.equal(OPS_QUEUE_LABELS.bed_assignment, undefined);
});

test('legacy payment_proof filter maps to waiting_for_approval', () => {
  assert.equal(parseOperationsFilter('payment_proof'), 'waiting_for_approval');
  assert.equal(parseOperationsFilter('move_out'), 'vacating_requests');
  assert.equal(parseOperationsFilter('refund'), 'refund_due');
});

test('buildUnifiedOpsFilterTags maps rent overdue to rent_due only', () => {
  const rentOverdue = buildUnifiedOpsFilterTags({ category: 'rent_overdue' });
  assert.deepEqual(rentOverdue, ['rent_due']);
  assert.equal(rentOverdue.includes('overdue' as never), false);
});

test('payment proof maps to waiting_for_approval only', () => {
  const tags = buildUnifiedOpsFilterTags({ category: 'payment_proof' });
  assert.deepEqual(tags, ['waiting_for_approval']);
});
