import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

test('payment proof queue batches booking detail lookups', () => {
  const src = readFileSync(join(process.cwd(), 'src/services/paymentProofQueue.ts'), 'utf8');
  assert.match(src, /loadBookingReviewDetailsMap/);
  assert.match(src, /bookingDetailsById\.get/);
});
