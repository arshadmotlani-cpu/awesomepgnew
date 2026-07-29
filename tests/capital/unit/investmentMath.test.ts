import assert from 'node:assert/strict';
import test from 'node:test';
import {
  computeBudgetRemaining,
  computeCurrentInvestment,
  computeGrossDealProfit,
  remainingToSeller,
  splitDealProfit,
} from '../../../src/capital/lib/investmentMath';

test('investmentMath SSOT', async (t) => {
  await t.test('computes current investment = seller + costs − refunds', () => {
    const r = computeCurrentInvestment({
      sellerPricePaise: 1_000_000_00,
      costs: [
        { amountPaise: 50_000_00 },
        { amountPaise: -10_000_00, isRefund: true },
      ],
    });
    assert.equal(r.currentInvestmentPaise, 1_040_000_00);
    assert.equal(r.costsPaise, 50_000_00);
    assert.equal(r.refundsPaise, 10_000_00);
  });

  await t.test('budget remaining may go negative', () => {
    assert.equal(computeBudgetRemaining(100, 150), -50);
  });

  await t.test('splits Self vs 50-50', () => {
    assert.deepEqual(splitDealProfit(101, 'SELF'), {
      myProfitPaise: 101,
      partnerProfitPaise: 0,
    });
    assert.deepEqual(splitDealProfit(101, 'PARTNERSHIP_50_50'), {
      myProfitPaise: 51,
      partnerProfitPaise: 50,
    });
  });

  await t.test('gross and seller remaining', () => {
    assert.equal(computeGrossDealProfit(200, 150), 50);
    assert.equal(computeGrossDealProfit(200, 150, 25), 75);
    assert.equal(remainingToSeller(100, 40), 60);
    assert.equal(remainingToSeller(0, 10), null);
  });

  await t.test('additional income does not change TVI', () => {
    const inv = computeCurrentInvestment({
      sellerPricePaise: 1_000_00,
      costs: [{ amountPaise: 50_00 }],
    });
    assert.equal(inv.currentInvestmentPaise, 1_050_00);
    assert.equal(computeGrossDealProfit(2_000_00, inv.currentInvestmentPaise, 100_00), 1_050_00);
  });
});
