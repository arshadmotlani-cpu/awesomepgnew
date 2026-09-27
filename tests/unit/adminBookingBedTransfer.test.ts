import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

test('applyResidentBedTransfer preserves fixed-stay checkout on new reservation', () => {
  const src = readFileSync(
    join(process.cwd(), 'src/services/roomTransferTenancy.ts'),
    'utf8',
  );
  assert.match(src, /expectedCheckoutDate: bookings\.expectedCheckoutDate/);
  assert.match(src, /stayRangeExclusiveEnd/);
  assert.match(src, /preservePricingSnapshot/);
  assert.match(src, /newStayExclusiveEnd/);
});

test('admin booking bed transfer uses applyResidentBedTransfer SSOT', () => {
  const src = readFileSync(
    join(process.cwd(), 'src/services/adminBookingBedTransfer.ts'),
    'utf8',
  );
  assert.match(src, /applyResidentBedTransfer/);
  assert.match(src, /getRoomConfigurationEffectiveOn/);
  assert.match(src, /preservePricingSnapshot/);
});
