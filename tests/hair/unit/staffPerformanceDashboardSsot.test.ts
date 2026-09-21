import assert from 'node:assert/strict';
import test from 'node:test';
import {
  performanceAmountFromMetricParts,
  performanceAmountPaiseFromSummary,
  salesTotalPaiseFromSummary,
} from '../../../src/hair/services/staffPerformance.ts';
import {
  parseStaffPerformanceSearchParams,
  sameMtdLastMonthPreviousRange,
} from '../../../src/hair/lib/staffPerformancePeriod.ts';

test('performanceAmountPaiseFromSummary excludes product retail', () => {
  const summary = {
    serviceRevenuePaise: 10_000,
    productRevenuePaise: 5_000,
    packageRevenuePaise: 2_000,
    membershipRevenuePaise: 1_000,
  };
  assert.equal(performanceAmountPaiseFromSummary(summary), 13_000);
  assert.equal(salesTotalPaiseFromSummary(summary), 18_000);
  assert.notEqual(performanceAmountPaiseFromSummary(summary), salesTotalPaiseFromSummary(summary));
});

test('performanceAmountFromMetricParts matches workforce service performance input', () => {
  assert.equal(performanceAmountFromMetricParts(100, 50, 25), 175);
});

test('parseStaffPerformanceSearchParams reads locations and compare mode', () => {
  const parsed = parseStaffPerformanceSearchParams({
    locations: 'loc-a,loc-b',
    compare: 'same_mtd_last_month',
  });
  assert.deepEqual(parsed.locationIds, ['loc-a', 'loc-b']);
  assert.equal(parsed.comparisonMode, 'same_mtd_last_month');
});

test('sameMtdLastMonthPreviousRange aligns day span to prior month', () => {
  const range = {
    from: new Date('2026-09-01T00:00:00.000Z'),
    to: new Date('2026-09-16T00:00:00.000Z'),
  };
  const prev = sameMtdLastMonthPreviousRange(range, 'UTC');
  assert.ok(prev.to.getTime() > prev.from.getTime());
  assert.ok(prev.to.getTime() <= range.from.getTime());
});

test('performance amount is not commission or salary', () => {
  const summary = {
    serviceRevenuePaise: 100,
    productRevenuePaise: 0,
    packageRevenuePaise: 0,
    membershipRevenuePaise: 0,
  };
  const perf = performanceAmountPaiseFromSummary(summary);
  assert.equal(perf, 100);
  assert.equal(typeof perf, 'number');
});
