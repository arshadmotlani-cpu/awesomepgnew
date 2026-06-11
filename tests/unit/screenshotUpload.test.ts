import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPaymentScreenshotUploadAvailable } from '../../src/lib/payments/screenshotUpload';

test('payment screenshot upload is always available (Cloudinary or compressed data URL fallback)', () => {
  assert.equal(isPaymentScreenshotUploadAvailable(), true);
});
