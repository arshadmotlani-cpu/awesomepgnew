import assert from 'node:assert/strict';
import test from 'node:test';
import {
  chartHasData,
  momDeltaDirection,
  momDeltaPct,
  parseStaffPerformanceSearchParams,
  previousEqualRange,
  resolveStaffPerformanceRange,
  sortStaffByRevenue,
} from '../../../src/hair/lib/staffPerformancePeriod.ts';
import { buildStaffPerformanceExportSheets } from '../../../src/hair/services/staffPerformanceExport.ts';
import type { StaffPerformanceCommandCenterSnapshot } from '../../../src/hair/services/staffPerformanceDashboard.ts';

test('momDeltaPct returns null when previous is zero and current positive', () => {
  assert.equal(momDeltaPct(100, 0), null);
});

test('momDeltaPct returns 0 when both zero', () => {
  assert.equal(momDeltaPct(0, 0), 0);
});

test('momDeltaPct signs correctly for up and down', () => {
  assert.equal(momDeltaPct(150, 100), 50);
  assert.equal(momDeltaPct(50, 100), -50);
  assert.equal(momDeltaDirection(50), 'up');
  assert.equal(momDeltaDirection(-10), 'down');
  assert.equal(momDeltaDirection(0), 'flat');
  assert.equal(momDeltaDirection(null), 'na');
});

test('previousEqualRange mirrors length immediately before from', () => {
  const range = {
    from: new Date('2026-08-01T00:00:00.000Z'),
    to: new Date('2026-08-08T00:00:00.000Z'),
  };
  const prev = previousEqualRange(range);
  assert.equal(prev.to.getTime(), range.from.getTime());
  assert.equal(prev.to.getTime() - prev.from.getTime(), range.to.getTime() - range.from.getTime());
});

test('resolveStaffPerformanceRange month preset is non-empty', () => {
  const { range, previousRange, label } = resolveStaffPerformanceRange({
    timezone: 'Asia/Kolkata',
    preset: 'month',
    now: new Date('2026-08-15T10:00:00.000Z'),
  });
  assert.equal(label, 'This month');
  assert.ok(range.to.getTime() > range.from.getTime());
  assert.equal(previousRange.to.getTime(), range.from.getTime());
});

test('parseStaffPerformanceSearchParams defaults and staff split', () => {
  const parsed = parseStaffPerformanceSearchParams({
    staff: 'a, b,,c',
    category: 'service',
  });
  assert.equal(parsed.preset, 'month');
  assert.equal(parsed.category, 'service');
  assert.deepEqual(parsed.staffIds, ['a', 'b', 'c']);
});

test('sortStaffByRevenue sorts descending then name', () => {
  const sorted = sortStaffByRevenue([
    { name: 'Bella', revenuePaise: 100 },
    { name: 'Ava', revenuePaise: 200 },
    { name: 'Cara', revenuePaise: 200 },
  ]);
  assert.deepEqual(
    sorted.map((r) => r.name),
    ['Ava', 'Cara', 'Bella'],
  );
});

test('chartHasData guards empty and all-zero series', () => {
  assert.equal(chartHasData([]), false);
  assert.equal(chartHasData([0, 0, 0]), false);
  assert.equal(chartHasData([0, 1]), true);
});

function emptySnapshot(): StaffPerformanceCommandCenterSnapshot {
  return {
    timezone: 'Asia/Kolkata',
    salonName: 'FYH',
    periodLabel: 'This month',
    periodPreset: 'month',
    rangeFromIso: '2026-08-01T00:00:00.000Z',
    rangeToIso: '2026-08-16T00:00:00.000Z',
    category: 'combined',
    staffIdsFilter: [],
    kpis: {
      serviceRevenuePaise: 0,
      productRevenuePaise: 0,
      packageRevenuePaise: 0,
      membershipRevenuePaise: 0,
      combinedRevenuePaise: 0,
      serviceDeltaPct: null,
      productDeltaPct: null,
      packageDeltaPct: null,
      membershipDeltaPct: null,
      combinedDeltaPct: null,
    },
    leaderboard: [
      {
        staffId: 's1',
        name: 'Ava',
        photoUrl: null,
        revenuePaise: 50_000,
        customersServed: 3,
        averageBillPaise: 16_666,
        servicesSoldCount: 2,
        productsSoldCount: 1,
      },
    ],
    distribution: [{ staffId: 's1', name: 'Ava', revenuePaise: 50_000, pct: 100 }],
    comparison: [],
    serviceTable: [],
    productTable: [],
    packageTable: [],
    membershipTable: [],
    customerMetrics: {
      repeatCustomers: 0,
      newCustomers: 0,
      retentionPct: null,
      averageSpendPaise: 0,
      highestBillPaise: 0,
      lowestBillPaise: 0,
    },
    staffOptions: [],
  };
}

test('buildStaffPerformanceExportSheets includes leaderboard columns', () => {
  const sheets = buildStaffPerformanceExportSheets(emptySnapshot());
  assert.equal(sheets[0]!.name, 'Leaderboard');
  assert.ok(sheets[0]!.headers.includes('Staff'));
  assert.ok(sheets[0]!.headers.includes('Revenue (₹)'));
  assert.equal(sheets[0]!.rows.length, 1);
  assert.equal(sheets[0]!.rows[0]![1], 'Ava');
  assert.equal(sheets.length, 5);
});
