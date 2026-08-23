import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildDuplicateFlags,
  labelDuplicateContext,
  normalizeTransactionRef,
} from '@/src/lib/payments/transactionRefDuplicate';
import { hasTxnOrScreenshotProof } from '@/src/services/pgTransactionRefIndex';

describe('PG txn-ID duplicate behavior', () => {
  it('normalizes and flags cross-kind sibling ids', () => {
    const ref = normalizeTransactionRef('  UTR-ABC  ');
    assert.equal(ref, 'utr-abc');
    const flags = buildDuplicateFlags([
      { id: 'rent-1', status: 'pending', sourceKind: 'rent_invoice' },
      { id: 'qr-2', status: 'approved', sourceKind: 'pg_payment_record' },
    ]);
    assert.equal(flags.possibleDuplicate, true);
    assert.deepEqual(flags.duplicateOfIds, ['rent-1', 'qr-2']);
    const label = labelDuplicateContext({ id: 'new', status: 'pending' }, [
      { id: 'qr-2abcdef', status: 'approved', sourceKind: 'pg_payment_record' },
    ]);
    assert.equal(label.badge, 'Duplicate reference ID');
    assert.match(label.defaultRejectNote ?? '', /approved payment #qr-2abcd/i);
  });

  it('treats txn-only as valid proof evidence', () => {
    assert.equal(
      hasTxnOrScreenshotProof({ paymentProofUrl: null, transactionRef: 'abc123' }),
      true,
    );
    assert.equal(
      hasTxnOrScreenshotProof({ paymentProofUrl: null, transactionRef: '  ' }),
      false,
    );
    assert.equal(
      hasTxnOrScreenshotProof({
        paymentProofUrl: 'https://x.private.blob.vercel-storage.com/a.png',
        transactionRef: null,
      }),
      true,
    );
  });
});
