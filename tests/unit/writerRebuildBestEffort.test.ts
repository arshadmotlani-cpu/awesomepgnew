/**
 * P0 regression: payment settlement must not fail when room_os_outbox is absent
 * or when outbox insert errors (Option B — outbox is best-effort only).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, test } from 'node:test';
import {
  enqueuePropertyIndexRebuildFromWriter,
  resetRoomOsOutboxPresenceCacheForTests,
} from '@/src/roomOs/outbox/writerRebuild';
import type { RoomOsDb } from '@/src/roomOs/outbox/append';

afterEach(() => {
  resetRoomOsOutboxPresenceCacheForTests();
});

function sqlText(query: unknown): string {
  if (typeof query === 'string') return query;
  const chunks = (query as { queryChunks?: unknown[] })?.queryChunks;
  if (Array.isArray(chunks)) {
    return chunks
      .map((c) => {
        if (typeof c === 'string') return c;
        const value = (c as { value?: unknown })?.value;
        if (typeof value === 'string') return value;
        if (Array.isArray(value)) return value.map(String).join('');
        return '';
      })
      .join('');
  }
  return String(query);
}

function createMockTx(opts: { present: boolean; insertError?: Error }) {
  const executeSql: string[] = [];
  let presenceChecked = false;
  let insertAttempts = 0;

  const tx = {
    execute: async (query: unknown) => {
      executeSql.push(sqlText(query));

      if (!presenceChecked) {
        presenceChecked = true;
        return [{ present: opts.present }];
      }
      return [];
    },
    insert: () => ({
      values: () => ({
        returning: async () => {
          insertAttempts += 1;
          if (opts.insertError) throw opts.insertError;
          const now = new Date();
          return [
            {
              eventId: 'evt-test',
              streamType: 'property',
              streamId: 'pg-test',
              eventType: 'property_index.rebuild_requested',
              occurredAt: now,
              createdAt: now,
              rulesEffectivePackId: 'rules-catalog-v1',
              payload: {},
              sourceRef: 'test',
            },
          ];
        },
      }),
    }),
  };

  return {
    tx: tx as unknown as RoomOsDb,
    executeSql,
    getInsertAttempts: () => insertAttempts,
  };
}

describe('writerRebuild best-effort outbox (P0 payment settlement)', () => {
  test('source: skips missing table, uses SAVEPOINT, no resolveEffectivePackId call', () => {
    const src = readFileSync(join(process.cwd(), 'src/roomOs/outbox/writerRebuild.ts'), 'utf8');
    assert.match(src, /to_regclass\('public\.room_os_outbox'\)/);
    assert.match(src, /SAVEPOINT/);
    assert.match(src, /ROLLBACK TO SAVEPOINT/);
    assert.match(src, /RULES_CATALOG_V1_ID/);
    assert.doesNotMatch(src, /resolveEffectivePackId\s*\(/);
  });

  test('enqueue returns without throwing when room_os_outbox is absent', async () => {
    const mock = createMockTx({ present: false });

    await assert.doesNotReject(() =>
      enqueuePropertyIndexRebuildFromWriter(mock.tx, {
        pgId: 'pg-missing-outbox',
        sourceRef: 'rentInvoices.recordRentPaymentSuccess',
      }),
    );

    assert.equal(mock.executeSql.length, 1, 'only presence check; no SAVEPOINT/insert');
    assert.doesNotMatch(mock.executeSql.join('\n'), /SAVEPOINT/i);
    assert.equal(mock.getInsertAttempts(), 0);
  });

  test('enqueue swallows outbox insert failure via SAVEPOINT (settlement continues)', async () => {
    const err = Object.assign(new Error('relation "room_os_outbox" does not exist'), {
      code: '42P01',
    });
    const mock = createMockTx({ present: true, insertError: err });

    await assert.doesNotReject(() =>
      enqueuePropertyIndexRebuildFromWriter(mock.tx, {
        pgId: 'pg-savepoint',
        sourceRef: 'rentInvoices.recordRentPaymentSuccess',
      }),
    );

    assert.equal(mock.getInsertAttempts(), 1);
    const joined = mock.executeSql.join('\n');
    assert.match(joined, /SAVEPOINT/i);
    assert.match(joined, /ROLLBACK TO SAVEPOINT/i);
  });
});
