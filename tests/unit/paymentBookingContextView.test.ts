import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { buildPaymentBookingContext } from '../../src/lib/operations/paymentBookingContextView';

describe('buildPaymentBookingContext', () => {
  test('fixed stay weekly booking shows pricing rule and deposit policy', () => {
    const context = buildPaymentBookingContext(
      {
        kind: 'qr',
        pgName: 'Awesome PG B5',
        bookingCode: 'APG-2026-0036',
        roomNumber: '201',
        bedCode: 'B2',
        paymentTypeLabel: 'New booking',
        subtitle: 'Booking checkout',
        amountPaise: 268_500,
        bookingPaymentReview: {
          bookingCode: 'APG-2026-0036',
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
      },
      {
        moveInDate: '2026-06-23',
        moveOutDate: '2026-06-30',
        durationMode: 'fixed_stay',
        stayType: 'fixed_date_stay',
        bookingStatus: 'pending_payment',
        subtotalPaise: 190_000,
        discountPaise: 0,
        depositRequiredPaise: 95_000,
        rentDuePaise: 190_000,
        pricingSnapshot: {
          perBed: [
            {
              bedId: 'bed-1',
              dailyRatePaise: 0,
              weeklyRatePaise: 190_000,
              monthlyRatePaise: 0,
              securityDepositPaise: 95_000,
              durationMode: 'weekly',
              units: 1,
              lineTotalPaise: 190_000,
            },
          ],
          computedAt: '2026-06-20T00:00:00.000Z',
          rentLineItems: [
            {
              kind: 'weekly_cycle',
              description: '1 week',
              units: 1,
              unitPricePaise: 190_000,
              amountPaise: 190_000,
            },
          ],
        },
        rentLineItems: [
          {
            kind: 'weekly_cycle',
            description: '1 week',
            units: 1,
            unitPricePaise: 190_000,
            amountPaise: 190_000,
          },
        ],
      },
    );

    assert.equal(context.bookingType, 'Fixed Stay');
    assert.equal(context.pricingRule, 'Weekly');
    assert.equal(context.duration, '7 nights');
    assert.equal(context.depositPolicy, '50% deposit required');
    assert.equal(context.requiredDepositPaise, 95_000);
    assert.equal(context.rentAmountPaise, 190_000);
    assert.match(context.rentCalculation ?? '', /1 week/);
  });
});
