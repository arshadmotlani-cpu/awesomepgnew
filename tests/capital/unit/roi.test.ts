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
  it('Business ROI uses purchase price; My ROI uses my stake', () => {
    // Vehicle ₹11L, Me ₹5.5L, Investor2 ₹5.5L, profit ₹1.2L split 60k/60k
    const purchase = INR(11_00_000);
    const myInvested = INR(5_50_000);
    const gross = INR(1_20_000);
    const myProfit = INR(60_000);

    const business = computeBusinessRoiBps(gross, purchase);
    const personal = computePersonalRoiBps(myProfit, myInvested);

    // Both ≈ 10.91% when capital share matches profit share
    assert.equal(business, personal);
    assert.equal(business, 1091);

    const vehicle = computeVehicleRois({
      grossProfitPaise: gross,
      purchasePricePaise: purchase,
      myProfitPaise: myProfit,
      myInvestedPaise: myInvested,
    });
    assert.equal(vehicle.businessRoiBps, 1091);
    assert.equal(vehicle.myRoiBps, 1091);
  });

  it('My ROI is higher when I fund less but take equal profit (20% capital)', () => {
    const purchase = INR(10_00_000);
    const myInvested = INR(2_00_000); // 20%
    const gross = INR(1_00_000);
    const myProfit = INR(50_000); // 50% of profit

    const business = computeBusinessRoiBps(gross, purchase); // 10%
    const personal = computePersonalRoiBps(myProfit, myInvested); // 25%
    assert.equal(business, 1000);
    assert.equal(personal, 2500);
    assert.ok(personal > business);
  });

  it('portfolio ROI uses my vehicle capital, not full purchase volume', () => {
    const r = computePortfolioRois({
      grossBusinessProfitPaise: INR(9_60_000),
      myProfitPaise: INR(4_80_000),
      lifetimePurchaseVolumePaise: INR(50_00_000),
      myCapitalInvestedPaise: INR(25_00_000),
    });
    assert.equal(r.businessRoiBps, 1920); // 19.2%
    assert.equal(r.myRoiBps, 1920); // same rate on half capital
  });

  it('falls back personal capital base to purchase volume when my stakes are 0', () => {
    assert.equal(resolvePersonalCapitalBase(0, INR(10_00_000)), INR(10_00_000));
    assert.equal(resolvePersonalCapitalBase(INR(5_00_000), INR(10_00_000)), INR(5_00_000));
  });
});
