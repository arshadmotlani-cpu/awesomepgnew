import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createExpenseSchema } from '../../../src/capital/lib/validation/schemas';

describe('signed expense amounts', () => {
  const base = {
    assetId: '11111111-1111-4111-8111-111111111111',
    categoryId: '22222222-2222-4222-8222-222222222222',
    expenseDate: '2026-06-01',
    description: 'Test expense',
  };

  it('accepts positive amounts', () => {
    const r = createExpenseSchema.safeParse({ ...base, amount: 25000 });
    assert.equal(r.success, true);
  });

  it('accepts negative amounts (credits / adjustments)', () => {
    const r = createExpenseSchema.safeParse({ ...base, amount: -5000 });
    assert.equal(r.success, true);
    if (r.success) assert.equal(r.data.amount, -5000);
  });

  it('rejects zero', () => {
    const r = createExpenseSchema.safeParse({ ...base, amount: 0 });
    assert.equal(r.success, false);
  });

  it('net vehicle cost = purchase + signed expense sum', () => {
    const purchase = 11_00_000_00;
    const expenses = [25_000_00, -5_000_00, 10_000_00]; // net +30k
    const netCost = purchase + expenses.reduce((s, e) => s + e, 0);
    assert.equal(netCost, 11_30_000_00);
    const sale = netCost + 1_60_000_00;
    assert.equal(sale - netCost, 1_60_000_00);
  });
});
