import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

test('0124 and 0125 migrations are registered in drizzle journal', () => {
  const journal = readFileSync(
    join(process.cwd(), 'src/db/migrations/meta/_journal.json'),
    'utf8',
  );
  assert.match(journal, /0124_approval_baseline/);
  assert.match(journal, /0125_vacating_date_change_requests/);
});

test('resident date-change actions file exports only async functions', () => {
  const src = readFileSync(
    join(process.cwd(), 'app/(customer)/account/resident/vacating-date-change-actions.ts'),
    'utf8',
  );
  assert.match(src, /^'use server';/m);
  assert.doesNotMatch(src, /^export type /m);
});

test('ResidentEstimatedSettlementBreakdown does not build statement on client', () => {
  const src = readFileSync(
    join(
      process.cwd(),
      'src/components/customer/account/resident/vacating/ResidentEstimatedSettlementBreakdown.tsx',
    ),
    'utf8',
  );
  assert.doesNotMatch(src, /buildSettlementStatementModel/);
  assert.match(src, /document:/);
});
