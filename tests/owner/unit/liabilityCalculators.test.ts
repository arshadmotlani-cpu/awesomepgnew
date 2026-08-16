/**
 * Liability calculator plugins — unit tests (no DB).
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  getLiabilityCalculator,
  type LiabilityContext,
} from '@/src/owner/lib/liabilities/calculators';

const emiContext: LiabilityContext = {
  id: 'test',
  liabilityType: 'EMI',
  currentPrincipalPaise: 10_00_000_00,
  originalPrincipalPaise: 10_00_000_00,
  interestRateBps: 1200,
  accruedInterestPaise: 0,
  tenureMonths: 12,
  startDate: '2025-01-01',
};

describe('liability calculators', () => {
  test('EMI allocatePayment splits interest and principal', () => {
    const calc = getLiabilityCalculator('EMI');
    const due = calc.getDue(emiContext, '2025-02-01');
    assert.ok(due.interestDuePaise > 0);
    assert.ok(due.principalDuePaise > 0);

    const allocation = calc.allocatePayment(emiContext, due.totalDuePaise, '2025-02-01');
    assert.equal(allocation.interestPaise, due.interestDuePaise);
    assert.equal(allocation.principalPaise, due.principalDuePaise);
    assert.equal(allocation.surplusPrincipalPaise, 0);
  });

  test('extra payment allocates surplus to principal', () => {
    const calc = getLiabilityCalculator('EMI');
    const due = calc.getDue(emiContext, '2025-02-01');
    const extra = due.totalDuePaise + 50_00_000_00;
    const allocation = calc.allocatePayment(emiContext, extra, '2025-02-01');
    assert.ok(allocation.surplusPrincipalPaise > 0);
    assert.equal(
      allocation.interestPaise + allocation.principalPaise + allocation.surplusPrincipalPaise,
      extra,
    );
  });

  test('daily interest accrues over days', () => {
    const calc = getLiabilityCalculator('DAILY_INTEREST');
    const ctx: LiabilityContext = {
      ...emiContext,
      liabilityType: 'DAILY_INTEREST',
      lastAccrualDate: '2025-01-01',
      accruedInterestPaise: 0,
    };
    const accrual = calc.accrueInterest(ctx, '2025-01-11');
    assert.ok(accrual.daysAccrued === 10);
    assert.ok(accrual.accruedInterestPaise > 0);
  });

  test('manual allocation mode respects explicit split', () => {
    const calc = getLiabilityCalculator('MONTHLY_INTEREST');
    const allocation = calc.allocatePayment(
      { ...emiContext, liabilityType: 'MONTHLY_INTEREST' },
      50_000_00,
      '2025-02-01',
      'MANUAL',
      { interestPaise: 10_000_00, principalPaise: 40_000_00 },
    );
    assert.equal(allocation.interestPaise, 10_000_00);
    assert.equal(allocation.principalPaise, 40_000_00);
  });
});
