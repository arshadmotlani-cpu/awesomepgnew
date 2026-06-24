import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { buildBookingPaymentExplanation } from '../../src/lib/operations/paymentExplanationView';

describe('buildBookingPaymentExplanation', () => {
  test('explains new booking + prior outstanding + full settlement', () => {
    const view = buildBookingPaymentExplanation({
      review: {
        bookingCode: 'APG-2026-0033',
        bookingTotalDuePaise: 268_500,
        amountSubmittedPaise: 268_500,
        rentDuePaise: 190_000,
        depositCashDuePaise: 62_000,
        rentPaisePaid: 190_000,
        depositPaisePaid: 62_000,
        depositDuePaise: 0,
        isFullPayment: true,
        canPartialApprove: false,
      },
      depositRequiredPaise: 95_000,
      depositCreditAppliedPaise: 33_000,
      depositCreditSourceBookingId: 'prior-32',
      depositCreditSourceBookingCode: 'APG-2026-0032',
      priorOutstandingItems: [
        {
          label: 'Deposit due',
          amountPaise: 16_500,
          bookingId: 'prior-31',
          bookingCode: 'APG-2026-0031',
          kind: 'deposit',
        },
      ],
      priorBookingDeposits: [
        {
          bookingId: 'prior-32',
          bookingCode: 'APG-2026-0032',
          refundablePaise: 33_000,
          status: 'pending_refund',
          statusLabel: 'Pending refund',
        },
      ],
    });

    assert.equal(view.newBookingLines[0].label, 'Rent for stay');
    assert.equal(view.newBookingLines[0].amountPaise, 190_000);
    assert.equal(view.newBookingLines[1].label, 'Required deposit (50%)');
    assert.equal(view.newBookingLines[1].amountPaise, 95_000);
    assert.equal(view.calculationLines[0].amountPaise, 252_000);
    assert.equal(view.calculationLines[1].amountPaise, 16_500);
    assert.equal(view.totalExpectedPaise, 268_500);
    assert.equal(view.resultLabel, '✓ Fully settled');
    assert.equal(view.afterApproval?.rentCollectedPaise, 190_000);
    assert.equal(view.afterApproval?.depositCollectedPaise, 62_000);
    assert.equal(view.afterApproval?.previousBalanceCollectedPaise, 16_500);
    assert.equal(view.afterApproval?.remainingDepositLiabilityPaise, 33_000);
    assert.equal(view.financialTrace.length, 2);
  });
});
