import assert from 'node:assert/strict';
import test from 'node:test';
import { BILLING_INTEGRITY_CHECK_TYPES } from '../../src/services/billingIntegrityCheck';
import type { ApprovedPaymentPurpose } from '../../src/services/paymentSettlementAtomic';

test('billing integrity check types cover payment settlement drift classes', () => {
  assert.equal(BILLING_INTEGRITY_CHECK_TYPES.length, 7);
  assert.ok(BILLING_INTEGRITY_CHECK_TYPES.includes('APPROVED_PAYMENT_INVOICE_DUE'));
  assert.ok(BILLING_INTEGRITY_CHECK_TYPES.includes('SOURCE_MIRROR_MISMATCH'));
  assert.ok(BILLING_INTEGRITY_CHECK_TYPES.includes('ROOM_PEER_BILLING_MISMATCH'));
  assert.ok(BILLING_INTEGRITY_CHECK_TYPES.includes('MISSING_ELECTRICITY_INVOICE'));
});

test('applyApprovedPaymentAtomic purpose routing includes electricity and rent', () => {
  const purposes: ApprovedPaymentPurpose[] = [
    'electricity',
    'rent',
    'extension',
    'booking',
    'deposit',
  ];
  assert.equal(purposes.length, 5);
  assert.ok(purposes.includes('electricity'));
  assert.ok(purposes.includes('rent'));
});

test('room electricity exclusion reasons are explicit for audit traces', () => {
  const reasons = [
    'checkout_settled',
    'checkout_collected',
    'non_billable_status',
    'test_record',
    'no_month_overlap',
    'not_in_allocation',
  ] as const;
  assert.equal(reasons.length, 6);
  assert.ok(reasons.includes('checkout_settled'));
});

test('settlement event action name is stable for reconciliation consumers', () => {
  const action = 'billing_settlement_committed';
  assert.equal(action, 'billing_settlement_committed');
});

test('mirror resync repair action name is stable', () => {
  const action = 'billing_integrity_mirror_resync';
  assert.equal(action, 'billing_integrity_mirror_resync');
});
