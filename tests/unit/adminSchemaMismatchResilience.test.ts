import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  isDatabaseSchemaMismatchError,
  schemaMismatchHint,
} from '@/src/lib/db/schemaMismatchError';
import { emptyUnifiedOperationsQueue } from '@/src/services/unifiedOperationsQueue';

describe('admin schema mismatch resilience', () => {
  test('detects missing column postgres errors', () => {
    assert.equal(
      isDatabaseSchemaMismatchError(
        new Error('column "proof_snapshot_submitted_paise" of relation "pg_payment_records" does not exist'),
      ),
      true,
    );
    assert.equal(isDatabaseSchemaMismatchError(new Error('connection timeout')), false);
  });

  test('maps proof snapshot columns to migration hints', () => {
    assert.match(
      schemaMismatchHint(new Error('column proof_snapshot_submitted_paise does not exist')),
      /0122/,
    );
    assert.match(
      schemaMismatchHint(new Error('column proof_snapshot_rent_due_paise does not exist')),
      /0121/,
    );
  });

  test('empty unified operations queue is safe for admin pages', () => {
    const queue = emptyUnifiedOperationsQueue('waiting_for_approval');
    assert.equal(queue.items.length, 0);
    assert.equal(queue.paymentReviews.length, 0);
    assert.equal(queue.filter, 'waiting_for_approval');
    assert.equal(queue.filterCounts.every((row) => row.count === 0), true);
  });
});
