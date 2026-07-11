import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  computeBusinessRoiBps,
  computePersonalRoiBps,
  computePortfolioRois,
  computeVehicleRois,
  resolvePersonalCapitalBase,
} from '../../../src/capital/lib/roi';

const INR = (rupees: number) => Math.round(rupees * 100);

describe('roi formulas', () => {
  it('Business ROI uses total vehicle cost; My ROI uses my stake', () => {
    // Vehicle purchase ₹11L + expenses ₹25k = cost ₹11.25L
    // Me ₹5.5L, Investor2 ₹5.5L, profit ₹1.6L split 80k/80k
    const cost = INR(11_25_000);
    const myInvested = INR(5_50_000);
    const gross = INR(1_60_000);
    const myProfit = INR(80_000);

    const business = computeBusinessRoiBps(gross, cost);
    const personal = computePersonalRoiBps(myProfit, myInvested);

    // Business ≈ 14.22%; My ≈ 14.55% (same profit share, cost includes expenses not in stake)
    assert.equal(business, 1422);
    assert.equal(personal, 1455);

    const vehicle = computeVehicleRois({
      grossProfitPaise: gross,
      totalVehicleCostPaise: cost,
      myProfitPaise: myProfit,
      myInvestedPaise: myInvested,
    });
    assert.equal(vehicle.businessRoiBps, 1422);
    assert.equal(vehicle.myRoiBps, 1455);
  });

  it('when cost equals purchase and capital share matches profit share, ROIs match', () => {
    const purchase = INR(11_00_000);
    const myInvested = INR(5_50_000);
    const gross = INR(1_20_000);
    const myProfit = INR(60_000);

    const business = computeBusinessRoiBps(gross, purchase);
    const personal = computePersonalRoiBps(myProfit, myInvested);
    assert.equal(business, personal);
    assert.equal(business, 1091);
  });

  it('My ROI is higher when I fund less but take equal profit (20% capital)', () => {
    const cost = INR(10_00_000);
    const myInvested = INR(2_00_000); // 20%
    const gross = INR(1_00_000);
    const myProfit = INR(50_000); // 50% of profit

    const business = computeBusinessRoiBps(gross, cost); // 10%
    const personal = computePersonalRoiBps(myProfit, myInvested); // 25%
    assert.equal(business, 1000);
    assert.equal(personal, 2500);
    assert.ok(personal > business);
  });

  it('portfolio ROI uses sold vehicle cost base, not purchase alone', () => {
    // 6 × ₹11.25L cost, ₹9.6L business / ₹4.8L my, my stakes ₹33L
    const r = computePortfolioRois({
      grossBusinessProfitPaise: INR(9_60_000),
      myProfitPaise: INR(4_80_000),
      totalVehicleCostPaise: INR(67_50_000),
      myCapitalInvestedPaise: INR(33_00_000),
    });
    assert.equal(r.businessRoiBps, 1422); // 14.22%
    assert.equal(r.myRoiBps, 1455); // 14.55%
  });

  it('falls back personal capital base to vehicle cost when my stakes are 0', () => {
    assert.equal(resolvePersonalCapitalBase(0, INR(10_00_000)), INR(10_00_000));
    assert.equal(resolvePersonalCapitalBase(INR(5_00_000), INR(10_00_000)), INR(5_00_000));
  });

  it('accepts legacy lifetimePurchaseVolumePaise alias', () => {
    const r = computePortfolioRois({
      grossBusinessProfitPaise: INR(1_00_000),
      myProfitPaise: INR(50_000),
      totalVehicleCostPaise: 0,
      lifetimePurchaseVolumePaise: INR(10_00_000),
      myCapitalInvestedPaise: INR(5_00_000),
    });
    assert.equal(r.businessRoiBps, 1000);
    assert.equal(r.myRoiBps, 1000);
  });
});
