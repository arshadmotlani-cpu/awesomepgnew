import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { computeWorkingCapitalPool } from '../../../src/capital/lib/workingCapital';

const INR = (rupees: number) => Math.round(rupees * 100);

describe('workingCapital pool', () => {
  it('selling at cost recycles capital without creating wealth', () => {
    // Inject ₹10L, buy ₹10L vehicle, sell at cost, full recovery
    const afterBuy = computeWorkingCapitalPool({
      initialCapitalPaise: INR(10_00_000),
      myProfitPaise: 0,
      currentInvestmentPaise: INR(10_00_000),
    });
    assert.equal(afterBuy.workingCapitalPaise, INR(10_00_000));
    assert.equal(afterBuy.freeCashPaise, 0);

    const afterSale = computeWorkingCapitalPool({
      initialCapitalPaise: INR(10_00_000),
      myProfitPaise: 0,
      currentInvestmentPaise: 0,
    });
    assert.equal(afterSale.workingCapitalPaise, INR(10_00_000));
    assert.equal(afterSale.freeCashPaise, INR(10_00_000));
  });

  it('only profit increases working capital', () => {
    const pool = computeWorkingCapitalPool({
      initialCapitalPaise: INR(10_00_000),
      myProfitPaise: INR(2_00_000),
      currentInvestmentPaise: 0,
    });
    assert.equal(pool.workingCapitalPaise, INR(12_00_000));
    assert.equal(pool.freeCashPaise, INR(12_00_000));
  });

  it('never double-counts returned capital on top of initial capital', () => {
    // Wrong model would do: initial - locked + profit + capitalReturned
    // Correct: initial + profit - locked (capital return just unlocks locked)
    const pool = computeWorkingCapitalPool({
      initialCapitalPaise: INR(10_00_000),
      myProfitPaise: INR(1_00_000),
      currentInvestmentPaise: INR(4_00_000),
    });
    assert.equal(pool.workingCapitalPaise, INR(11_00_000));
    assert.equal(pool.freeCashPaise, INR(7_00_000));
  });

  it('capital in transit is not free cash', () => {
    const pool = computeWorkingCapitalPool({
      initialCapitalPaise: INR(10_00_000),
      myProfitPaise: INR(1_00_000),
      currentInvestmentPaise: 0,
      capitalInTransitPaise: INR(3_00_000),
    });
    assert.equal(pool.workingCapitalPaise, INR(11_00_000));
    assert.equal(pool.freeCashPaise, INR(8_00_000));
  });
});
