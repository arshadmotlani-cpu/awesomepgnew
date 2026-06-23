import assert from 'node:assert/strict';
import test from 'node:test';
import {
  checkoutRequiresPayout,
  validateDepositRefundSubmission,
} from '../../src/lib/billing/depositRefundRequirements';

test('checkoutRequiresPayout is false when refund is zero', () => {
  assert.equal(checkoutRequiresPayout(0), false);
  assert.equal(checkoutRequiresPayout(-1), false);
  assert.equal(checkoutRequiresPayout(1), true);
});

test('validateDepositRefundSubmission skips UPI when expected refund is zero', () => {
  const result = validateDepositRefundSubmission(
    {
      meterReadingPhotoUrl: 'https://example.com/meter.jpg',
      payoutUpiId: null,
      payoutQrUrl: null,
    },
    { expectedRefundPaise: 0 },
  );
  assert.equal(result.ok, true);
});

test('validateDepositRefundSubmission still requires UPI when refund is positive', () => {
  const result = validateDepositRefundSubmission(
    {
      meterReadingPhotoUrl: 'https://example.com/meter.jpg',
      payoutUpiId: null,
      payoutQrUrl: null,
    },
    { expectedRefundPaise: 50000 },
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.missing.includes('payout_upi_or_qr'));
  }
});

test('Harish B5 scenario: 1500 deposit minus 595 notice minus 905 electricity = zero refund', () => {
  const depositHeldPaise = 150_000;
  const noticePaise = 59_500;
  const electricityPaise = 90_500;
  const finalRefund = Math.max(0, depositHeldPaise - noticePaise - electricityPaise);
  assert.equal(finalRefund, 0);
  assert.equal(checkoutRequiresPayout(finalRefund), false);
});
