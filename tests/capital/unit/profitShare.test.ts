import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { computeProfitShare, fullInvestorShare } from '../../../src/capital/lib/profitShare';

describe('profitShare', () => {
  it('splits percentage 50/50 with correct ROIs on equal capital', () => {
    const investment = 10_00_000_00;
    const gross = 2_00_000_00;
    const r = computeProfitShare(
      { grossPaise: gross, mode: 'percentage', partnerPct: 50, myPct: 50 },
      investment,
    );
    assert.equal(r.partnerSharePaise, 1_00_000_00);
    assert.equal(r.mySharePaise, 1_00_000_00);
    assert.equal(r.businessRoiBps, 2000);
    assert.equal(r.myRoiBps, 1000);
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
