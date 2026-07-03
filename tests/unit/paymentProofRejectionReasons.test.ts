import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PAYMENT_PROOF_REJECTION_REASONS,
  buildPaymentRejectionWhatsAppUrl,
  buildResidentRejectionMessage,
  validateRejectionInput,
} from '../../src/lib/approvals/paymentProofRejectionReasons';

test('buildResidentRejectionMessage includes resident name and bill', () => {
  const msg = buildResidentRejectionMessage({
    reasonCode: 'incorrect_screenshot',
    residentName: 'Manju Sharma',
    billLabel: 'Rent · 2026-07',
    amountPaise: 500000,
  });
  assert.ok(msg.includes('Hi Manju'));
  assert.ok(msg.includes('Rent · 2026-07'));
  assert.ok(msg.includes('₹5,000'));
  assert.ok(msg.includes('upload'));
});

test('validateRejectionInput requires other detail', () => {
  const bad = validateRejectionInput({
    reasonCode: 'other',
    residentMessage: 'Please re-upload',
  });
  assert.equal(bad.ok, false);

  const good = validateRejectionInput({
    reasonCode: 'other',
    reasonDetail: 'Amount mismatch on screenshot',
    residentMessage: 'Please re-upload',
  });
  assert.equal(good.ok, true);
});

test('buildPaymentRejectionWhatsAppUrl encodes message', () => {
  const url = buildPaymentRejectionWhatsAppUrl({
    phone: '+919876543210',
    message: 'Hello resident',
  });
  assert.ok(url?.includes('wa.me/919876543210'));
  assert.ok(url?.includes(encodeURIComponent('Hello resident')));
});

test('all rejection reasons have labels and templates', () => {
  assert.equal(PAYMENT_PROOF_REJECTION_REASONS.length, 8);
  for (const r of PAYMENT_PROOF_REJECTION_REASONS) {
    assert.ok(r.label.length > 0);
    assert.ok(r.messageTemplate.length > 20);
  }
});
