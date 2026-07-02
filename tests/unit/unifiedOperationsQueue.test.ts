import assert from 'node:assert/strict';
import test from 'node:test';
import { buildUnifiedOpsFilterTags } from '@/src/services/unifiedOperationsQueue';

test('buildUnifiedOpsFilterTags keeps rent_due separate from overdue', () => {
  const rentDue = buildUnifiedOpsFilterTags({ category: 'rent_due' });
  assert.ok(rentDue.includes('rent_due'));
  assert.ok(rentDue.includes('waiting_for_payment'));
  assert.equal(rentDue.includes('overdue'), false);

  const overdue = buildUnifiedOpsFilterTags({ category: 'rent_overdue' });
  assert.ok(overdue.includes('overdue'));
  assert.ok(overdue.includes('rent_due'));
});

test('buildUnifiedOpsFilterTags keeps payment approval separate from waiting for payment', () => {
  const proof = buildUnifiedOpsFilterTags({ category: 'payment_proof' });
  assert.ok(proof.includes('payment_proof'));
  assert.ok(proof.includes('waiting_for_admin_review'));
  assert.equal(proof.includes('waiting_for_payment'), false);
});

test('buildUnifiedOpsFilterTags adds deposit_due and refund chips', () => {
  const deposit = buildUnifiedOpsFilterTags({ category: 'deposit_due' });
  assert.ok(deposit.includes('deposit_due'));
  assert.ok(deposit.includes('waiting_for_payment'));

  const refund = buildUnifiedOpsFilterTags({ category: 'refund' });
  assert.ok(refund.includes('refund'));
  assert.ok(refund.includes('checkout'));

  const moveOutRefund = buildUnifiedOpsFilterTags({
    category: 'move_out',
    primaryActionLabel: 'Open Refund Console',
  });
  assert.ok(moveOutRefund.includes('refund'));
  assert.ok(moveOutRefund.includes('move_out'));
});
