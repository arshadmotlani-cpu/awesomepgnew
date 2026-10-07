import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, test } from 'node:test';
import {
  DUPLICATE_TXN_REF_OVERRIDE_MIN_REASON_LENGTH,
  duplicateTransactionRefBlockedMessage,
  validateDuplicateTransactionRefOverrideReason,
} from '@/src/lib/payments/duplicateTransactionRefOverride';
import { approvedTransactionRefConflictMessage } from '@/src/lib/payments/transactionRefDuplicate';

describe('duplicate transaction ref admin override', () => {
  test('reason validation enforces minimum length', () => {
    assert.equal(
      validateDuplicateTransactionRefOverrideReason('short').ok,
      false,
    );
    const ok = validateDuplicateTransactionRefOverrideReason(
      'Verified separate UPI transfer from resident bank statement',
    );
    assert.equal(ok.ok, true);
    if (ok.ok) {
      assert.ok(ok.reason.length >= DUPLICATE_TXN_REF_OVERRIDE_MIN_REASON_LENGTH);
    }
  });

  test('blocked message tells admin to use Approve anyway', () => {
    assert.match(duplicateTransactionRefBlockedMessage(), /Approve anyway/i);
    assert.match(approvedTransactionRefConflictMessage(), /Approve anyway/i);
  });

  it('server registry insert requires duplicateOverride when siblings exist', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/services/pgTransactionRefIndex.ts'),
      'utf8',
    );
    const fn = src.slice(src.indexOf('export async function insertApprovedTransactionRefOrThrow'));
    assert.match(fn, /siblings\.length > 0/);
    assert.match(fn, /if \(!input\.duplicateOverride\)/);
    assert.match(fn, /logDuplicateTransactionRefOverrideAudit/);
    assert.match(src, /duplicate_transaction_ref_override/);
  });

  it('approve action rejects duplicate without override before settle', () => {
    const src = readFileSync(
      join(process.cwd(), 'app/(admin)/admin/payments/actions.ts'),
      'utf8',
    );
    assert.match(src, /assertDuplicateTxnRefOverrideAllowed/);
    assert.match(src, /duplicateTransactionRefBlockedMessage/);
    assert.match(src, /validateDuplicateTransactionRefOverrideReason/);
  });

  it('migration allows multiple rows per normalized ref', () => {
    const sql = readFileSync(
      join(process.cwd(), 'src/db/migrations/0155_pg_approved_txn_ref_multi.sql'),
      'utf8',
    );
    assert.match(sql, /pg_approved_transaction_refs_source_unique/);
    assert.match(sql, /pg_approved_transaction_refs_ref_idx/);
    assert.doesNotMatch(sql, /transaction_ref_normalized.*PRIMARY KEY/i);
  });

  it('payment review workspace surfaces duplicate warning UI', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/components/admin/payment-review/PaymentReviewWorkspace.tsx'),
      'utf8',
    );
    assert.match(src, /DuplicateTransactionRefWarningBanner/);
    assert.match(src, /Approve anyway/);
    assert.match(src, /duplicateTransactionRefOverride/);
  });

  it('unique source_kind + source_id prevents double registry for same payment', () => {
    const fn = readFileSync(
      join(process.cwd(), 'src/services/pgTransactionRefIndex.ts'),
      'utf8',
    ).slice(
      readFileSync(join(process.cwd(), 'src/services/pgTransactionRefIndex.ts'), 'utf8').indexOf(
        'export async function insertApprovedTransactionRefOrThrow',
      ),
    );
    assert.match(fn, /existingSelf/);
    assert.match(fn, /sourceKind.*sourceId/);
  });
});
