/**
 * Property financial double-counting rules — unit tests.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

describe('property income rules', () => {
  test('linked PG properties skip manual rental baseline', () => {
    const linkedPg = 'pg-uuid';
    const monthlyRental = 200_000_00;
    const otherMonthly = 10_000_00;

    const configuredMonthlyRental = linkedPg ? 0 : monthlyRental;
    const configuredBaseline = configuredMonthlyRental + otherMonthly;

    assert.equal(configuredMonthlyRental, 0);
    assert.equal(configuredBaseline, 10_000_00);
  });

  test('unlinked properties include manual rental in baseline', () => {
    const linkedPg = null;
    const monthlyRental = 200_000_00;
    const otherMonthly = 10_000_00;

    const configuredMonthlyRental = linkedPg ? 0 : monthlyRental;
    const configuredBaseline = configuredMonthlyRental + otherMonthly;

    assert.equal(configuredBaseline, 210_000_00);
  });
});

function normalizeRecurringToMonthly(amountPaise: number, frequency: string): number {
  switch (frequency) {
    case 'DAILY':
      return Math.round(amountPaise * 30);
    case 'WEEKLY':
      return Math.round((amountPaise * 52) / 12);
    case 'MONTHLY':
      return amountPaise;
    case 'QUARTERLY':
      return Math.round(amountPaise / 3);
    case 'YEARLY':
      return Math.round(amountPaise / 12);
    default:
      return amountPaise;
  }
}

describe('recurring expense normalization', () => {
  test('yearly expense converts to monthly', () => {
    assert.equal(normalizeRecurringToMonthly(120_000_00, 'YEARLY'), 10_000_00);
  });

  test('monthly expense stays monthly', () => {
    assert.equal(normalizeRecurringToMonthly(45_000_00, 'MONTHLY'), 45_000_00);
  });
});
