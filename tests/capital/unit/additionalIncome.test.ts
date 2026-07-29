import assert from 'node:assert/strict';
import test from 'node:test';
import {
  VEHICLE_ADDITIONAL_INCOME_TYPES,
  VEHICLE_ADDITIONAL_INCOME_TYPE_LABELS,
} from '../../../src/capital/db/schema/vehicleAdditionalIncome';
import {
  computeCurrentInvestment,
  computeGrossDealProfit,
  sumAdditionalIncome,
  sumCostsAndRefunds,
} from '../../../src/capital/lib/investmentMath';

test('additional income ledger isolation', async (t) => {
  await t.test('exposes seven income types with labels', () => {
    assert.equal(VEHICLE_ADDITIONAL_INCOME_TYPES.length, 7);
    assert.ok(VEHICLE_ADDITIONAL_INCOME_TYPES.includes('brokerage'));
    for (const typ of VEHICLE_ADDITIONAL_INCOME_TYPES) {
      assert.ok(VEHICLE_ADDITIONAL_INCOME_TYPE_LABELS[typ]);
    }
  });

  await t.test('sums non-reversed income only', () => {
    assert.equal(
      sumAdditionalIncome([
        { amountPaise: 10_000_00 },
        { amountPaise: 5_000_00, isReversed: true },
        { amountPaise: -100, isReversed: false },
        { amountPaise: 2_500_00 },
      ]),
      12_500_00,
    );
  });

  await t.test('income never enters cost/refund sums or TVI', () => {
    const costs = sumCostsAndRefunds([
      { amountPaise: 20_000_00 },
      { amountPaise: -5_000_00, isRefund: true },
    ]);
    assert.equal(costs.netCostsPaise, 15_000_00);

    const inv = computeCurrentInvestment({
      sellerPricePaise: 100_000_00,
      costs: [
        { amountPaise: 20_000_00 },
        { amountPaise: -5_000_00, isRefund: true },
      ],
    });
    assert.equal(inv.currentInvestmentPaise, 115_000_00);

    const income = sumAdditionalIncome([{ amountPaise: 8_000_00 }]);
    assert.equal(computeGrossDealProfit(150_000_00, inv.currentInvestmentPaise), 35_000_00);
    assert.equal(computeGrossDealProfit(150_000_00, inv.currentInvestmentPaise, income), 43_000_00);
    assert.equal(inv.currentInvestmentPaise, 115_000_00);
  });
});
