import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CHECKOUT_COMPLETE_LOADING_LABEL,
  CHECKOUT_COMPLETE_SUCCESS_MESSAGE,
  isCheckoutCompleteSuccessMessage,
} from '@/src/components/admin/checkout/checkoutCompleteUi';

test('checkout complete UI copy is stable', () => {
  assert.equal(CHECKOUT_COMPLETE_SUCCESS_MESSAGE, 'Checkout completed successfully.');
  assert.equal(CHECKOUT_COMPLETE_LOADING_LABEL, 'Completing checkout...');
  assert.equal(isCheckoutCompleteSuccessMessage(CHECKOUT_COMPLETE_SUCCESS_MESSAGE), true);
  assert.equal(isCheckoutCompleteSuccessMessage('other'), false);
});
