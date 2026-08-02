/**
 * Room OS Wave 2 — outbox processor tests.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import {
  computeRoomOsOutboxRetryDelayMs,
  isRoomOsOutboxDeadLetter,
  ROOM_OS_OUTBOX_MAX_ATTEMPTS,
  ROOM_OS_OUTBOX_RETRY_BACKOFF_MS,
} from '@/src/roomOs/outbox/retryPolicy';
import { evaluateRoomOsOutboxHealth } from '@/src/roomOs/outbox/metrics';

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), 'utf8');
}

describe('Room OS Wave 2 — Outbox processor', () => {
  test('retry backoff schedule matches Wave 2 policy', () => {
    assert.equal(ROOM_OS_OUTBOX_MAX_ATTEMPTS, 5);
    assert.deepEqual(ROOM_OS_OUTBOX_RETRY_BACKOFF_MS, [60_000, 300_000, 900_000, 900_000]);
    assert.equal(computeRoomOsOutboxRetryDelayMs(1), 60_000);
    assert.equal(computeRoomOsOutboxRetryDelayMs(4), 900_000);
    assert.equal(isRoomOsOutboxDeadLetter(4), false);
    assert.equal(isRoomOsOutboxDeadLetter(5), true);
  });

  test('outbox health evaluation flags pending backlog and dead letters', () => {
    const healthy = evaluateRoomOsOutboxHealth({
      pending: 2,
      processed: 100,
      failedRetryable: 0,
      deadLetter: 0,
      oldestPendingAgeMs: 1000,
      oldestDeadLetterAgeMs: null,
    });
    assert.equal(healthy.pass, true);

    const unhealthy = evaluateRoomOsOutboxHealth({
      pending: 200,
      processed: 0,
      failedRetryable: 1,
      deadLetter: 3,
      oldestPendingAgeMs: 60 * 60 * 1000,
      oldestDeadLetterAgeMs: 1000,
    });
    assert.equal(unhealthy.pass, false);
    assert.ok(unhealthy.mismatches.length >= 2);
  });

  test('process module exposes drainRoomOsOutbox', () => {
    const src = read('src/roomOs/outbox/process.ts');
    assert.match(src, /export async function drainRoomOsOutbox/);
    assert.match(src, /markRetryScheduled/);
    assert.match(src, /markPermanentFailed/);
  });

  test('append orders processable rows by created_at', () => {
    const src = read('src/roomOs/outbox/append.ts');
    assert.match(src, /orderBy\(asc\(roomOsOutbox\.createdAt\)\)/);
    assert.match(src, /fetchProcessableRoomOsOutboxBatch/);
  });

  test('cron route wires drainRoomOsOutbox and metrics', () => {
    const route = read('app/api/cron/room-os-outbox/route.ts');
    assert.match(route, /drainRoomOsOutbox/);
    assert.match(route, /getRoomOsOutboxMetrics/);
    assert.match(route, /CRON_SECRET/);
  });

  test('vercel.json schedules room-os-outbox cron', () => {
    const vercel = read('vercel.json');
    assert.match(vercel, /room-os-outbox/);
    assert.match(vercel, /\*\/5 \* \* \* \*/);
  });

  test('migration 0135 adds outbox retry columns', () => {
    const migration = read('src/db/migrations/0135_room_os_outbox_retry.sql');
    assert.match(migration, /attempt_count/);
    assert.match(migration, /next_retry_at/);
  });
});
