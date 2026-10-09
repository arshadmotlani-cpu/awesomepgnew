import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('staff performance aggregates exclude POS/integration placeholder staff', () => {
  const src = readFileSync('src/hair/services/staffPerformanceDashboard.ts', 'utf8');
  const fn = src.slice(src.indexOf('async function staffAttributedAggregates'));
  assert.match(fn, /isPosExcludedStaff/);
  assert.match(fn, /filter\(/);
});
