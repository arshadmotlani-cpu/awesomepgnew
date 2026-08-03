import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

test('customer payment pages use API upload instead of admin server action', () => {
  const paths = [
    'app/(customer)/account/resident/pay-rent/[invoiceId]/page.tsx',
    'app/(customer)/booking/[bookingCode]/pay/page.tsx',
    'src/components/customer/account/resident/ResidentPayElectricityPageContent.tsx',
  ];

  for (const rel of paths) {
    const src = readFileSync(join(process.cwd(), rel), 'utf8');
    assert.doesNotMatch(src, /uploadPaymentScreenshotAction/);
  }
});

test('UpiPaymentProofForm defaults to client API upload helper', () => {
  const src = readFileSync(
    join(process.cwd(), 'src/components/customer/UpiPaymentProofForm.tsx'),
    'utf8',
  );
  assert.match(src, /uploadPaymentScreenshotClient/);
  assert.match(src, /uploadScreenshot = uploadPaymentScreenshotClient/);
});
