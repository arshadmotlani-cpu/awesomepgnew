import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  approveDuplicateConfirmMessage,
  approvedTransactionRefConflictMessage,
  assertTransactionRefRequired,
  buildDuplicateFlags,
  isApprovedTransactionRefUniqueViolation,
  labelDuplicateContext,
  normalizeTransactionRef,
} from '@/src/lib/payments/transactionRefDuplicate';

describe('normalizeTransactionRef', () => {
  it('trims and case-folds', () => {
    assert.equal(normalizeTransactionRef('  AbC123  '), 'abc123');
  });

  it('returns null for empty / whitespace', () => {
    assert.equal(normalizeTransactionRef(''), null);
    assert.equal(normalizeTransactionRef('   '), null);
    assert.equal(normalizeTransactionRef(null), null);
    assert.equal(normalizeTransactionRef(undefined), null);
  });
});

describe('assertTransactionRefRequired', () => {
  it('returns normalized value', () => {
    assert.equal(assertTransactionRefRequired(' TXN-9 '), 'txn-9');
  });

  it('throws when missing', () => {
    assert.throws(() => assertTransactionRefRequired(''), /required/i);
  });
});

describe('buildDuplicateFlags', () => {
  it('no matches → not duplicate', () => {
    assert.deepEqual(buildDuplicateFlags([]), {
      possibleDuplicate: false,
      duplicateOfIds: [],
    });
  });

  it('matches → flagged with ids', () => {
    assert.deepEqual(
      buildDuplicateFlags([
        { id: 'a', status: 'pending' },
        { id: 'b', status: 'approved' },
      ]),
      {
        possibleDuplicate: true,
        duplicateOfIds: ['a', 'b'],
      },
    );
  });
});

describe('labelDuplicateContext', () => {
  it('prefers approved sibling for badge + reject note', () => {
    const label = labelDuplicateContext({ id: 'new', status: 'pending' }, [
      { id: 'pend-1', status: 'pending' },
      { id: 'appr-99abcdef', status: 'approved' },
    ]);
    assert.equal(label.isDuplicate, true);
    assert.equal(label.badge, 'Duplicate reference ID');
    assert.equal(label.primarySibling?.id, 'appr-99abcdef');
    assert.match(label.defaultRejectNote ?? '', /Duplicate of approved payment #appr-99a/i);
  });

  it('distinct empty siblings → not duplicate', () => {
    assert.equal(
      labelDuplicateContext({ id: 'x', status: 'pending' }, []).isDuplicate,
      false,
    );
  });
});

describe('approveDuplicateConfirmMessage', () => {
  it('names org and date when present', () => {
    const msg = approveDuplicateConfirmMessage({
      id: 'sib',
      status: 'approved',
      organizationId: 'org-12345678xxxx',
      reviewedAt: '2026-08-01T00:00:00.000Z',
    });
    assert.match(msg, /org-1234/i);
    assert.match(msg, /2026-08-01/);
  });
});

describe('approvedTransactionRefConflictMessage', () => {
  it('mentions already approved', () => {
    assert.match(approvedTransactionRefConflictMessage(), /already approved/i);
  });
});

describe('isApprovedTransactionRefUniqueViolation', () => {
  it('detects pg_approved_transaction_refs unique violations', () => {
    assert.equal(
      isApprovedTransactionRefUniqueViolation({
        code: '23505',
        constraint: 'pg_approved_transaction_refs_pkey',
        message: 'duplicate key value violates unique constraint',
      }),
      true,
    );
  });

  it('ignores other errors', () => {
    assert.equal(
      isApprovedTransactionRefUniqueViolation({ code: '23505', message: 'other' }),
      false,
    );
    assert.equal(isApprovedTransactionRefUniqueViolation(null), false);
  });
});
