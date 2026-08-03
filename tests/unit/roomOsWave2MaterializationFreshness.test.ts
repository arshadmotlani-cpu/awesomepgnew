/**
 * Room OS Wave 2 — materialization freshness audit tests.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import {
  classifyMaterializedAge,
  DEFAULT_FRESHNESS_THRESHOLDS,
  mergeFreshnessSeverity,
} from '@/src/roomOs/acceptance/materializationFreshnessAudit';

describe('Room OS Wave 2 — Materialization freshness', () => {
  test('classifyMaterializedAge uses 6h warn and 24h fail defaults', () => {
    assert.equal(DEFAULT_FRESHNESS_THRESHOLDS.warnAgeMs, 6 * 60 * 60 * 1000);
    assert.equal(DEFAULT_FRESHNESS_THRESHOLDS.failAgeMs, 24 * 60 * 60 * 1000);
    assert.equal(classifyMaterializedAge(null), 'warning');
    assert.equal(classifyMaterializedAge(60_000), 'pass');
    assert.equal(classifyMaterializedAge(7 * 60 * 60 * 1000), 'warning');
    assert.equal(classifyMaterializedAge(25 * 60 * 60 * 1000), 'fail');
  });

  test('mergeFreshnessSeverity prefers fail over warning over pass', () => {
    assert.equal(mergeFreshnessSeverity('pass', 'warning'), 'warning');
    assert.equal(mergeFreshnessSeverity('warning', 'fail'), 'fail');
    assert.equal(mergeFreshnessSeverity('pass', 'pass'), 'pass');
  });

  test('freshness audit monitors business_metrics_index age', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/roomOs/acceptance/materializationFreshnessAudit.ts'),
      'utf8',
    );
    assert.match(src, /businessMetricsIndex\.materializedAt/);
    assert.match(src, /businessMetricsMaterializedAgeMs/);
  });
});
