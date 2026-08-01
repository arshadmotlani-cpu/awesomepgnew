import test from 'node:test';
import assert from 'node:assert/strict';
import { formatPaymentModeLabel } from '@/src/lib/billing/paymentModeLabels';
import {
  isCancelledResidentInvoiceStatus,
  isVisibleResidentInvoiceStatus,
} from '@/src/lib/residents/residentPortalDisplay';

test('formatPaymentModeLabel maps resident-facing payment modes', () => {
  assert.equal(formatPaymentModeLabel('upi_manual'), 'UPI');
  assert.equal(formatPaymentModeLabel('cash'), 'Cash');
  assert.equal(formatPaymentModeLabel('bank_transfer'), 'Bank transfer');
  assert.equal(formatPaymentModeLabel('razorpay'), 'UPI');
});

test('resident invoice visibility hides cancelled by default', () => {
  assert.equal(isCancelledResidentInvoiceStatus('cancelled'), true);
  assert.equal(isVisibleResidentInvoiceStatus('cancelled'), false);
  assert.equal(isVisibleResidentInvoiceStatus('paid'), true);
  assert.equal(isVisibleResidentInvoiceStatus('partial'), true);
  assert.equal(isVisibleResidentInvoiceStatus('pending'), true);
});
