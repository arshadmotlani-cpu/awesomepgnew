import { strict as assert } from 'node:assert';
import test from 'node:test';
import { toClientMoveOutPipelineItem } from '../../src/lib/moveOut/moveOutPipeline';
import {
  buildMoveOutCommandStats,
  moveOutHeroTitle,
  moveOutMatchesFilter,
  moveOutPrimaryActionLabel,
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
  continueHref: '/admin/bookings/bk-1/financial#checkout',
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

test('command stats count workflow stages', () => {
  const stats = buildMoveOutCommandStats([zeroRefundCheckout]);
  assert.equal(stats.settlementReview, 1);
  assert.equal(stats.needsAction, 1);
  assert.equal(stats.refundReady, 0);
});

test('filter buckets match workflow stage', () => {
  assert.ok(moveOutMatchesFilter(zeroRefundCheckout, 'settlement_review'));
  assert.equal(moveOutMatchesFilter(zeroRefundCheckout, 'waiting_vacating_date'), false);
});
