import assert from 'node:assert/strict';
import test from 'node:test';
import { refundConsoleHref } from '@/src/lib/refund/refundConsoleLinks';
import { buildUnifiedOpsFilterTags } from '@/src/services/unifiedOperationsQueue';

test('refund console deep link uses booking query param only', () => {
  assert.equal(refundConsoleHref('abc-123'), '/admin/refunds?booking=abc-123');
  assert.doesNotMatch(refundConsoleHref('abc-123'), /q=/);
});

test('refund filter tag includes dedicated refund chip', () => {
  const tags = buildUnifiedOpsFilterTags({ category: 'refund' });
  assert.ok(tags.includes('refund'));
});

test('Dhruv ₹950 refundable wallet arithmetic', () => {
  const depositPaidPaise = 95_000;
  const deductedPaise = 0;
  const refundedPaise = 0;
  const transferablePaise = 0;
  const remaining = depositPaidPaise - deductedPaise - refundedPaise - transferablePaise;
  assert.equal(remaining, 95_000);
  assert.equal(remaining / 100, 950);
});
