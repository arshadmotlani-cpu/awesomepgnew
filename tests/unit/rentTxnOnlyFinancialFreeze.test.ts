/**
 * Transaction-ID-only financial freeze — rent approval eligibility (APG-2026-0096 class).
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { hasFrozenFinancialProof } from '@/src/lib/payments/paymentProofModel';
import {
  evaluatePaymentReviewInvariants,
} from '@/src/lib/payments/paymentReviewInvariants';
import { approvedTransactionRefConflictMessage } from '@/src/lib/payments/transactionRefDuplicate';
import { rentProofApprovalAmountPaise } from '@/src/services/rentInvoices';

const base = {
  id: 'inv-1',
  bookingId: 'bk-1',
  customerId: 'cust-1',
  pgId: 'pg-1',
  bedId: 'bed-1',
  invoiceNumber: 'RNT-2026-09-0014',
  billingMonth: '2026-09-01',
  dueDate: '2026-09-05',
  rentPaise: 412_080,
  discountPaise: 0,
  paidPrincipalPaise: 0,
  paidLateFeePaise: 0,
  status: 'payment_in_progress' as const,
  proofSubmittedAt: new Date('2026-08-31T18:42:41.102Z'),
  proofSnapshotOutstandingPaise: 412_080,
  proofSnapshotLateFeePaise: 0,
  proofSnapshotPrincipalDuePaise: 412_080,
};

describe('rent txn-only financial freeze SSOT', () => {
  test('A — txn + snapshot metadata, no screenshot → approval amount eligible', () => {
    const invoice = {
      ...base,
      paymentProofUrl: null,
      paymentProofTransactionRef: '624462640131',
    };
    assert.equal(hasFrozenFinancialProof(invoice), true);
    assert.equal(rentProofApprovalAmountPaise(invoice), 412_080);
  });

  test('B — txn + screenshot + snapshot → approval eligible', () => {
    const invoice = {
      ...base,
      paymentProofUrl: 'https://blob.example/proof.jpg',
      paymentProofTransactionRef: '624462640131',
    };
    assert.equal(hasFrozenFinancialProof(invoice), true);
    assert.equal(rentProofApprovalAmountPaise(invoice), 412_080);
  });

  test('C — screenshot only without txn → not frozen / not approvable', () => {
    const invoice = {
      ...base,
      paymentProofUrl: 'https://blob.example/proof.jpg',
      paymentProofTransactionRef: null,
    };
    assert.equal(hasFrozenFinancialProof(invoice), false);
    assert.equal(rentProofApprovalAmountPaise(invoice), null);
  });

  test('D — missing transaction ID → approval blocked', () => {
    const invoice = {
      ...base,
      paymentProofUrl: null,
      paymentProofTransactionRef: null,
    };
    assert.equal(hasFrozenFinancialProof(invoice), false);
    const invariant = evaluatePaymentReviewInvariants({
      kind: 'rent',
      invoiceId: base.id,
      customerId: base.customerId,
      bookingId: base.bookingId,
      billingMonth: base.billingMonth,
      expectedAmountPaise: 412_080,
      proofAmountPaise: 412_080,
      paymentProofUrl: null,
      transactionRef: null,
      status: 'payment_in_progress',
      bookingStatus: 'confirmed',
      duplicatePendingScreenshot: false,
    });
    assert.equal(invariant.ok, false);
    assert.ok(invariant.violations.some((v) => v.code === 'MISSING_PROOF'));
  });

  test('E — duplicate UTR conflict message is explicit', () => {
    assert.match(approvedTransactionRefConflictMessage(), /already approved/i);
  });

  test('F — txn present but proof amount mismatch → invariant blocks', () => {
    const invariant = evaluatePaymentReviewInvariants({
      kind: 'rent',
      invoiceId: base.id,
      customerId: base.customerId,
      bookingId: base.bookingId,
      billingMonth: base.billingMonth,
      expectedAmountPaise: 412_080,
      proofAmountPaise: 100_00,
      paymentProofUrl: null,
      transactionRef: '624462640131',
      status: 'payment_in_progress',
      bookingStatus: 'confirmed',
      duplicatePendingScreenshot: false,
    });
    assert.equal(invariant.ok, false);
    assert.ok(invariant.violations.some((v) => v.code === 'AMOUNT_MISMATCH'));
  });

  test('G — frozen amount unchanged on repeat read (idempotent approval amount)', () => {
    const invoice = {
      ...base,
      paymentProofUrl: null,
      paymentProofTransactionRef: '624462640131',
    };
    assert.equal(rentProofApprovalAmountPaise(invoice), 412_080);
    assert.equal(rentProofApprovalAmountPaise(invoice), 412_080);
  });

  test('reproduces APG-2026-0096 payment_in_progress txn-only row shape', () => {
    const apg0096Shape = {
      ...base,
      paymentProofUrl: null,
      paymentProofTransactionRef: '624462640131',
      proofSnapshotOutstandingPaise: 412_080,
      proofSnapshotPrincipalDuePaise: 412_080,
      proofSnapshotLateFeePaise: 0,
    };
    assert.equal(hasFrozenFinancialProof(apg0096Shape), true);
    assert.equal(rentProofApprovalAmountPaise(apg0096Shape), 412_080);
  });
});
