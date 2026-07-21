import assert from 'node:assert/strict';
import { test } from 'node:test';
import { computeBillingHealthScore } from '../../src/services/billingHealth';
import { upcomingScheduleDates } from '../../src/services/billingUpcomingSchedule';

test('computeBillingHealthScore returns excellent when no issues', () => {
  const result = computeBillingHealthScore({
    unresolvedFailures: 0,
    overdueRentInvoices: 0,
    pendingApprovals: 0,
    lastRunFailed: false,
    dueInSevenDays: 5,
  });
  assert.equal(result.score, 100);
  assert.equal(result.grade, 'excellent');
});

test('computeBillingHealthScore penalizes failures and overdue', () => {
  const result = computeBillingHealthScore({
    unresolvedFailures: 2,
    overdueRentInvoices: 10,
    pendingApprovals: 3,
    lastRunFailed: true,
    dueInSevenDays: 0,
  });
  assert.ok(result.score < 60);
  assert.ok(result.issues.length >= 3);
});

test('upcomingScheduleDates returns consecutive dates', () => {
  const dates = upcomingScheduleDates('2026-07-01', 3);
  assert.deepEqual(dates, ['2026-07-01', '2026-07-02', '2026-07-03']);
});
