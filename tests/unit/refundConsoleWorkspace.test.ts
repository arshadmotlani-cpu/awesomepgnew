import assert from 'node:assert/strict';
import test from 'node:test';
import { refundConsoleHref } from '@/src/lib/refund/refundConsoleLinks';
import { parseOperationsFilter } from '@/src/lib/operations/operationsFilterLinks';

test('refund console deep link uses booking query param only', () => {
  assert.equal(refundConsoleHref('abc-123'), '/admin/refunds?booking=abc-123');
  assert.doesNotMatch(refundConsoleHref('abc-123'), /q=/);
});

test('refund filter maps to refund_due queue', () => {
  assert.equal(parseOperationsFilter('refund'), 'refund_due');
});
