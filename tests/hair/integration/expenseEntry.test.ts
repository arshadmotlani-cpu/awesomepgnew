import { loadAppEnv } from '@/src/lib/db/loadEnv';
loadAppEnv();

import assert from 'node:assert/strict';
import test from 'node:test';
import { createExpense, listExpenses } from '@/src/hair/services/expenses';
import { migrationSkipMessage, probeHairQuickSaleMigrations } from './migrationGuard.ts';

test('createExpense inserts exactly one expense row', async (t) => {
  const probe = await probeHairQuickSaleMigrations();
  if (!probe.ok) t.skip(migrationSkipMessage(probe));

  const suffix = Date.now().toString(36);
  const before = await listExpenses(500);
  const row = await createExpense({
    title: `Quick action expense ${suffix}`,
    category: 'general',
    expenseDate: '2026-08-18',
    amountRupees: 250,
    paymentMethod: 'cash',
    staffName: 'Test Staff',
  });
  const after = await listExpenses(500);

  assert.equal(after.length, before.length + 1);
  const saved = after.find((e) => e.id === row.id);
  assert.ok(saved);
  assert.equal(saved?.title, `Quick action expense ${suffix}`);
  assert.equal(saved?.amountPaise, 25_000);
});
