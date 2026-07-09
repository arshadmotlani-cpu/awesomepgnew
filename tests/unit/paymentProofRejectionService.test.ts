import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

test('rejectPaymentProof clears proof and writes rejection row', () => {
  const src = readFileSync(
    join(process.cwd(), 'src/services/paymentProofRejectionService.ts'),
    'utf8',
  );

  assert.match(src, /async function clearEntityProof/);
  assert.match(src, /insert\(paymentProofRejections\)/);
  assert.match(src, /rejectPaymentProof[\s\S]*db\.transaction/);
  assert.match(src, /writeAuditLogNonBlocking/);
  assert.match(src, /scheduleAdminNotificationSync/);
  assert.match(src, /supersedeActiveRejection/);
});

test('booking QR rejection cancels holds and booking via cleanupRejectedBookingRequest', () => {
  const service = readFileSync(
    join(process.cwd(), 'src/services/paymentProofRejectionService.ts'),
    'utf8',
  );
  const qr = readFileSync(join(process.cwd(), 'src/services/qrPayments.ts'), 'utf8');

  assert.match(service, /case 'pg_payment_record':[\s\S]*paymentScreenshotUrl: null/);
  assert.match(service, /status: 'pending'/);
  assert.match(service, /cleanupRejectedBookingRequest/);
  assert.doesNotMatch(service, /finalizeStaleBookingPaymentReview/);

  const rejectBlock = qr.slice(
    qr.indexOf("if (status === 'rejected')"),
    qr.indexOf('await db', qr.indexOf("if (status === 'rejected')")),
  );
  assert.match(rejectBlock, /rejectPaymentProof/);
  assert.doesNotMatch(rejectBlock, /cleanupRejectedBookingRequest/);
});

test('submit paths supersede active rejections on re-upload', () => {
  for (const file of [
    'src/services/rentInvoices.ts',
    'src/services/meterElectricity.ts',
    'src/services/residentCharges.ts',
    'src/services/extension.ts',
    'src/services/qrPayments.ts',
  ]) {
    const src = readFileSync(join(process.cwd(), file), 'utf8');
    assert.match(
      src,
      /supersedeActiveRejection/,
      `${file} should supersede rejection on new proof upload`,
    );
  }
});
