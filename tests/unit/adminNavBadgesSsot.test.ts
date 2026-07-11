import assert from 'node:assert/strict';
import test from 'node:test';
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
      { id: 'refund_due', label: 'Refund due', count: 0 },
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

test('adminNavBadges uses unified queue total — never residents parallel queue', () => {
  const src = read('src/services/adminNavBadges.ts');
  assert.match(src, /getUnifiedOperationsQueueForRequest/);
  assert.match(src, /operationsTotalPendingCount/);
  assert.doesNotMatch(src, /loadResidentOperationsResidentsPage/);
  assert.doesNotMatch(src, /allQueueCount/);
  assert.doesNotMatch(src, /getWaitingForApprovalCount/);
  // Overview and Operations share the same pending total (no double-count).
  assert.match(src, /badges\.overview = pendingTotal/);
  assert.match(src, /badges\.operations = pendingTotal/);
});

test('production and counter parity audits compare badges to unified totalCount', () => {
  const production = read('src/services/productionAudit.ts');
  assert.match(production, /loadUnifiedOperationsQueue/);
  assert.match(production, /ops\.totalCount/);
  assert.doesNotMatch(production, /allQueueCount/);

  const parity = read('src/services/counterParityAudit.ts');
  assert.match(parity, /loadUnifiedOperationsQueue\.totalCount/);
  assert.doesNotMatch(parity, /loadResidentOperationsResidentsPage\.allQueueCount/);
});

test('booking approval revalidation busts admin shell layout for live badges', () => {
  const src = read('src/lib/occupancyRevalidate.ts');
  assert.match(src, /revalidatePath\('\/admin', 'layout'\)/);
});
