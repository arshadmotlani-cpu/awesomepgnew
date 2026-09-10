import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  deriveAdminNavBadgesFromOperationsQueue,
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

test('operationsTotalPendingCount mirrors unified queue totalCount', () => {
  assert.equal(operationsTotalPendingCount(emptyQueue({ totalCount: 0 })), 0);
  assert.equal(operationsTotalPendingCount(emptyQueue({ totalCount: 3 })), 3);
});

test('empty booking approval does not keep a phantom pending total', () => {
  const queue = emptyQueue({
    totalCount: 0,
    filterCounts: emptyQueue().filterCounts.map((c) =>
      c.id === 'booking_approval' ? { ...c, count: 0 } : c,
    ),
  });
  assert.equal(operationsFilterCount(queue, 'booking_approval'), 0);
  assert.equal(operationsTotalPendingCount(queue), 0);
});

test('adminNavBadges derives sidebar counts from unified Operations queue', () => {
  const src = read('src/services/adminNavBadges.ts');
  assert.match(src, /getUnifiedOperationsQueueForBadges/);
  assert.match(src, /deriveAdminNavBadgesFromOperationsQueue/);
  assert.match(src, /badges\.moveOut/);
  assert.match(src, /badges\.operations = operationsBadge/);
  assert.doesNotMatch(src, /countOpenActionItems/);
  assert.doesNotMatch(src, /countActiveVacating/);
  assert.doesNotMatch(src, /loadResidentOperationsResidentsPage/);
  assert.doesNotMatch(src, /allQueueCount/);
  assert.doesNotMatch(src, /getWaitingForApprovalCount/);
  assert.doesNotMatch(src, /unresolvedActions/);
  assert.doesNotMatch(src, /badges\.overview = pendingTotal/);
});

test('deriveAdminNavBadgesFromOperationsQueue maps move-out and operations independently', () => {
  const queue = emptyQueue({
    totalCount: 5,
    filterCounts: emptyQueue().filterCounts.map((c) => {
      if (c.id === 'rent_due') return { ...c, count: 3 };
      if (c.id === 'electricity_due') return { ...c, count: 2 };
      return c;
    }),
  });
  const badges = deriveAdminNavBadgesFromOperationsQueue(queue);
  assert.equal(badges.operations, 5);
  assert.equal(badges.moveOut, 0);
});

test('checkoutSettlements sidebar uses moveOut badge key', () => {
  const src = read('src/lib/admin/sidebarModules.ts');
  assert.match(src, /checkoutSettlements:[\s\S]*badgeKey: 'moveOut'/);
});

test('production and counter parity audits require sidebar badges match unified queue', () => {
  const production = read('src/services/productionAudit.ts');
  assert.match(production, /deriveAdminNavBadgesFromOperationsQueue/);
  assert.match(production, /getUnifiedOperationsQueueForBadges/);

  const parity = read('src/services/counterParityAudit.ts');
  assert.match(parity, /loadUnifiedOperationsQueue\.totalCount/);
  assert.match(parity, /Move-out nav badge/);
  assert.match(parity, /navBadges\.moveOut/);
  assert.doesNotMatch(parity, /required: false/);
  assert.doesNotMatch(parity, /loadResidentOperationsResidentsPage\.allQueueCount/);
});

test('booking approval revalidation busts admin shell layout for live badges', () => {
  const src = read('src/lib/occupancyRevalidate.ts');
  assert.match(src, /revalidatePath\('\/admin', 'layout'\)/);
});
