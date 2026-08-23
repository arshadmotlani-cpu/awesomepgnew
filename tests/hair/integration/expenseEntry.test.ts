import { loadAppEnv } from '@/src/lib/db/loadEnv';
loadAppEnv();

import assert from 'node:assert/strict';
import test from 'node:test';
import { eq } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import { fyhExpenses } from '@/src/hair/db/schema';
import { createExpense } from '@/src/hair/services/expenses';
import { migrationSkipMessage, probeHairQuickSaleMigrations } from './migrationGuard.ts';

test('createExpense inserts exactly one expense row', async (t) => {
  const probe = await probeHairQuickSaleMigrations();
  if (!probe.ok) t.skip(migrationSkipMessage(probe));

  const suffix = Date.now().toString(36);
  const title = `Quick action expense ${suffix}`;
  const row = await createExpense({
    title,
    category: 'general',
    expenseDate: '2026-08-18',
    amountRupees: 250,
    paymentMethod: 'cash',
    staffName: 'Test Staff',
  });

  // Avoid shared listExpenses(500) length races under concurrent traffic.
  const saved = await hairDb.select().from(fyhExpenses).where(eq(fyhExpenses.id, row.id));
  assert.equal(saved.length, 1);
  assert.equal(saved[0]?.title, title);
  assert.equal(saved[0]?.amountPaise, 25_000);
});
