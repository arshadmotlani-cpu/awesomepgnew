import assert from 'node:assert/strict';
import test from 'node:test';
import { paiseToInr } from '@/src/lib/format';
import {
  buildBookingPaymentVerificationAudit,
  expectedContractPaiseFromBooking,
  formatVerificationDifferencePaise,
  screenshotAmountPaiseFromProofRecord,
} from '@/src/lib/billing/bookingPaymentVerificationAudit';

test('expectedContractPaiseFromBooking is rent plus deposit only', () => {
  assert.equal(
    expectedContractPaiseFromBooking({
      subtotalPaise: 412_100,
      discountPaise: 0,
      depositPaise: 412_100,
      pricingSnapshot: null,
    }),
    824_200,
  );
});

test('screenshotAmountPaiseFromProofRecord prefers frozen submit snapshot', () => {
  assert.equal(
    screenshotAmountPaiseFromProofRecord({
      proofSnapshotSubmittedPaise: 618_000,
      confirmedAmountPaise: 618_000,
      amountPaise: 1_236_200,
    }),
    618_000,
  );
});

test('formatVerificationDifferencePaise shows shortfall as positive rupees', () => {
  const diff = formatVerificationDifferencePaise(824_200, 618_000);
  assert.equal(diff.differencePaise, 206_200);
  assert.equal(diff.differenceLabel, paiseToInr(206_200));
});

test('buildBookingPaymentVerificationAudit assembles approved audit row', () => {
  const audit = buildBookingPaymentVerificationAudit({
    recordId: 'rec-1',
    status: 'approved',
    booking: {
      subtotalPaise: 412_100,
      discountPaise: 0,
      depositPaise: 412_100,
      pricingSnapshot: null,
    },
    proofRecord: {
      proofSnapshotSubmittedPaise: 618_000,
      confirmedAmountPaise: 618_000,
      amountPaise: 618_000,
      paymentScreenshotUrl: 'https://example.com/proof.jpg',
    },
  });

  assert.ok(audit);
  assert.equal(audit?.status, 'approved');
  assert.equal(audit?.expectedContractPaise, 824_200);
  assert.equal(audit?.screenshotAmountPaise, 618_000);
  assert.equal(audit?.hasScreenshot, true);
});
