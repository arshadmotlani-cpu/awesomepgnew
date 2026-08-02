/**
 * Room OS Wave 2 — Operations Centre migration tests.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { isRoomOsOperationsQueueEnabled } from '@/src/lib/operations/featureFlag';
import {
  emptyUnifiedOperationsQueue,
} from '@/src/services/unifiedOperationsQueue';

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), 'utf8');
}

describe('Room OS Wave 2 — Operations Centre migration', () => {
  test('ROOM_OS_OPERATIONS_QUEUE defaults off until cutover', () => {
    const previous = process.env.ROOM_OS_OPERATIONS_QUEUE;
    delete process.env.ROOM_OS_OPERATIONS_QUEUE;
    assert.equal(isRoomOsOperationsQueueEnabled(), false);
    process.env.ROOM_OS_OPERATIONS_QUEUE = '1';
    assert.equal(isRoomOsOperationsQueueEnabled(), true);
    process.env.ROOM_OS_OPERATIONS_QUEUE = '0';
    assert.equal(isRoomOsOperationsQueueEnabled(), false);
    if (previous === undefined) delete process.env.ROOM_OS_OPERATIONS_QUEUE;
    else process.env.ROOM_OS_OPERATIONS_QUEUE = previous;
  });

  test('unified operations queue branches on feature flag', () => {
    const src = read('src/services/unifiedOperationsQueue.ts');
    assert.match(src, /isRoomOsOperationsQueueEnabled/);
    assert.match(src, /buildRoomOsUnifiedOperationsQueue/);
    assert.match(src, /loadRoomOsOperationsQueueItems/);
  });

  test('Room OS adapter uses read APIs only — no legacy composers', () => {
    const adapter = read('src/lib/operations/roomOsOperationsQueueAdapter.ts');
    assert.match(adapter, /getWorkQueue/);
    assert.match(adapter, /loadLedger/);
    assert.match(adapter, /loadBed/);
    assert.match(adapter, /loadRoomShared/);
    assert.match(adapter, /loadPropertyIndex/);
    assert.doesNotMatch(adapter, /billingCentreDashboard/);
    assert.doesNotMatch(adapter, /occupancySsot/);
    assert.doesNotMatch(adapter, /roomElectricityOccupants/);
    assert.doesNotMatch(adapter, /buildCollectionsQueue/);
    assert.doesNotMatch(adapter, /loadResidentOperationsDashboard/);
    assert.doesNotMatch(adapter, /getOperationsCenterData/);
  });

  test('Room OS path skips residentOperationsDashboard and collections queue', () => {
    const roomOsBuild = read('src/services/unifiedOperationsQueue.ts');
    const roomOsSection = roomOsBuild.slice(
      roomOsBuild.indexOf('async function buildRoomOsUnifiedOperationsQueue'),
      roomOsBuild.indexOf('async function buildUnifiedOperationsQueue'),
    );
    assert.doesNotMatch(roomOsSection, /loadResidentOperationsResidentsPage/);
    assert.doesNotMatch(roomOsSection, /listAdminElectricityInvoicesForReminders/);
    assert.doesNotMatch(roomOsSection, /buildCollectionsQueue/);
    assert.match(roomOsSection, /loadSupplementaryOperationsQueueItems/);
  });

  test('supplementary loader avoids residentOperationsDashboard', () => {
    const src = read('src/lib/operations/supplementaryOperationsQueue.ts');
    assert.match(src, /listPendingKycSubmissions/);
    assert.doesNotMatch(src, /loadResidentOperationsDashboard/);
    assert.doesNotMatch(src, /getOperationsCenterData/);
  });

  test('rollback — forceSource legacy bypasses Room OS path when flag ON', () => {
    const src = read('src/services/unifiedOperationsQueue.ts');
    assert.match(src, /forceSource === 'room_os'/);
    assert.match(src, /forceSource !== 'legacy'/);
    assert.match(src, /loadOperationsQueueForParityAudit/);
  });

  test('rollback — empty queue fallback shape unchanged after flag toggle', () => {
    const off = emptyUnifiedOperationsQueue('rent_due');
    const on = emptyUnifiedOperationsQueue('kyc_review');
    assert.equal(off.filter, 'rent_due');
    assert.equal(on.filter, 'kyc_review');
    assert.equal(off.totalCount, 0);
    assert.equal(on.totalCount, 0);
    assert.equal(off.filterCounts.length, on.filterCounts.length);
  });
});
