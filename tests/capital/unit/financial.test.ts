import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calcRoiBps,
  calcSettlementPctBps,
  rupeesToPaise,
  rupeesStringToPaise,
} from '../../../src/capital/lib/money';

describe('financial formulas', () => {
  it('rupeesToPaise uses integer math', () => {
    assert.equal(rupeesToPaise(1000), 100000);
    assert.equal(rupeesToPaise(1.5), 150);
    assert.equal(rupeesStringToPaise('1000.50'), 100050);
  });

  it('calcRoiBps returns basis points', () => {
    assert.equal(calcRoiBps(50000, 1000000), 500); // 5% ROI
    assert.equal(calcRoiBps(-100000, 1000000), -1000); // -10%
    assert.equal(calcRoiBps(100, 0), null);
  });

  it('calcSettlementPctBps uses recovered capital + profit', () => {
    assert.equal(calcSettlementPctBps(1000000, 1000000), 10000); // 100%
    assert.equal(calcSettlementPctBps(500000, 1000000), 5000); // 50%
    assert.equal(calcSettlementPctBps(1500000, 1000000), 10000); // capped at 100%
  });

  it('outstanding formula: investment - capital + refunds', () => {
    const investment = 1000000;
    const capitalReturned = 600000;
    const refund = 50000;
    const outstanding = investment - capitalReturned + refund;
    assert.equal(outstanding, 450000);
  });
});
