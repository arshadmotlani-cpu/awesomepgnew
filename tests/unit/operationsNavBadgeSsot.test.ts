import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import {
  assertOperationsNavBadgeParity,
  deriveAdminNavBadgesFromOperationsQueue,
  operationsFilterCount,
  operationsTotalPendingCount,
} from '../../src/lib/operations/operationsQueueCounts';
import { dedupeOperationsQueueItems } from '../../src/lib/operations/operationsQueueDefinition';
import type { UnifiedOperationsQueue, UnifiedOpsItem } from '../../src/services/unifiedOperationsQueue';

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), 'utf8');
}

function chipCounts(
  overrides: Partial<Record<UnifiedOpsItem['queue'], number>>,
): UnifiedOperationsQueue['filterCounts'] {
  const ids = [
    'waiting_for_approval',
    'rent_due',
    'electricity_due',
    'vacating_requests',
    'refund_due',
    'booking_approval',
    'deposit_due',
    'kyc_review',
  ] as const;
  return ids.map((id) => ({
    id,
    label: id,
    count: overrides[id] ?? 0,
  }));
}

function queueFromChipCounts(
  overrides: Partial<Record<UnifiedOpsItem['queue'], number>>,
): UnifiedOperationsQueue {
  const filterCounts = chipCounts(overrides);
  const totalCount = filterCounts.reduce((sum, chip) => sum + chip.count, 0);
  return {
    items: [],
    filter: 'waiting_for_approval',
    filterCounts,
    paymentReviews: [],
    focusReviewKey: null,
    totalCount,
  };
}

function item(queue: UnifiedOpsItem['queue'], id: string): UnifiedOpsItem {
  return {
    id,
    queue,
    residentName: 'Resident',
    pgName: 'PG',
    roomNumber: null,
    bedCode: null,
    reason: 'test',
    openHref: '/admin/operations',
    openLabel: 'Open',
  };
}

test('Operations badge equals sum of actionable queue chip counts', () => {
  const queue = queueFromChipCounts({
    waiting_for_approval: 0,
    rent_due: 3,
    electricity_due: 5,
    vacating_requests: 0,
  });
  const badges = deriveAdminNavBadgesFromOperationsQueue(queue);
  assert.equal(badges.operations, 8);
  assert.equal(operationsTotalPendingCount(queue), 8);
  assertOperationsNavBadgeParity(queue);
});

test('Move-out sidebar badge matches vacating_requests chip', () => {
  const queue = queueFromChipCounts({ vacating_requests: 2, rent_due: 1 });
  const badges = deriveAdminNavBadgesFromOperationsQueue(queue);
  assert.equal(badges.moveOut, 2);
  assert.equal(badges.moveOut, operationsFilterCount(queue, 'vacating_requests'));
});

test('payments sidebar badge matches waiting_for_approval chip only', () => {
  const queue = queueFromChipCounts({
    waiting_for_approval: 4,
    rent_due: 3,
  });
  const badges = deriveAdminNavBadgesFromOperationsQueue(queue);
  assert.equal(badges.payments, 4);
  assert.equal(badges.operations, 7);
});

test('dedupe prevents duplicate vacating rows from inflating move-out badge', () => {
  const items = dedupeOperationsQueueItems([
    {
      ...item('vacating_requests', 'move-1'),
      vacatingRequestId: 'vr-1',
    },
    {
      ...item('vacating_requests', 'move-1-dup'),
      vacatingRequestId: 'vr-1',
    },
    {
      ...item('vacating_requests', 'move-1-triplicate'),
      vacatingRequestId: 'vr-1',
    },
  ]);
  assert.equal(items.length, 1);
});

test('adminNavBadges derives Operations counts from unified queue — not action_items', () => {
  const badges = read('src/services/adminNavBadges.ts');
  assert.match(badges, /getUnifiedOperationsQueueForBadges/);
  assert.match(badges, /deriveAdminNavBadgesFromOperationsQueue/);
  assert.match(badges, /countActionableUnreadForAdmin/);
  assert.doesNotMatch(badges, /countOpenActionItems/);
  assert.doesNotMatch(badges, /countActiveVacating/);
  assert.doesNotMatch(badges, /actionItems/);
  assert.doesNotMatch(badges, /vacatingRequests/);
});

test('notification bell remains independent from Operations badge source', () => {
  const badges = read('src/services/adminNavBadges.ts');
  const engine = read('src/services/notificationEngine.ts');
  assert.match(badges, /badges\.notifications = notifications/);
  assert.match(engine, /countActionableUnreadForAdmin/);
  assert.doesNotMatch(badges, /badges\.operations = notifications/);
});

test('AdminLiveRefreshProvider no longer suppresses higher Operations counts', () => {
  const provider = read('src/components/admin/AdminLiveRefreshProvider.tsx');
  assert.doesNotMatch(provider, /mergeBadgesPreferLowerOperations/);
  assert.match(provider, /setBadges\(json\.badges\)/);
});

test('counter parity audit requires sidebar Operations and Move-out badges match queue', () => {
  const parity = read('src/services/counterParityAudit.ts');
  assert.match(parity, /Move-out nav badge/);
  assert.match(parity, /Operations queue total/);
  assert.doesNotMatch(parity, /informational — sidebar uses COUNT/);
});
