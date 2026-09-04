import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { parseReservationStayRangeStart } from '@/src/lib/dates';
import { buildPaymentReviewVerification } from '@/src/lib/operations/paymentReviewVerification';
import type { PendingPaymentReviewItem } from '@/src/lib/operations/paymentReviewTypes';
import {
  transactionRefLooksLikeUpiVpa,
  userFacingPaymentApprovalError,
} from '@/src/lib/payments/safePaymentApprovalError';
import {
  depositLinkLedgerReason,
  invoiceDepositLedgerReason,
  parsePaymentsRelatedId,
} from '@/src/lib/payments/paymentsRelatedId';
import { approvedTransactionRefConflictMessage, isApprovedTransactionRefUniqueViolation } from '@/src/lib/payments/transactionRefDuplicate';
import { evaluatePaymentReviewInvariants } from '@/src/lib/payments/paymentReviewInvariants';
import { ROOM_SHIFT_FEE_PAISE, applyRoomShiftCreditWaterfall } from '@/src/services/roomShiftQuote';
import { renderAutomationTemplate } from '@/src/lib/automation/templates';

function depositItem(
  overrides: Partial<PendingPaymentReviewItem> = {},
): PendingPaymentReviewItem {
  return {
    key: 'deposit-link-1',
    kind: 'deposit_link',
    pgId: 'pg-1',
    pgName: 'Test PG',
    residentName: 'Resident',
    phone: null,
    bookingCode: 'APG-2026-0021',
    roomNumber: '204',
    bedCode: 'B1',
    paymentTypeLabel: 'Deposit collection',
    title: 'Additional deposit',
    subtitle: 'Additional security deposit',
    screenshotUrl: '',
    entityId: 'link-1',
    customerId: 'c-1',
    bookingId: 'b-1',
    expectedLines: [{ label: 'Additional deposit', amountPaise: 321_140 }],
    expectedTotalPaise: 321_140,
    amountPaise: 321_140,
    receivedPaise: null,
    outstandingAfterApprovalPaise: 0,
    overpaidPaise: 0,
    outstandingSummary: null,
    canPartialApprove: false,
    canReject: true,
    ...overrides,
  };
}

describe('payment review deposit + room-change', () => {
  test('unquoted postgres daterange parses move-in', () => {
    assert.equal(parseReservationStayRangeStart('[2026-06-01,)'), '2026-06-01');
    assert.equal(parseReservationStayRangeStart('["2026-06-12","2026-07-01")'), '2026-06-12');
    assert.equal(parseReservationStayRangeStart({ lower: '2026-06-01' }), '2026-06-01');
    assert.equal(parseReservationStayRangeStart(null), null);
  });

  test('deposit review shows booking rent/deposit, expected stays link amount', () => {
    const item = depositItem();
    const v = buildPaymentReviewVerification(item, {
      monthlyRentPaise: 408_000,
      depositRequiredPaise: 721_140,
    });
    assert.equal(v.monthlyRentPaise, 408_000);
    assert.equal(v.depositRequiredPaise, 721_140);
    assert.equal(v.expectedPaymentPaise, 321_140);
    assert.equal(v.screenshotAmountPaise, 321_140);
    assert.equal(v.differenceTone, 'exact');
  });

  test('missing booking context uses expected deposit line, not fake rent', () => {
    const item = depositItem();
    const v = buildPaymentReviewVerification(item, null);
    assert.equal(v.expectedPaymentPaise, 321_140);
    assert.equal(v.monthlyRentPaise, 0);
    assert.equal(v.depositRequiredPaise, 321_140);
  });

  test('3-sharing → 1-sharing waterfall matches APG-2026-0021 total with fee payable', () => {
    const waterfall = applyRoomShiftCreditWaterfall({
      oldRentDuePaise: 0,
      newRentChargePaise: 23_262,
      shiftFeePaise: ROOM_SHIFT_FEE_PAISE,
      depositTopUpPaise: 321_140,
      unusedPrepaidCreditPaise: 13_161,
    });
    assert.equal(waterfall.feeDuePaise, ROOM_SHIFT_FEE_PAISE);
    assert.equal(waterfall.newRentDuePaise, 10_101);
    assert.equal(waterfall.depositDuePaise, 321_140);
    assert.equal(waterfall.totalDuePaise, 340_241);
  });

  test('deposit link provider id is not a payments UUID', () => {
    const linkId = '0d3e7d24-c6b7-474a-ac39-80f7e70e2990';
    const providerId = `deposit-link-proof-${linkId}`;
    assert.equal(parsePaymentsRelatedId(providerId), null);
    assert.equal(depositLinkLedgerReason(linkId), `deposit-link:${linkId}`);
    assert.equal(
      invoiceDepositLedgerReason('b-1', 'req-1'),
      'invoice-deposit:b-1:req-1',
    );
    assert.equal(parsePaymentsRelatedId(linkId), linkId);
  });

  test('database uuid errors map to safe approval message', () => {
    const msg = userFacingPaymentApprovalError(
      new Error('invalid input syntax for type uuid: "deposit-link-proof-abc"'),
    );
    assert.equal(msg, 'Payment could not be recorded. Please try again.');
    assert.equal(msg.includes('uuid'), false);
  });

  test('UPI VPA is detected separately from UTR', () => {
    assert.equal(transactionRefLooksLikeUpiVpa('name@oksbi'), true);
    assert.equal(transactionRefLooksLikeUpiVpa('ABC123XYZ456'), false);
    assert.equal(transactionRefLooksLikeUpiVpa(null), false);
  });

  test('orphaned UTR lock — Drizzle-wrapped 23505 is detected', () => {
    const wrapped = Object.assign(new Error('Failed query'), {
      cause: {
        code: '23505',
        constraint: 'pg_approved_transaction_refs_pkey',
        message: 'duplicate key value violates unique constraint',
      },
    });
    assert.equal(isApprovedTransactionRefUniqueViolation(wrapped), true);
  });

  test('approval error never includes SQL', () => {
    const msg = userFacingPaymentApprovalError(
      new Error('PostgreSQL 23505 — duplicate key value violates unique constraint pg_approved'),
    );
    assert.equal(msg.includes('PostgreSQL'), false);
    assert.equal(msg.includes('constraint'), false);
    assert.equal(
      userFacingPaymentApprovalError(new Error(approvedTransactionRefConflictMessage())),
      approvedTransactionRefConflictMessage(),
    );
  });

  test('bigint expected amount does not throw invariants', () => {
    const result = evaluatePaymentReviewInvariants({
      kind: 'deposit_link',
      invoiceId: 'link-1',
      customerId: 'c-1',
      bookingId: 'b-1',
      billingMonth: null,
      expectedAmountPaise: 321140 as unknown as number,
      proofAmountPaise: 321140,
      paymentProofUrl: null,
      transactionRef: 'ABC123XYZ456',
      status: 'active',
      bookingStatus: 'confirmed',
    });
    assert.equal(result.ok, true);
  });

  test('deposit notification copy includes verified amount', () => {
    const rendered = renderAutomationTemplate('deposit_collection_received', {
      name: 'Rishik',
      pgName: 'Shantinagar',
      amountPaise: 321_140,
    });
    assert.match(rendered.body, /verified and approved/i);
    assert.match(rendered.body, /₹3,211/);
  });
});
