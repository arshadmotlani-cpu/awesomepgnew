import { strict as assert } from 'node:assert';
import test from 'node:test';
import {
  checkoutWorkflowKind,
  isFixedStayDurationMode,
  isMonthlyDurationMode,
  requiresMoveOutApproval,
  usesRefundOnlyCheckout,
} from '../../src/lib/checkout/checkoutWorkflow';

test('checkoutWorkflowKind separates monthly and fixed-stay', () => {
  assert.equal(checkoutWorkflowKind({ durationMode: 'monthly' }), 'monthly');
  assert.equal(checkoutWorkflowKind({ durationMode: 'open_ended' }), 'monthly');
  assert.equal(checkoutWorkflowKind({ durationMode: 'fixed_stay' }), 'fixed_stay');
  assert.equal(checkoutWorkflowKind({ durationMode: 'daily' }), 'fixed_stay');
  assert.equal(checkoutWorkflowKind({ stayType: 'fixed_date_stay' }), 'fixed_stay');
  assert.equal(checkoutWorkflowKind({ stayType: 'monthly_stay' }), 'monthly');
});

test('approval and refund-only flags match business rules', () => {
  assert.equal(requiresMoveOutApproval('monthly'), true);
  assert.equal(requiresMoveOutApproval('fixed_stay'), false);
  assert.equal(usesRefundOnlyCheckout('weekly'), true);
  assert.equal(isMonthlyDurationMode('open_ended'), true);
  assert.equal(isFixedStayDurationMode('daily'), true);
});
