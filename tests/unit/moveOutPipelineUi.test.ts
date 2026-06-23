import { strict as assert } from 'node:assert';
import test from 'node:test';
import { toClientMoveOutPipelineItem } from '../../src/lib/moveOut/moveOutPipeline';
import {
  buildMoveOutCommandStats,
  moveOutHeroTitle,
  moveOutMatchesFilter,
  moveOutPrimaryActionLabel,
  partitionMoveOutItems,
} from '../../src/lib/moveOut/moveOutPipelineUi';

const zeroRefundCheckout = toClientMoveOutPipelineItem({
  id: 'vr-1',
  vacatingRequestId: 'vr-1',
  bookingId: 'bk-1',
  bookingCode: 'PG26-001',
  customerId: 'cust-1',
  customerFullName: 'Harish',
  customerPhone: '+919876543210',
  pgName: 'Demo PG',
  roomNumber: '203',
  bedCode: 'B5',
  vacatingDate: '2026-06-18',
  noticeGivenDate: '2026-06-01',
  noticeCompliant: true,
  vacatingStatus: 'approved',
  settlementId: 'cs-1',
  settlementStatus: 'awaiting_admin_review',
  stage: 'charges_calculated',
  stageIndex: 3,
  stageLabel: 'Charges calculated',
  nextAction: 'Review electricity and charges, approve refund',
  continueHref: '/admin/checkout-settlements/cs-1#approve-settlement',
  continueKind: 'settlement',
  sortPriority: 1,
  resolvedAt: null,
  createdAt: new Date('2026-06-01T10:00:00.000Z'),
  updatedAt: new Date('2026-06-02T10:00:00.000Z'),
  deductionPaise: 59500,
  electricityDeductionPaise: 90500,
  depositHeldPaise: 150000,
  estimatedRefundPaise: 0,
  daysRemaining: -5,
  urgency: 'high',
  bedStatus: 'Scheduled for Release',
  stageTimestamps: {},
});

test('zero-refund checkout uses Complete checkout action label', () => {
  assert.equal(moveOutPrimaryActionLabel(zeroRefundCheckout), 'Complete checkout');
  assert.equal(moveOutHeroTitle(zeroRefundCheckout), 'Complete checkout');
});

test('overdue items partition to top section', () => {
  const onTime = { ...zeroRefundCheckout, id: 'vr-2', daysRemaining: 3, urgency: 'normal' as const };
  const { overdue, active } = partitionMoveOutItems([zeroRefundCheckout, onTime]);
  assert.equal(overdue.length, 1);
  assert.equal(active.length, 1);
  assert.equal(overdue[0]?.customerFullName, 'Harish');
});

test('command stats count operator buckets', () => {
  const stats = buildMoveOutCommandStats([zeroRefundCheckout]);
  assert.equal(stats.overdue, 1);
  assert.equal(stats.needsAction, 1);
  assert.equal(stats.refundsToSend, 0);
});

test('filter buckets match without changing pipeline stage logic', () => {
  assert.ok(moveOutMatchesFilter(zeroRefundCheckout, 'overdue'));
  assert.ok(moveOutMatchesFilter(zeroRefundCheckout, 'needs_action'));
  assert.equal(moveOutMatchesFilter(zeroRefundCheckout, 'waiting_resident'), false);
});
