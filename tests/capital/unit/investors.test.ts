import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  distributeInvestorProfits,
  fullSelfFunding,
  summarizeInvestorShares,
  validateFundingStructure,
} from '../../../src/capital/lib/investors';
import { computeProfitShare, fullInvestorShare } from '../../../src/capital/lib/profitShare';

const INR = (r: number) => Math.round(r * 100);

describe('investors funding', () => {
  it('requires funding to equal net vehicle cost', () => {
    assert.throws(() =>
      validateFundingStructure(INR(11_00_000), [
        { slot: 'me', investedPaise: INR(5_00_000) },
        { slot: 'investor_2', investedPaise: INR(5_00_000) },
      ]),
    );
  });

  it('accepts 50/50 Me + Investor 2 against net cost', () => {
    const rows = validateFundingStructure(INR(11_00_000), [
      { slot: 'me', investedPaise: INR(5_50_000) },
      { slot: 'investor_2', investedPaise: INR(5_50_000) },
    ]);
    assert.equal(rows.length, 2);
    assert.equal(
      rows.reduce((s, r) => s + r.investedPaise, 0),
      INR(11_00_000),
    );
  });

  it('distributes investor pool proportional to capital', () => {
    const funding = validateFundingStructure(INR(11_00_000), [
      { slot: 'me', investedPaise: INR(5_50_000) },
      { slot: 'investor_2', investedPaise: INR(5_50_000) },
    ]);
    // Investor pool only (after Sufii cut) — e.g. ₹1,20,000 pool
    const profits = distributeInvestorProfits(INR(1_20_000), funding);
    const summary = summarizeInvestorShares(profits);
    assert.equal(summary.myProfitPaise, INR(60_000));
    assert.equal(summary.partnerProfitPaise, INR(60_000));
    assert.equal(summary.myRoiBps, 1091);
  });

  it('fullSelfFunding is 100% Me', () => {
    const rows = fullSelfFunding(INR(10_00_000));
    assert.equal(rows.length, 1);
    assert.equal(rows[0].slot, 'me');
    assert.equal(rows[0].investedPaise, INR(10_00_000));
  });
});

describe('profitShare (legacy manual / non-vehicle)', () => {
  it('splits percentage 50/50 with equal capital ⇒ equal ROI', () => {
    const purchase = INR(10_00_000);
    const gross = INR(2_00_000);
    const r = computeProfitShare(
      { grossPaise: gross, mode: 'percentage', partnerPct: 50, myPct: 50 },
      { purchasePricePaise: purchase, myInvestedPaise: INR(5_00_000) },
    );
    assert.equal(r.partnerSharePaise, INR(1_00_000));
    assert.equal(r.mySharePaise, INR(1_00_000));
    assert.equal(r.businessRoiBps, 2000);
    assert.equal(r.myRoiBps, 2000);
  });

  it('rejects percentages that do not sum to 100', () => {
    assert.throws(() =>
      computeProfitShare({
        grossPaise: 10000,
        mode: 'percentage',
        partnerPct: 30,
        myPct: 50,
      }),
    );
  });

  it('fixed partner amount leaves remainder to me', () => {
    const r = computeProfitShare({
      grossPaise: INR(80_000),
      mode: 'fixed',
      partnerFixedPaise: INR(40_000),
    });
    assert.equal(r.partnerSharePaise, INR(40_000));
    assert.equal(r.mySharePaise, INR(40_000));
  });

  it('fullInvestorShare is 100% mine', () => {
    const r = fullInvestorShare(INR(50_000), INR(2_00_000));
    assert.equal(r.partnerSharePaise, 0);
    assert.equal(r.mySharePaise, INR(50_000));
  });
});
