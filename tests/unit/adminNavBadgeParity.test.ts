import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  operationsFilterCount,
  operationsTotalPendingCount,
} from '../../src/lib/operations/operationsQueueCounts';
import type { UnifiedOperationsQueue } from '../../src/services/unifiedOperationsQueue';

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), 'utf8');
}

function emptyQueue(overrides: Partial<UnifiedOperationsQueue> = {}): UnifiedOperationsQueue {
  return {
    items: [],
    filter: 'waiting_for_approval',
    filterCounts: [
      { id: 'waiting_for_approval', label: 'Waiting for approval', count: 0 },
      { id: 'rent_due', label: 'Rent due', count: 0 },
      { id: 'electricity_due', label: 'Electricity due', count: 0 },
      { id: 'vacating_requests', label: 'Move-out', count: 0 },
      { id: 'refund_due', label: 'Pending payouts', count: 0 },
      { id: 'booking_approval', label: 'Booking approval', count: 0 },
      { id: 'deposit_due', label: 'Deposit due', count: 0 },
      { id: 'kyc_review', label: 'KYC review', count: 0 },
    ],
    paymentReviews: [],
    focusReviewKey: null,
    totalCount: 0,
    ...overrides,
  };
}

describe('Admin nav badge parity', () => {
  test('empty unified queue => Operations badge total 0', () => {
    const queue = emptyQueue({ totalCount: 0 });
    assert.equal(operationsTotalPendingCount(queue), 0);
    for (const chip of queue.filterCounts) {
      assert.equal(operationsFilterCount(queue, chip.id), 0);
    }
  });

  test('empty KYC chip => KYC filter count 0', () => {
    const queue = emptyQueue();
    assert.equal(operationsFilterCount(queue, 'kyc_review'), 0);
  });

  test('Operations badge uses queue totalCount not per-bucket sum drift', () => {
    const queue = emptyQueue({
      totalCount: 3,
      filterCounts: emptyQueue().filterCounts.map((c) =>
        c.id === 'rent_due' ? { ...c, count: 2 } : c.id === 'kyc_review' ? { ...c, count: 1 } : c,
      ),
    });
    assert.equal(operationsTotalPendingCount(queue), 3);
  });
});

describe('Admin nav badge source contracts', () => {
  test('adminNavBadges reads unified queue and actionable notification count', () => {
    const badges = read('src/services/adminNavBadges.ts');
    assert.match(badges, /getUnifiedOperationsQueueForBadges/);
    assert.match(badges, /countActionableUnreadForAdmin/);
    assert.doesNotMatch(badges, /unresolvedActions/);
    assert.doesNotMatch(badges, /countUnreadForAdmin/);
  });

  test('notification bell uses actionable unread count', () => {
    const engine = read('src/services/notificationEngine.ts');
    const live = read('app/api/admin/live/route.ts');
    assert.match(engine, /countActionableUnreadForAdmin/);
    assert.match(engine, /action_items ai/);
    assert.match(live, /countActionableUnreadForAdmin/);
  });

  test('action item sync archives stale notifications in notifications table', () => {
    const items = read('src/services/actionItems.ts');
    assert.match(items, /FROM notifications n/);
    assert.doesNotMatch(items, /admin_notification_states/);
  });
});
