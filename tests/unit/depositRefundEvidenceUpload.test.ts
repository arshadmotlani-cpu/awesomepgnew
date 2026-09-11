import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

test('DepositRefundRequestForm uses API evidence upload instead of server actions', () => {
  const src = readFileSync(
    join(process.cwd(), 'src/components/customer/account/DepositRefundRequestForm.tsx'),
    'utf8',
  );
  assert.match(src, /uploadDepositRefundEvidenceClient/);
  assert.match(src, /validateProofUploadFile/);
  assert.doesNotMatch(src, /uploadDepositRefundMeterAction/);
  assert.doesNotMatch(src, /uploadDepositRefundQrAction/);
});

test('payment-screenshot API accepts deposit refund evidence upload types', () => {
  const src = readFileSync(
    join(process.cwd(), 'app/api/customer/payment-screenshot/route.ts'),
    'utf8',
  );
  assert.match(src, /meter_photo/);
  assert.match(src, /refund_qr/);
});

test('deposit refund evidence client prepares before upload', () => {
  const src = readFileSync(
    join(process.cwd(), 'src/lib/client/uploadDepositRefundEvidenceClient.ts'),
    'utf8',
  );
  assert.match(src, /prepareProofImageForUpload/);
  assert.match(src, /uploadPaymentScreenshotClient/);
  assert.match(src, /onPhase\?\.\('preparing'\)/);
  assert.match(src, /onPhase\?\.\('uploading'\)/);
});
