import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { toClientMoveOutPipelineItem } from '../../src/lib/moveOut/moveOutPipeline';
import {
  buildMoveOutCommandStats,
  moveOutMatchesFilter,
  moveOutPendingApprovalItems,
} from '../../src/lib/moveOut/moveOutPipelineUi';

const pendingNotice = toClientMoveOutPipelineItem({
  id: 'vr-atif',
  vacatingRequestId: 'vr-atif',
  bookingId: 'bk-atif',
  bookingCode: 'APG-2026-0020',
  customerId: 'cust-atif',
  customerFullName: 'Mohd Aatif',
  customerPhone: '+919999999999',
  pgName: 'Shanti Nagar',
  roomNumber: '204',
  bedCode: 'B2',
  vacatingDate: '2026-07-15',
  noticeGivenDate: '2026-06-20',
  noticeCompliant: true,
  vacatingStatus: 'pending',
  settlementId: null,
  settlementStatus: null,
  stage: 'requested',
  stageIndex: 0,
  stageLabel: 'Requested',
  nextAction: 'Verify notice period and approve move-out',
  continueHref: null,
  continueKind: 'approve',
  sortPriority: 0,
  resolvedAt: null,
  createdAt: new Date('2026-06-20T10:00:00.000Z'),
  updatedAt: new Date('2026-06-20T10:00:00.000Z'),
  deductionPaise: 0,
  electricityDeductionPaise: 0,
  depositHeldPaise: 400000,
  estimatedRefundPaise: 400000,
  daysRemaining: 10,
  urgency: 'normal',
  bedStatus: 'Occupied',
  stageTimestamps: {},
});

test('pending move-out notice appears in needs_action filter', () => {
  assert.equal(moveOutMatchesFilter(pendingNotice, 'needs_action'), true);
  assert.equal(moveOutMatchesFilter(pendingNotice, 'waiting_resident'), false);
});

test('pending approval items are extracted for pinned admin section', () => {
  const approved = { ...pendingNotice, id: 'vr-2', vacatingStatus: 'approved' as const };
  const items = moveOutPendingApprovalItems([pendingNotice, approved]);
  assert.equal(items.length, 1);
  assert.equal(items[0]?.customerFullName, 'Mohd Aatif');
});

test('command stats count pending approval separately', () => {
  const stats = buildMoveOutCommandStats([pendingNotice]);
  assert.equal(stats.pendingApproval, 1);
  assert.equal(stats.needsAction, 1);
});

test('syncVacatingAlerts reads active rows from move-out pipeline SSOT', () => {
  const source = readFileSync('src/services/actionItems.ts', 'utf8');
  const start = source.indexOf('async function syncVacatingAlerts');
  const end = source.indexOf('async function syncRefundsPending');
  const fn = source.slice(start, end);
  assert.match(fn, /loadMoveOutPipelineBundle/);
  assert.match(fn, /bundle\.approvalItems/);
});
