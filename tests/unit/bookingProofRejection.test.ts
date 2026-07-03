import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

test('reviewPaymentRecord rejected status routes to SSOT instead of cancelling booking', () => {
  const src = readFileSync(join(process.cwd(), 'src/services/qrPayments.ts'), 'utf8');

  assert.doesNotMatch(src, /cleanupRejectedBookingRequest/);

  const rejectGuard = src.slice(
    src.indexOf("if (status === 'rejected')"),
    src.indexOf('await db', src.indexOf("if (status === 'rejected')")),
  );
  assert.match(rejectGuard, /rejectPaymentProof/);
  assert.match(rejectGuard, /booking stays active/);
});

test('submitBookingPaymentRecord updates cleared pending record on re-upload', () => {
  const src = readFileSync(join(process.cwd(), 'src/services/qrPayments.ts'), 'utf8');
  const fn = src.slice(src.indexOf('export async function submitBookingPaymentRecord'));
  const nextFn = fn.indexOf('\nexport async function getPendingBookingPaymentRecord');
  const body = fn.slice(0, nextFn);

  assert.match(body, /if \(dup\?\.paymentScreenshotUrl\?\.trim\(\)\)/);
  assert.match(body, /update\(pgPaymentRecords\)/);
  assert.match(body, /supersedeActiveRejection\('pg_payment_record'/);
});

test('paymentProofRejectionService pg_payment_record handler clears screenshot only', () => {
  const src = readFileSync(
    join(process.cwd(), 'src/services/paymentProofRejectionService.ts'),
    'utf8',
  );
  const block = src.slice(
    src.indexOf("case 'pg_payment_record':"),
    src.indexOf('default:', src.indexOf("case 'pg_payment_record':")),
  );

  assert.match(block, /paymentScreenshotUrl: null/);
  assert.match(block, /status: 'pending'/);
  assert.doesNotMatch(block, /cleanupRejectedBookingRequest/);
  assert.doesNotMatch(block, /cancelled/);
});
