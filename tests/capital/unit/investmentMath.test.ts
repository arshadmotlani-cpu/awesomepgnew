import { describe, expect, it } from 'vitest';
import {
  computeBudgetRemaining,
  computeCurrentInvestment,
  computeGrossDealProfit,
  remainingToSeller,
  splitDealProfit,
} from '../../../src/capital/lib/investmentMath';

describe('investmentMath SSOT', () => {
  it('computes current investment = seller + costs − refunds', () => {
    const r = computeCurrentInvestment({
      sellerPricePaise: 1_000_000_00,
      costs: [
        { amountPaise: 50_000_00 },
        { amountPaise: -10_000_00, isRefund: true },
      ],
    });
    expect(r.currentInvestmentPaise).toBe(1_040_000_00);
    expect(r.costsPaise).toBe(50_000_00);
    expect(r.refundsPaise).toBe(10_000_00);
  });

  it('budget remaining may go negative', () => {
    expect(computeBudgetRemaining(100, 150)).toBe(-50);
  });

  it('splits Self vs 50-50', () => {
    expect(splitDealProfit(101, 'SELF')).toEqual({
      myProfitPaise: 101,
      partnerProfitPaise: 0,
    });
    expect(splitDealProfit(101, 'PARTNERSHIP_50_50')).toEqual({
      myProfitPaise: 51,
      partnerProfitPaise: 50,
    });
  });

  it('gross and seller remaining', () => {
    expect(computeGrossDealProfit(200, 150)).toBe(50);
    expect(computeGrossDealProfit(200, 150, 25)).toBe(75);
    expect(remainingToSeller(100, 40)).toBe(60);
    expect(remainingToSeller(0, 10)).toBeNull();
  });

  it('additional income does not change TVI', () => {
    const inv = computeCurrentInvestment({
      sellerPricePaise: 1_000_00,
      costs: [{ amountPaise: 50_00 }],
    });
    expect(inv.currentInvestmentPaise).toBe(1_050_00);
    // Income is outside sumCostsAndRefunds / computeCurrentInvestment
    expect(computeGrossDealProfit(2_000_00, inv.currentInvestmentPaise, 100_00)).toBe(1_050_00);
  });
});
