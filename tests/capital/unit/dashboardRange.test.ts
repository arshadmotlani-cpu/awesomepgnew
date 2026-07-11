import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  currentMonthKey,
  pctChange,
  resolveDashboardRange,
  shiftMonth,
} from '../../../src/capital/lib/dashboardRange';

describe('dashboardRange', () => {
  it('defaults to current month', () => {
    const r = resolveDashboardRange(undefined);
    assert.equal(r.key, 'month');
    assert.equal(r.month, currentMonthKey());
    assert.match(r.from ?? '', /^\d{4}-\d{2}-01$/);
  });

  it('navigates month cursor', () => {
    const r = resolveDashboardRange('month', undefined, undefined, '2026-06');
    assert.equal(r.month, '2026-06');
    assert.equal(r.from, '2026-06-01');
    assert.equal(r.to, '2026-06-30');
    assert.match(r.label, /2026/);
  });

  it('shifts months across year boundary', () => {
    assert.equal(shiftMonth('2026-01', -1), '2025-12');
    assert.equal(shiftMonth('2025-12', 1), '2026-01');
  });

  it('accepts future month cursor', () => {
    const future = resolveDashboardRange('month', undefined, undefined, '2099-01');
    assert.equal(future.from, '2099-01-01');
  });

  it('computes pctChange', () => {
    assert.equal(pctChange(110, 100), 10);
    assert.equal(pctChange(0, 0), 0);
    assert.equal(pctChange(50, 0), null);
  });
});
