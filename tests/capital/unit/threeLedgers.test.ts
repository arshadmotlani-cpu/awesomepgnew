import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  computeTviFromCosts,
  remainingPurchaseFromSellerPayments,
  sellerOverpaymentPaise,
  sumSellerPaymentsPaise,
} from '../../../src/capital/lib/threeLedgers';

describe('sumSellerPaymentsPaise', () => {
  it('sums active rows and skips reversed', () => {
    assert.equal(
      sumSellerPaymentsPaise([
        { amountPaise: 100_00 },
        { amountPaise: 50_00, isReversed: true },
        { amountPaise: 25_00 },
      ]),
      125_00,
    );
  });

  it('returns 0 for empty', () => {
    assert.equal(sumSellerPaymentsPaise([]), 0);
  });
});

describe('remainingPurchaseFromSellerPayments', () => {
  it('clamps at zero when overpaid', () => {
    assert.equal(remainingPurchaseFromSellerPayments(100_00, 150_00), 0);
  });

  it('subtracts paid from purchase price', () => {
    assert.equal(remainingPurchaseFromSellerPayments(500_00, 125_00), 375_00);
  });

  it('returns null when purchase price is not set', () => {
    assert.equal(remainingPurchaseFromSellerPayments(0, 959_995_00), null);
    assert.equal(remainingPurchaseFromSellerPayments(-1, 10_00), null);
  });
});

describe('sellerOverpaymentPaise', () => {
  it('reports excess paid over purchase price', () => {
    assert.equal(sellerOverpaymentPaise(900_000_00, 960_000_00), 60_000_00);
    assert.equal(sellerOverpaymentPaise(900_000_00, 900_000_00), 0);
    assert.equal(sellerOverpaymentPaise(0, 10_00), 0);
  });
});

describe('computeTviFromCosts', () => {
  it('adds purchase price and active costs', () => {
    const result = computeTviFromCosts({
      purchasePricePaise: 1_000_00,
      costs: [
        { amountPaise: 50_00 },
        { amountPaise: 10_00, isReversed: true },
        { amountPaise: -5_00 },
      ],
    });
    assert.equal(result.purchasePricePaise, 1_000_00);
    assert.equal(result.costsPaise, 45_00);
    assert.equal(result.totalVehicleInvestmentPaise, 1_045_00);
  });
});
