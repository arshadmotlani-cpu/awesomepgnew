import assert from 'node:assert/strict';
import test from 'node:test';
import { buildActionDeepLink } from '../../src/lib/admin/actionDeepLinks';

test('routes payment reviews to payment-reviews queue', () => {
  const href = buildActionDeepLink('payment_received', { paymentReviewKey: 'rent:abc' }, null);
  assert.ok(href.includes('/admin/operations/payment-reviews'));
  assert.ok(href.includes('rent%3Aabc'));
});

test('routes vacating with settlement to checkout', () => {
  const href = buildActionDeepLink(
    'vacating_alert',
    { settlementId: 'set-1', vacatingRequestId: 'vr-1' },
    null,
  );
  assert.ok(href.includes('/admin/checkout-settlements/set-1'));
});

test('routes kyc to submission workspace', () => {
  const href = buildActionDeepLink('kyc_pending', { submissionId: 'sub-1' }, null);
  assert.ok(href.includes('/admin/residents/kyc/sub-1'));
});
