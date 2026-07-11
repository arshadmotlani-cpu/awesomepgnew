import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  computeFundingGap,
  computeNetVehicleCost,
  distributeDealProfits,
  isFullyFunded,
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

describe('distributeDealProfits — Cases 1–3', () => {
  const settings50 = { numerator: 1, denominator: 2 };

  it('Case 1: only Me invested — 50/50 Sufii vs Me', () => {
    const deal = distributeDealProfits({
      businessProfitPaise: INR(2_00_000),
      netVehicleCostPaise: INR(10_00_000),
      settings: settings50,
      funding: [{ slot: 'me', investedPaise: INR(10_00_000), label: 'Me' }],
    });
    assert.equal(deal.operatingPartnerSharePaise, INR(1_00_000));
    assert.equal(deal.investorPoolPaise, INR(1_00_000));
    assert.equal(deal.myProfitPaise, INR(1_00_000));
    assert.equal(deal.businessRoiBps, 2000);
    assert.equal(deal.myRoiBps, 1000);
  });

  it('Case 2: Me 50% + External 50% — Investor Pool splits evenly', () => {
    const deal = distributeDealProfits({
      businessProfitPaise: INR(2_00_000),
      netVehicleCostPaise: INR(10_00_000),
      settings: settings50,
      funding: [
        { slot: 'me', investedPaise: INR(5_00_000), label: 'Me' },
        { slot: 'investor_2', investedPaise: INR(5_00_000), label: 'External' },
      ],
    });
    assert.equal(deal.operatingPartnerSharePaise, INR(1_00_000));
    assert.equal(deal.investorPoolPaise, INR(1_00_000));
    assert.equal(deal.myProfitPaise, INR(50_000));
    const ext = deal.investors.find((i) => i.slot === 'investor_2');
    assert.equal(ext?.profitPaise, INR(50_000));
  });

  it('Case 3: Me 70% + External 30%', () => {
    const deal = distributeDealProfits({
      businessProfitPaise: INR(2_00_000),
      netVehicleCostPaise: INR(10_00_000),
      settings: settings50,
      funding: [
        { slot: 'me', investedPaise: INR(7_00_000), label: 'Me' },
        { slot: 'investor_2', investedPaise: INR(3_00_000), label: 'External' },
      ],
    });
    assert.equal(deal.operatingPartnerSharePaise, INR(1_00_000));
    assert.equal(deal.myProfitPaise, INR(70_000));
    const ext = deal.investors.find((i) => i.slot === 'investor_2');
    assert.equal(ext?.profitPaise, INR(30_000));
  });

  it('respects configurable Sufii cut (40%)', () => {
    const deal = distributeDealProfits({
      businessProfitPaise: INR(2_00_000),
      netVehicleCostPaise: INR(10_00_000),
      settings: { numerator: 2, denominator: 5 },
      funding: [{ slot: 'me', investedPaise: INR(10_00_000), label: 'Me' }],
    });
    assert.equal(deal.operatingPartnerSharePaise, INR(80_000));
    assert.equal(deal.investorPoolPaise, INR(1_20_000));
    assert.equal(deal.myProfitPaise, INR(1_20_000));
  });
});
