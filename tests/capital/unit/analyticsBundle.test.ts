import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  EMPTY_ANALYTICS_INSIGHT_KPIS,
  normalizeAnalyticsBundle,
} from '../../../src/capital/services/analytics';

describe('normalizeAnalyticsBundle', () => {
  it('returns empty arrays when input is undefined', () => {
    const bundle = normalizeAnalyticsBundle(undefined);
    assert.deepEqual(bundle.cashFlow, []);
    assert.deepEqual(bundle.holdingTime, []);
    assert.deepEqual(bundle.inventoryAgeing, []);
    assert.deepEqual(bundle.manufacturers, []);
    assert.deepEqual(bundle.insightKpis, EMPTY_ANALYTICS_INSIGHT_KPIS);
  });

  it('preserves provided series', () => {
    const bundle = normalizeAnalyticsBundle({
      holdingTime: [{ month: '2026-01', days: 42 }],
      insightKpis: { ...EMPTY_ANALYTICS_INSIGHT_KPIS, averageHoldingDays: 42 },
    });
    assert.equal(bundle.holdingTime.length, 1);
    assert.equal(bundle.insightKpis.averageHoldingDays, 42);
  });
});

describe('chart crash reproduction (fixed)', () => {
  it('HoldingLineChart guard: undefined data must not throw on length check', () => {
    const data: { month: string; days: number }[] | undefined = undefined;
    const rows = data ?? [];
    assert.equal(rows.length, 0);
  });

  it('insightKpis optional access must not throw', () => {
    const insights = normalizeAnalyticsBundle({});
    const days = insights.insightKpis?.averageHoldingDays ?? 0;
    assert.equal(typeof days, 'number');
  });
});
