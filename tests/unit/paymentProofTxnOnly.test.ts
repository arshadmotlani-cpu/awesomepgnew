import assert from 'node:assert/strict';
import test from 'node:test';
import {
  paymentProofFinancialFreezeMissingMessage,
  paymentProofIncompleteMessage,
  paymentProofScreenshotNotRequiredNote,
  paymentProofTxnOnlyLabel,
} from '@/src/lib/payments/paymentProofModel';
import { hasTxnOrScreenshotProof } from '@/src/services/pgTransactionRefIndex';
import { isPaymentRecordEligibleForReview } from '@/src/lib/operations/paymentReviewSsot';

test('txn-only proof model copy', () => {
  assert.match(paymentProofTxnOnlyLabel(), /Transaction ID/i);
  assert.match(paymentProofScreenshotNotRequiredNote(), /not required/i);
  assert.match(paymentProofIncompleteMessage(), /transaction ID/i);
  assert.match(paymentProofFinancialFreezeMissingMessage(), /resubmit/i);
  assert.doesNotMatch(paymentProofFinancialFreezeMissingMessage(), /screenshot/i);
});

test('hasTxnOrScreenshotProof accepts txn without screenshot', () => {
  assert.equal(
    hasTxnOrScreenshotProof({ transactionRef: '624346908874', paymentProofUrl: null }),
    true,
  );
  assert.equal(hasTxnOrScreenshotProof({ transactionRef: null, paymentProofUrl: null }), false);
});

test('pending booking QR record with txn only is eligible for review', () => {
  assert.equal(isPaymentRecordEligibleForReview('pending', true), true);
  assert.equal(isPaymentRecordEligibleForReview('pending', false), false);
});
