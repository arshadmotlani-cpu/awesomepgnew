import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { computeProfitShare, fullInvestorShare } from '../../../src/capital/lib/profitShare';

describe('profitShare', () => {
  it('splits percentage 40/60', () => {
    const r = computeProfitShare(
      { grossPaise: 100_000_00, mode: 'percentage', partnerPct: 40, myPct: 60 },
      500_000_00,
    );
    assert.equal(r.partnerSharePaise, 40_000_00);
    assert.equal(r.mySharePaise, 60_000_00);
    assert.equal(r.partnerSharePctBps, 4000);
    assert.equal(r.mySharePctBps, 6000);
    assert.ok(r.businessRoiBps != null);
    assert.ok(r.myRoiBps != null);
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
      grossPaise: 80_000_00,
      mode: 'fixed',
      partnerFixedPaise: 40_000_00,
    });
    assert.equal(r.partnerSharePaise, 40_000_00);
    assert.equal(r.mySharePaise, 40_000_00);
  });

  it('fullInvestorShare is 100% mine', () => {
    const r = fullInvestorShare(50_000_00, 200_000_00);
    assert.equal(r.partnerSharePaise, 0);
    assert.equal(r.mySharePaise, 50_000_00);
  });
});
