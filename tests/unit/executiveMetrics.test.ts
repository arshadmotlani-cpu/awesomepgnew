import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

test('executive metrics derive from occupancy batch and RFE', () => {
  const src = readFileSync(join(process.cwd(), 'src/services/executiveMetrics.ts'), 'utf8');
  assert.match(src, /fetchBedOccupancyRows/);
  assert.match(src, /aggregateOccupancyCounts/);
  assert.match(src, /getGlobalFinancialAggregates/);
});
