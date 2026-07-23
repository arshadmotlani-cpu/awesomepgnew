import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  bookingApprovalOpenHref,
  isEligibleForBookingApprovalQueue,
  mapLegacyBookingApprovalToOpsItem,
} from '../../src/lib/operations/bookingApprovalQueue';
import {
  countOperationsQueueItems,
  filterOperationsQueueItems,
} from '../../src/lib/operations/operationsQueueDefinition';
import type { UnifiedOpsItem } from '../../src/services/unifiedOperationsQueue';

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), 'utf8');
}

test('booking approval queue excludes confirmed and reserved lifecycle statuses', () => {
  assert.equal(isEligibleForBookingApprovalQueue('pending_approval'), true);
  assert.equal(isEligibleForBookingApprovalQueue('confirmed'), false);
  assert.equal(isEligibleForBookingApprovalQueue('pending_payment'), false);
  assert.equal(isEligibleForBookingApprovalQueue('cancelled'), false);
  assert.equal(isEligibleForBookingApprovalQueue('completed'), false);
});

test('booking approval open href is admin booking detail, never public /booking/:code', () => {
  assert.equal(bookingApprovalOpenHref('bk-123'), '/admin/bookings/bk-123');
  assert.equal(bookingApprovalOpenHref('bk-123').startsWith('/booking/'), false);
});

test('legacy booking approval row maps to admin review link', () => {
  const item = mapLegacyBookingApprovalToOpsItem({
    id: 'bk-1',
    bookingCode: 'APG-999',
    customerName: 'Ada',
    pgName: 'Shanti',
  });
  assert.equal(item.queue, 'booking_approval');
  assert.equal(item.openHref, '/admin/bookings/bk-1');
  assert.equal(item.openLabel, 'Review booking');
  assert.equal(item.statusLabel, 'Pending approval');
  assert.doesNotMatch(item.openHref, /^\/booking\//);
});

test('approved reserve-style rows must not inflate booking_approval badge', () => {
  const pending: UnifiedOpsItem = {
    id: 'booking-bk-pending',
    queue: 'booking_approval',
    residentName: 'Pending',
    pgName: 'PG',
    roomNumber: null,
    bedCode: null,
    reason: 'pending',
    openHref: '/admin/bookings/bk-pending',
    openLabel: 'Review booking',
    bookingId: 'bk-pending',
  };
  // Simulate the pre-fix bug: active reserved hold incorrectly tagged booking_approval.
  const staleReserved: UnifiedOpsItem = {
    id: 'bed-reserve-hold-1',
    queue: 'booking_approval',
    residentName: 'Reserved',
    pgName: 'PG',
    roomNumber: '101',
    bedCode: 'B1',
    reason: 'Active bed reservation — check-in 2026-08-01',
    openHref: '/booking/APG-RESERVED',
    openLabel: 'View reservation',
    bookingId: 'bk-reserved',
    bookingCode: 'APG-RESERVED',
    statusLabel: 'Reserved',
  };

  // Correct queue after fix: only pending approval work.
  const fixedItems = [pending];
  const counts = countOperationsQueueItems(fixedItems);
  assert.equal(counts.booking_approval, 1);
  assert.equal(filterOperationsQueueItems(fixedItems, 'booking_approval').length, 1);

  // Guard: a Reserved row with public href must never be treated as valid approval work.
  assert.equal(isEligibleForBookingApprovalQueue('confirmed'), false);
  assert.equal(staleReserved.openHref.startsWith('/booking/'), true);
  assert.notEqual(staleReserved.openHref, bookingApprovalOpenHref(staleReserved.bookingId!));
});

test('unified operations queue never injects active bed reserves into booking_approval', () => {
  const src = read('src/services/unifiedOperationsQueue.ts');
  assert.doesNotMatch(src, /listActiveBedReserves/);
  assert.doesNotMatch(src, /bed-reserve-/);
  assert.doesNotMatch(src, /View reservation/);
  assert.doesNotMatch(src, /statusLabel:\s*'Reserved'/);
  assert.doesNotMatch(src, /openHref:.*`\/booking\/\$\{/);
  assert.match(src, /mapLegacyBookingApprovalToOpsItem/);
  assert.match(src, /eq\(bookings\.status, 'pending_approval'\)/);
});

test('listPendingBookingApprovalsForSync stays pending_approval-only', () => {
  const src = read('src/services/unifiedOperationsQueue.ts');
  const fnStart = src.indexOf('export async function listPendingBookingApprovalsForSync');
  assert.ok(fnStart >= 0);
  const fnEnd = src.indexOf('export function parseUnifiedOpsFilter', fnStart);
  const fn = src.slice(fnStart, fnEnd);
  assert.match(fn, /eq\(bookings\.status, 'pending_approval'\)/);
  assert.doesNotMatch(fn, /eq\(bookings\.status, 'confirmed'\)/);
  assert.doesNotMatch(fn, /inArray\(bookings\.status/);
  // Active holds are excluded (NOT EXISTS), not selected as queue rows.
  assert.match(fn, /brh\.status::text = 'active'/);
  assert.match(fn, /NOT EXISTS/);
  assert.match(fn, /pgPaymentRecords/);
  assert.match(fn, /ppr\.status::text = 'approved'/);
});
