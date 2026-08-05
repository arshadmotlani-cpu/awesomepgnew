import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ALLOCATION_INTEGRITY_CHECK_TYPES,
  type AllocationIntegrityIssue,
} from '../../src/services/allocationIntegrityAudit';

test('allocation integrity check types cover rent/deposit/refund drift classes', () => {
  assert.equal(ALLOCATION_INTEGRITY_CHECK_TYPES.length, 5);
  assert.ok(ALLOCATION_INTEGRITY_CHECK_TYPES.includes('PAID_WITHOUT_ALLOCATION'));
  assert.ok(ALLOCATION_INTEGRITY_CHECK_TYPES.includes('LEDGER_MISMATCH'));
  assert.ok(ALLOCATION_INTEGRITY_CHECK_TYPES.includes('ORPHAN_PAYMENT'));
  assert.ok(ALLOCATION_INTEGRITY_CHECK_TYPES.includes('DOUBLE_ALLOCATION'));
  assert.ok(ALLOCATION_INTEGRITY_CHECK_TYPES.includes('REFUND_MISMATCH'));
});

test('allocation issue shape is stable for billing integrity merge', () => {
  const issue: AllocationIntegrityIssue = {
    checkType: 'PAID_WITHOUT_ALLOCATION',
    customerId: '00000000-0000-4000-8000-000000000001',
    customerName: 'Test',
    detail: 'missing allocation',
    autoRepairable: true,
  };
  assert.equal(issue.checkType, 'PAID_WITHOUT_ALLOCATION');
});
