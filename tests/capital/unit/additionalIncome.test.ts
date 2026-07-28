import { describe, expect, it } from 'vitest';
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

describe('additional income ledger isolation', () => {
  it('exposes seven income types with labels', () => {
    expect(VEHICLE_ADDITIONAL_INCOME_TYPES).toHaveLength(7);
    expect(VEHICLE_ADDITIONAL_INCOME_TYPES).toContain('brokerage');
    for (const t of VEHICLE_ADDITIONAL_INCOME_TYPES) {
      expect(VEHICLE_ADDITIONAL_INCOME_TYPE_LABELS[t]).toBeTruthy();
    }
  });

  it('sums non-reversed income only', () => {
    expect(
      sumAdditionalIncome([
        { amountPaise: 10_000_00 },
        { amountPaise: 5_000_00, isReversed: true },
        { amountPaise: -100, isReversed: false },
        { amountPaise: 2_500_00 },
      ]),
    ).toBe(12_500_00);
  });

  it('income never enters cost/refund sums or TVI', () => {
    const costs = sumCostsAndRefunds([
      { amountPaise: 20_000_00 },
      { amountPaise: -5_000_00, isRefund: true },
    ]);
    expect(costs.netCostsPaise).toBe(15_000_00);

    const inv = computeCurrentInvestment({
      sellerPricePaise: 100_000_00,
      costs: [
        { amountPaise: 20_000_00 },
        { amountPaise: -5_000_00, isRefund: true },
      ],
    });
    expect(inv.currentInvestmentPaise).toBe(115_000_00);

    const income = sumAdditionalIncome([{ amountPaise: 8_000_00 }]);
    expect(computeGrossDealProfit(150_000_00, inv.currentInvestmentPaise)).toBe(35_000_00);
    expect(computeGrossDealProfit(150_000_00, inv.currentInvestmentPaise, income)).toBe(
      43_000_00,
    );
    // TVI unchanged when income present
    expect(inv.currentInvestmentPaise).toBe(115_000_00);
  });
});
