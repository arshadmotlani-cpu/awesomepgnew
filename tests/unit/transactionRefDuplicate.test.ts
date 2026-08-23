import { describe, expect, it } from 'vitest';
import {
  approveDuplicateConfirmMessage,
  assertTransactionRefRequired,
  buildDuplicateFlags,
  labelDuplicateContext,
  normalizeTransactionRef,
} from '@/src/lib/payments/transactionRefDuplicate';

describe('normalizeTransactionRef', () => {
  it('trims and case-folds', () => {
    expect(normalizeTransactionRef('  AbC123  ')).toBe('abc123');
  });

  it('returns null for empty / whitespace', () => {
    expect(normalizeTransactionRef('')).toBeNull();
    expect(normalizeTransactionRef('   ')).toBeNull();
    expect(normalizeTransactionRef(null)).toBeNull();
    expect(normalizeTransactionRef(undefined)).toBeNull();
  });
});

describe('assertTransactionRefRequired', () => {
  it('returns normalized value', () => {
    expect(assertTransactionRefRequired(' TXN-9 ')).toBe('txn-9');
  });

  it('throws when missing', () => {
    expect(() => assertTransactionRefRequired('')).toThrow(/required/i);
  });
});

describe('buildDuplicateFlags', () => {
  it('no matches → not duplicate', () => {
    expect(buildDuplicateFlags([])).toEqual({
      possibleDuplicate: false,
      duplicateOfIds: [],
    });
  });

  it('matches → flagged with ids', () => {
    expect(
      buildDuplicateFlags([
        { id: 'a', status: 'pending' },
        { id: 'b', status: 'approved' },
      ]),
    ).toEqual({
      possibleDuplicate: true,
      duplicateOfIds: ['a', 'b'],
    });
  });
});

describe('labelDuplicateContext', () => {
  it('prefers approved sibling for badge + reject note', () => {
    const label = labelDuplicateContext({ id: 'new', status: 'pending' }, [
      { id: 'pend-1', status: 'pending' },
      { id: 'appr-99abcdef', status: 'approved' },
    ]);
    expect(label.isDuplicate).toBe(true);
    expect(label.badge).toBe('Duplicate reference ID');
    expect(label.primarySibling?.id).toBe('appr-99abcdef');
    expect(label.defaultRejectNote).toMatch(/Duplicate of approved payment #appr-99a/i);
  });

  it('distinct empty siblings → not duplicate', () => {
    expect(
      labelDuplicateContext({ id: 'x', status: 'pending' }, []).isDuplicate,
    ).toBe(false);
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
    expect(msg).toMatch(/org-1234/i);
    expect(msg).toMatch(/2026-08-01/);
  });
});
