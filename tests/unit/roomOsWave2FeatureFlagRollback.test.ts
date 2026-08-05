/**
 * Room OS Wave 2 — feature flag rollback tests.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { isRoomOsOperationsQueueEnabled } from '@/src/lib/operations/featureFlag';
import { emptyUnifiedOperationsQueue } from '@/src/services/unifiedOperationsQueue';

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), 'utf8');
}

describe('Room OS Wave 2 — Feature flag rollback', () => {
  test('default OFF restores legacy path selection', () => {
    const previous = process.env.ROOM_OS_OPERATIONS_QUEUE;
    delete process.env.ROOM_OS_OPERATIONS_QUEUE;
    assert.equal(isRoomOsOperationsQueueEnabled(), false);

    const src = read('src/services/unifiedOperationsQueue.ts');
    assert.match(src, /forceSource === 'room_os'/);
    assert.match(src, /forceSource !== 'legacy' && isRoomOsOperationsQueueEnabled/);

    if (previous === undefined) delete process.env.ROOM_OS_OPERATIONS_QUEUE;
    else process.env.ROOM_OS_OPERATIONS_QUEUE = previous;
  });

  test('toggle ON then OFF via env', () => {
    const previous = process.env.ROOM_OS_OPERATIONS_QUEUE;
    process.env.ROOM_OS_OPERATIONS_QUEUE = '1';
    assert.equal(isRoomOsOperationsQueueEnabled(), true);
    process.env.ROOM_OS_OPERATIONS_QUEUE = '0';
    assert.equal(isRoomOsOperationsQueueEnabled(), false);
    if (previous === undefined) delete process.env.ROOM_OS_OPERATIONS_QUEUE;
    else process.env.ROOM_OS_OPERATIONS_QUEUE = previous;
  });

  test('emptyUnifiedOperationsQueue shape is stable for rollback fallback', () => {
    const queue = emptyUnifiedOperationsQueue('rent_due');
    assert.equal(queue.filter, 'rent_due');
    assert.equal(queue.items.length, 0);
    assert.equal(queue.totalCount, 0);
    assert.equal(queue.filterCounts.length, 9);
  });

  test('parity audit bypasses env via forceSource', () => {
    const src = read('src/services/unifiedOperationsQueue.ts');
    assert.match(src, /loadOperationsQueueForParityAudit/);
    assert.match(src, /forceSource: source/);
  });

  test('legacy path preserved when flag OFF', () => {
    const src = read('src/services/unifiedOperationsQueue.ts');
    assert.match(src, /loadResidentOperationsResidentsPage/);
    assert.match(src, /buildCollectionsQueue/);
  });
});
