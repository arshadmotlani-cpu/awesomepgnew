import assert from 'node:assert/strict';
import test from 'node:test';
import {
  revenueByPgRowReconciles,
  type RevenueByPgRow,
} from '../../src/services/revenueCommandCenter';
import {
  selectFeaturedPropertyRows,
  toPropertyPerformanceRow,
} from '../../src/services/overviewDashboard';
import { sumOperatingRevenueComponents } from '../../src/services/financialMetricsEngine';

function makeByPgRow(overrides: Partial<RevenueByPgRow> & Pick<RevenueByPgRow, 'pgId' | 'pgName'>): RevenueByPgRow {
  const rentRevenuePaise = overrides.rentRevenuePaise ?? 100_000;
  const lateFeePaise = overrides.lateFeePaise ?? 1_000;
  const electricityRevenuePaise = overrides.electricityRevenuePaise ?? 20_000;
  const otherIncomePaise = overrides.otherIncomePaise ?? 0;
  const totalRevenuePaise =
    overrides.totalRevenuePaise ??
    sumOperatingRevenueComponents({
      rentPrincipalPaise: rentRevenuePaise,
      lateFeePaise,
      electricityPaise: electricityRevenuePaise,
      otherIncomePaise,
    });

  return {
    occupancyPct: 80,
    occupiedBeds: 8,
    totalBeds: 10,
    depositCollectedPaise: 50_000,
    depositHeldPaise: 0,
    depositPaidCount: 2,
    depositPendingCount: 0,
    depositRequirementMissingCount: 0,
    rentRevenuePaise,
    lateFeePaise,
    electricityRevenuePaise,
    otherIncomePaise,
    totalRevenuePaise,
    ...overrides,
  };
}

test('toPropertyPerformanceRow only maps RevenueByPgRow fields (SSOT shape)', () => {
  const row = makeByPgRow({ pgId: 'pg-1', pgName: 'Central Female PG' });
  const perf = toPropertyPerformanceRow(row, '2026-07-01');

  assert.equal(perf.pgId, row.pgId);
  assert.equal(perf.operatingRevenuePaise, row.totalRevenuePaise);
  assert.equal(perf.rentRevenuePaise, row.rentRevenuePaise);
  assert.equal(perf.electricityRevenuePaise, row.electricityRevenuePaise);
  assert.equal(perf.lateFeePaise, row.lateFeePaise);
  assert.equal(perf.depositCollectedPaise, row.depositCollectedPaise);
  assert.equal(perf.occupancyPct, row.occupancyPct);
  assert.ok(perf.href.includes('/admin/revenue/pg/pg-1'));
  assert.notEqual(
    perf.operatingRevenuePaise,
    perf.operatingRevenuePaise + perf.depositCollectedPaise,
    'deposits must stay outside operating revenue',
  );
});

test('selectFeaturedPropertyRows accepts only RevenueByPgRow[] and preserves reconcile', () => {
  const rows: RevenueByPgRow[] = [
    makeByPgRow({ pgId: 'a', pgName: 'Awesome PG Central Female' }),
    makeByPgRow({
      pgId: 'b',
      pgName: 'Awesome PG Shantinagar',
      rentRevenuePaise: 200_000,
      electricityRevenuePaise: 10_000,
      lateFeePaise: 0,
    }),
  ];

  for (const row of rows) {
    assert.equal(revenueByPgRowReconciles(row), true);
  }

  const featured = selectFeaturedPropertyRows(rows, '2026-07-01');
  assert.ok(featured.length >= 1);
  for (const perf of featured) {
    const source = rows.find((r) => r.pgId === perf.pgId);
    assert.ok(source);
    assert.equal(perf.operatingRevenuePaise, source!.totalRevenuePaise);
    assert.equal(revenueByPgRowReconciles(source!), true);
  }
});

test('each byPg row must satisfy revenueByPgRowReconciles; deposits excluded from total', () => {
  const rows = [
    makeByPgRow({ pgId: '1', pgName: 'PG One', depositCollectedPaise: 99_000 }),
    makeByPgRow({
      pgId: '2',
      pgName: 'PG Two',
      rentRevenuePaise: 50_000,
      lateFeePaise: 500,
      electricityRevenuePaise: 5_000,
      otherIncomePaise: 250,
      depositCollectedPaise: 12_000,
    }),
  ];

  for (const row of rows) {
    assert.equal(revenueByPgRowReconciles(row), true);
    assert.equal(
      row.totalRevenuePaise,
      sumOperatingRevenueComponents({
        rentPrincipalPaise: row.rentRevenuePaise,
        lateFeePaise: row.lateFeePaise,
        electricityPaise: row.electricityRevenuePaise,
        otherIncomePaise: row.otherIncomePaise,
      }),
    );
    assert.ok(row.totalRevenuePaise !== row.totalRevenuePaise + row.depositCollectedPaise);
  }

  const broken = makeByPgRow({
    pgId: 'broken',
    pgName: 'Broken',
    totalRevenuePaise: 1,
  });
  assert.equal(revenueByPgRowReconciles(broken), false);
});

test('sum of byPg rent + late fees uses same operating helpers as MTD (no second SQL)', () => {
  const rows = [
    makeByPgRow({ pgId: '1', pgName: 'A', rentRevenuePaise: 100_000, lateFeePaise: 1_000 }),
    makeByPgRow({ pgId: '2', pgName: 'B', rentRevenuePaise: 200_000, lateFeePaise: 2_000 }),
  ];

  const rentPlusLate = rows.reduce((sum, r) => sum + r.rentRevenuePaise + r.lateFeePaise, 0);
  const viaHelper = rows.reduce(
    (sum, r) =>
      sum +
      sumOperatingRevenueComponents({
        rentPrincipalPaise: r.rentRevenuePaise,
        lateFeePaise: r.lateFeePaise,
        electricityPaise: 0,
        otherIncomePaise: 0,
      }),
    0,
  );

  assert.equal(rentPlusLate, 303_000);
  assert.equal(viaHelper, rentPlusLate);
});
