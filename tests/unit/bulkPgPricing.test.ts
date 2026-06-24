import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { adjustRateByPercent } from '../../src/services/bulkPgPricing';

describe('bulkPgPricing', () => {
  it('adjustRateByPercent rounds correctly for +5%', () => {
    assert.equal(adjustRateByPercent(408_000, 5), 428_400);
    assert.equal(adjustRateByPercent(95_000, 5), 99_750);
  });

  it('adjustRateByPercent handles negative change', () => {
    assert.equal(adjustRateByPercent(408_000, -5), 387_600);
  });

  it('adjustRateByPercent returns 0 for zero base', () => {
    assert.equal(adjustRateByPercent(0, 10), 0);
  });
});
