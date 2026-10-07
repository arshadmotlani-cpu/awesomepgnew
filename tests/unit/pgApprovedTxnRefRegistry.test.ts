import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';

describe('pg approved transaction ref registry', () => {
  test('journal registers 0154 and 0155 so production can apply multi-ref schema', () => {
    const journal = readFileSync(
      join(process.cwd(), 'src/db/migrations/meta/_journal.json'),
      'utf8',
    );
    assert.match(journal, /0154_prepaid_rent_refund_request/);
    assert.match(journal, /0154b_prepaid_rent_refund_request_index/);
    assert.match(journal, /0155_pg_approved_txn_ref_multi/);
  });

  test('registry uses information_schema probe instead of selecting missing id column', () => {
    const schema = readFileSync(
      join(process.cwd(), 'src/lib/db/pgApprovedTxnRefSchema.ts'),
      'utf8',
    );
    assert.match(schema, /information_schema\.columns/);
    assert.match(schema, /legacy_ref_pk/);
    assert.match(schema, /multi_row/);

    const registry = readFileSync(
      join(process.cwd(), 'src/services/pgApprovedTxnRefRegistry.ts'),
      'utf8',
    );
    assert.match(registry, /listApprovedTxnRefsByNormalizedRef/);
    assert.match(registry, /getPgApprovedTxnRefSchemaMode/);
    assert.match(registry, /transaction_ref_normalized, source_kind, source_id/);
  });

  test('txn ref index routes registry reads through legacy-safe module', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/services/pgTransactionRefIndex.ts'),
      'utf8',
    );
    assert.match(src, /listApprovedTxnRefsByNormalizedRef/);
    assert.match(src, /findApprovedTxnRefBySource/);
    assert.match(src, /insertApprovedTxnRefRow/);
    assert.doesNotMatch(src, /from\(pgApprovedTransactionRefs\)/);
  });
});
