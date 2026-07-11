import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  clampPersonalRoiBps,
  computeBusinessRoiBps,
  computePersonalRoiBps,
  computePortfolioRois,
  computeVehicleRois,
  resolvePersonalCapitalBase,
} from '../../../src/capital/lib/roi';

/** ₹ amounts → paise */
const INR = (rupees: number) => Math.round(rupees * 100);

describe('roi formulas', () => {
  it('matches the 50:50 equal-capital example (Business 20%, Personal 10%)', () => {
    const investment = INR(10_00_000);
    const gross = INR(2_00_000);
    const partner = INR(1_00_000);
    const mine = INR(1_00_000);

    const business = computeBusinessRoiBps(gross, investment);
    const personal = computePersonalRoiBps(mine, investment);

    assert.equal(business, 2000); // 20.00%
    assert.equal(personal, 1000); // 10.00%

    const portfolio = computePortfolioRois({
      grossBusinessProfitPaise: gross,
      myProfitPaise: mine,
      partnerSharePaise: partner,
      lifetimePurchaseVolumePaise: investment,
      myCapitalInvestedPaise: investment,
    });
    assert.equal(portfolio.businessRoiBps, 2000);
    assert.equal(portfolio.myRoiBps, 1000);
  });

  it('vehicle ROIs use total investment; 50:50 ⇒ personal ≈ half business', () => {
    const investment = INR(10_00_000);
    const gross = INR(2_00_000);
    const partner = INR(1_00_000);
    const mine = INR(1_00_000);

    const { businessRoiBps, myRoiBps, roiBps } = computeVehicleRois(
      gross,
      mine,
      partner,
      investment,
    );
    assert.equal(businessRoiBps, 2000);
    assert.equal(myRoiBps, 1000);
    assert.equal(roiBps, businessRoiBps);
  });

  it('clamps personal ROI when partner share > 0 and personal would exceed business', () => {
    // Small personal capital base would inflate personal ROI above business
    const business = computeBusinessRoiBps(INR(2_00_000), INR(10_00_000)); // 20%
    const inflated = computePersonalRoiBps(INR(1_00_000), INR(2_00_000)); // 50%
    assert.ok(inflated > business);
    assert.equal(clampPersonalRoiBps(inflated, business, INR(1_00_000)), business);
  });

  it('does not clamp when there is no partner share', () => {
    const business = 2000;
    const personal = 5000;
    assert.equal(clampPersonalRoiBps(personal, business, 0), personal);
  });

  it('falls back personal capital base to purchase volume when capital injected is 0', () => {
    assert.equal(resolvePersonalCapitalBase(0, INR(10_00_000)), INR(10_00_000));
    assert.equal(resolvePersonalCapitalBase(INR(5_00_000), INR(10_00_000)), INR(5_00_000));
  });
});
