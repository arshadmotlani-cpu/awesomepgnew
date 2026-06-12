import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('admin overview server page must not import buildDonutSlices from client chart module', () => {
  const source = readFileSync('app/(admin)/admin/page.tsx', 'utf8');
  assert.equal(source.includes('buildDonutSlices'), false);
  assert.equal(
    source.includes("from '@/src/components/admin/PgIncomeDonutChart'") &&
      source.includes('buildDonutSlices'),
    false,
  );
});

test('buildDonutSlices lives in server-safe pgIncomeDonut lib', () => {
  const lib = readFileSync('src/lib/pgIncomeDonut.ts', 'utf8');
  assert.doesNotMatch(lib, /'use client'/);
  assert.match(lib, /export function buildDonutSlices/);

  const chart = readFileSync('src/components/admin/PgIncomeDonutChart.tsx', 'utf8');
  assert.match(chart, /'use client'/);
  assert.match(chart, /buildDonutSlices\(rows\)/);
  assert.doesNotMatch(chart, /export function buildDonutSlices/);
});
