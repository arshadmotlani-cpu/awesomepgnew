import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  computeGrossDealProfit,
  computeFundingGap,
  computeNetVehicleCost,
  distributeDealProfits,
  isFullyFunded,
  splitGrossDealProfit,
  summarizeExpenseTotals,
} from '../../../src/capital/lib/dealEconomics';
import {
  fullSelfFunding,
  validateFundingStructure,
} from '../../../src/capital/lib/investors';

const INR = (r: number) => Math.round(r * 100);

describe('dealEconomics net vehicle cost', () => {
  it('splits repairs and refunds from signed expenses', () => {
    const totals = summarizeExpenseTotals([
      { amountPaise: INR(20_000) },
      { amountPaise: INR(-5_000) },
    ]);
    assert.equal(totals.repairTotalPaise, INR(20_000));
    assert.equal(totals.dealerRefundTotalPaise, INR(5_000));
    assert.equal(totals.totalExpensePaise, INR(15_000));
  });

  it('computes Net Vehicle Cost = purchase + repairs − refunds', () => {
    const cost = computeNetVehicleCost(INR(10_00_000), [
      { amountPaise: INR(20_000) },
      { amountPaise: INR(-5_000) },
    ]);
    assert.equal(cost.netVehicleCostPaise, INR(10_15_000));
  });

  it('funding gap is zero when stakes equal net cost', () => {
    const gap = computeFundingGap(INR(10_15_000), INR(10_15_000));
    assert.equal(gap, 0);
    assert.equal(isFullyFunded(gap), true);
  });

  it('funding gap is positive when underfunded', () => {
    assert.equal(computeFundingGap(INR(10_15_000), INR(10_00_000)), INR(15_000));
  });
});

describe('funding validates against net vehicle cost', () => {
  it('rejects stakes that do not equal net cost', () => {
    assert.throws(() =>
      validateFundingStructure(INR(10_15_000), [
        { slot: 'me', investedPaise: INR(10_00_000) },
      ]),
    );
  });

  it('accepts stakes equal to net cost after repairs', () => {
    const rows = validateFundingStructure(INR(10_15_000), [
      { slot: 'me', investedPaise: INR(10_15_000) },
    ]);
    assert.equal(rows[0].investedPaise, INR(10_15_000));
  });

  it('fullSelfFunding matches net cost', () => {
    const rows = fullSelfFunding(INR(10_15_000));
    assert.equal(rows.reduce((s, r) => s + r.investedPaise, 0), INR(10_15_000));
  });
});

describe('computeGrossDealProfit', () => {
  it('Sale − TVI', () => {
    assert.equal(computeGrossDealProfit(INR(6_00_000), INR(5_00_000)), INR(1_00_000));
  });
});

describe('splitGrossDealProfit', () => {
  it('SELF: My = Gross, Sufii = 0', () => {
    const r = splitGrossDealProfit(INR(2_00_000), 'SELF');
    assert.equal(r.myProfitPaise, INR(2_00_000));
    assert.equal(r.sufiiProfitPaise, 0);
    assert.equal(r.operatingPartnerPctBps, 0);
  });

  it('PARTNERSHIP_50_50: My = round(Gross/2), Sufii = remainder', () => {
    const r = splitGrossDealProfit(INR(2_00_000), 'PARTNERSHIP_50_50');
    assert.equal(r.myProfitPaise, INR(1_00_000));
    assert.equal(r.sufiiProfitPaise, INR(1_00_000));
    assert.equal(r.operatingPartnerPctBps, 5000);
  });

  it('odd paise: My rounded, shares sum to Gross', () => {
    const r = splitGrossDealProfit(101, 'PARTNERSHIP_50_50');
    assert.equal(r.myProfitPaise, 51);
    assert.equal(r.sufiiProfitPaise, 50);
    assert.equal(r.myProfitPaise + r.sufiiProfitPaise, 101);
  });
});

describe('distributeDealProfits — SELF vs PARTNERSHIP_50_50', () => {
  it('SELF: 100% My Profit, Sufii 0, investor_2 gets 0 deal profit', () => {
    const deal = distributeDealProfits({
      businessProfitPaise: INR(2_00_000),
      netVehicleCostPaise: INR(10_00_000),
      profitDistributionMode: 'SELF',
      funding: [{ slot: 'me', investedPaise: INR(10_00_000), label: 'Me' }],
    });
    assert.equal(deal.operatingPartnerSharePaise, 0);
    assert.equal(deal.myProfitPaise, INR(2_00_000));
    assert.equal(deal.investorPoolPaise, INR(2_00_000));
    assert.equal(deal.businessRoiBps, 2000);
    assert.equal(deal.myRoiBps, 2000);
  });

  it('PARTNERSHIP_50_50: 50/50 My vs Sufii regardless of capital co-investor', () => {
    const deal = distributeDealProfits({
      businessProfitPaise: INR(2_00_000),
      netVehicleCostPaise: INR(10_00_000),
      profitDistributionMode: 'PARTNERSHIP_50_50',
      funding: [
        { slot: 'me', investedPaise: INR(7_00_000), label: 'Me' },
        { slot: 'investor_2', investedPaise: INR(3_00_000), label: 'External' },
      ],
    });
    assert.equal(deal.operatingPartnerSharePaise, INR(1_00_000));
    assert.equal(deal.myProfitPaise, INR(1_00_000));
    assert.equal(deal.myRoiBps, Math.round((INR(1_00_000) * 10000) / INR(7_00_000)));
    const ext = deal.investors.find((i) => i.slot === 'investor_2');
    assert.equal(ext?.profitPaise, 0);
  });

  it('PARTNERSHIP with only Me funded matches 50% My ROI base', () => {
    const deal = distributeDealProfits({
      businessProfitPaise: INR(2_00_000),
      netVehicleCostPaise: INR(10_00_000),
      profitDistributionMode: 'PARTNERSHIP_50_50',
      funding: [{ slot: 'me', investedPaise: INR(10_00_000), label: 'Me' }],
    });
    assert.equal(deal.myProfitPaise, INR(1_00_000));
    assert.equal(deal.myRoiBps, 1000);
  });
});
