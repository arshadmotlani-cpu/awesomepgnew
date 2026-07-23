import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  hasMeterEvidence,
  hasPayoutMethod,
  validateDepositRefundSubmission,
} from '../../src/lib/billing/depositRefundRequirements';

describe('depositRefundRequirements', () => {
  it('requires meter photo', () => {
    assert.equal(hasMeterEvidence({}), false);
    assert.equal(hasMeterEvidence({ meterReadingPhotoUrl: 'https://x/m.jpg' }), true);
  });

  it('requires UPI ID or QR code', () => {
    assert.equal(hasPayoutMethod({}), false);
    assert.equal(hasPayoutMethod({ payoutUpiId: 'user@upi' }), true);
    assert.equal(hasPayoutMethod({ payoutQrUrl: 'https://x/qr.png' }), true);
  });

  it('validates complete submission', () => {
    const ok = validateDepositRefundSubmission({
      meterReadingPhotoUrl: 'https://x/m.jpg',
      payoutUpiId: 'user@upi',
    });
    assert.deepEqual(ok, { ok: true });

    const missingMeter = validateDepositRefundSubmission({ payoutUpiId: 'user@upi' });
    assert.equal(missingMeter.ok, false);
    if (!missingMeter.ok) {
      assert.ok(missingMeter.missing.includes('meter_reading_photo'));
    }

    const missingPayout = validateDepositRefundSubmission({
      meterReadingPhotoUrl: 'https://x/m.jpg',
    });
    assert.equal(missingPayout.ok, false);
    if (!missingPayout.ok) {
      assert.ok(missingPayout.missing.includes('payout_upi_or_qr'));
    }
  });
});
