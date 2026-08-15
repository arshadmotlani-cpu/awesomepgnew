import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  checkoutRequiresPayout,
  getDepositRefundValidationMessage,
  hasMeterEvidence,
  hasPayoutMethod,
  hasPayoutQr,
  validateDepositRefundSubmission,
} from '../../src/lib/billing/depositRefundRequirements';

describe('depositRefundRequirements', () => {
  it('1 — requires meter photo', () => {
    assert.equal(hasMeterEvidence({}), false);
    assert.equal(hasMeterEvidence({ meterReadingPhotoUrl: 'https://x/m.jpg' }), true);
  });

  it('2 — requires QR image, not UPI ID alone', () => {
    assert.equal(hasPayoutQr({}), false);
    assert.equal(hasPayoutQr({ payoutUpiId: 'user@upi' }), false);
    assert.equal(hasPayoutQr({ payoutQrUrl: 'https://x/qr.png' }), true);
    assert.equal(hasPayoutMethod({ payoutUpiId: 'user@upi' }), false);
    assert.equal(hasPayoutMethod({ payoutQrUrl: 'https://x/qr.png' }), true);
  });

  it('3 — missing both shows combined message', () => {
    const message = getDepositRefundValidationMessage({}, { expectedRefundPaise: 50000 });
    assert.equal(message, 'Please upload your meter photo and QR image to continue.');
  });

  it('4 — missing meter only', () => {
    const message = getDepositRefundValidationMessage(
      { payoutQrUrl: 'https://x/qr.png' },
      { expectedRefundPaise: 50000 },
    );
    assert.equal(message, 'Meter photo is required.');
  });

  it('5 — missing QR only', () => {
    const message = getDepositRefundValidationMessage(
      { meterReadingPhotoUrl: 'https://x/m.jpg' },
      { expectedRefundPaise: 50000 },
    );
    assert.equal(message, 'QR image is required.');
  });

  it('6 — validates complete submission without UPI', () => {
    const ok = validateDepositRefundSubmission({
      meterReadingPhotoUrl: 'https://x/m.jpg',
      payoutQrUrl: 'https://x/qr.png',
    });
    assert.deepEqual(ok, { ok: true });

    const missingMeter = validateDepositRefundSubmission({ payoutQrUrl: 'https://x/qr.png' });
    assert.equal(missingMeter.ok, false);
    if (!missingMeter.ok) {
      assert.ok(missingMeter.missing.includes('meter_reading_photo'));
    }

    const missingPayout = validateDepositRefundSubmission({
      meterReadingPhotoUrl: 'https://x/m.jpg',
    });
    assert.equal(missingPayout.ok, false);
    if (!missingPayout.ok) {
      assert.ok(missingPayout.missing.includes('payout_qr'));
    }

    const upiOnly = validateDepositRefundSubmission({
      meterReadingPhotoUrl: 'https://x/m.jpg',
      payoutUpiId: 'user@upi',
    });
    assert.equal(upiOnly.ok, false);
    if (!upiOnly.ok) {
      assert.ok(upiOnly.missing.includes('payout_qr'));
    }
  });

  it('zero refund checkout skips QR requirement', () => {
    assert.equal(checkoutRequiresPayout(0), false);
    const result = validateDepositRefundSubmission(
      {
        meterReadingPhotoUrl: 'https://example.com/meter.jpg',
      },
      { expectedRefundPaise: 0 },
    );
    assert.equal(result.ok, true);
  });
});
