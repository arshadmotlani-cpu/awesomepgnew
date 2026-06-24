import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { buildBookingPaymentExplanation } from '../../src/lib/operations/paymentExplanationView';

describe('buildBookingPaymentExplanation', () => {
  test('deposit calculation and calculation lines reconcile to total expected', () => {
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

    assert.equal(view.newBookingLines[0]?.label, 'Rent for stay');
    assert.equal(view.newBookingLines[0]?.amountPaise, 190_000);

    assert.equal(view.depositCalculationLines[0]?.label, 'Deposit required for booking');
    assert.equal(view.depositCalculationLines[0]?.amountPaise, 95_000);
    assert.equal(view.depositCalculationLines[1]?.label, 'Less refundable deposit available');
    assert.equal(view.depositCalculationLines[1]?.amountPaise, 33_000);
    assert.equal(view.depositCalculationLines[1]?.bookingCode, 'APG-2026-0032');
    assert.equal(view.depositCalculationLines[2]?.label, 'Deposit due now');
    assert.equal(view.depositCalculationLines[2]?.amountPaise, 62_000);
    assert.equal(view.depositCalculationLines[3]?.label, 'Outstanding balance from previous booking');
    assert.equal(view.depositCalculationLines[3]?.amountPaise, 16_500);

    assert.deepEqual(
      view.calculationLines.map((line) => line.label),
      ['Rent', 'Deposit due now', 'Previous outstanding'],
    );
    assert.equal(view.calculationLines[0]?.amountPaise, 190_000);
    assert.equal(view.calculationLines[1]?.amountPaise, 62_000);
    assert.equal(view.calculationLines[2]?.amountPaise, 16_500);

    const arithmeticTotal = view.calculationLines.reduce(
      (sum, line) => sum + line.amountPaise,
      0,
    );
    assert.equal(arithmeticTotal, 268_500);
    assert.equal(view.totalExpectedPaise, 268_500);
    assert.equal(view.resultLabel, '✓ Fully settled');

    assert.equal(view.netDepositPosition?.refundableDepositsPaise, 33_000);
    assert.equal(view.netDepositPosition?.outstandingDepositsPaise, 16_500);
    assert.equal(view.netDepositPosition?.netLabel, '+₹165 refundable');

    assert.equal(view.afterApproval?.rentCollectedPaise, 190_000);
    assert.equal(view.afterApproval?.depositCollectedPaise, 62_000);
    assert.equal(view.afterApproval?.previousBalanceCollectedPaise, 16_500);
    assert.equal(view.financialTrace.length, 2);
  });

  test('simple checkout without prior bookings uses rent + deposit only', () => {
    const view = buildBookingPaymentExplanation({
      review: {
        bookingCode: 'APG-2026-0100',
        bookingTotalDuePaise: 285_000,
        amountSubmittedPaise: 285_000,
        rentDuePaise: 190_000,
        depositCashDuePaise: 95_000,
        rentPaisePaid: 190_000,
        depositPaisePaid: 95_000,
        depositDuePaise: 0,
        isFullPayment: true,
        canPartialApprove: false,
      },
      depositRequiredPaise: 95_000,
      depositCreditAppliedPaise: 0,
      priorOutstandingItems: [],
      priorBookingDeposits: [],
    });

    assert.deepEqual(
      view.calculationLines.map((line) => [line.label, line.amountPaise]),
      [
        ['Rent', 190_000],
        ['Deposit due now', 95_000],
      ],
    );
    assert.equal(
      view.calculationLines.reduce((s, line) => s + line.amountPaise, 0),
      view.totalExpectedPaise,
    );
    assert.equal(view.netDepositPosition, null);
  });
});
