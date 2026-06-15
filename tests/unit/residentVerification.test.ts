import assert from 'node:assert/strict';
import test from 'node:test';
import { mapVerificationStatus } from '@/src/lib/residentVerification';

test('mapVerificationStatus prefers kyc over payment', () => {
  const status = mapVerificationStatus({
    is_website_signup: true,
    is_verified: true,
    verified_via_kyc: true,
    verified_via_payment: true,
    has_pending_payment: false,
  });
  assert.equal(status.verificationSource, 'kyc');
  assert.equal(status.isVerified, true);
});

test('mapVerificationStatus marks payment-only verification', () => {
  const status = mapVerificationStatus({
    is_website_signup: true,
    is_verified: true,
    verified_via_kyc: false,
    verified_via_payment: true,
    has_pending_payment: false,
  });
  assert.equal(status.verificationSource, 'payment');
});

test('mapVerificationStatus marks unverified signup', () => {
  const status = mapVerificationStatus({
    is_website_signup: true,
    is_verified: false,
    verified_via_kyc: false,
    verified_via_payment: false,
    has_pending_payment: true,
  });
  assert.equal(status.verificationSource, null);
  assert.equal(status.isVerified, false);
  assert.equal(status.hasPendingPayment, true);
});
