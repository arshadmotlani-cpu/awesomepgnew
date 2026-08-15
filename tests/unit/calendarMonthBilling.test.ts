import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  calendarMonthBillingPeriod,
  firstMonthRentForCalendarPolicy,
  firstPartialMonthPeriod,
  billingPeriodForPolicy,
  defaultBillingDayForPolicy,
  STANDARD_CALENDAR_BILLING_DAY,
  firstAutoBillingDate,
  firstOfMonth,
} from '../../src/services/billing';

describe('calendar month billing SSOT', () => {
  test('first partial month: Aug 15 → Aug 31', () => {
    const partial = firstPartialMonthPeriod('2026-08-15');
    assert.equal(partial.periodStart, '2026-08-15');
    assert.equal(partial.periodEnd, '2026-08-31');
  });

  test('calendar month period: Sep 2026', () => {
    const period = calendarMonthBillingPeriod('2026-09-01');
    assert.equal(period.periodStart, '2026-09-01');
    assert.equal(period.periodEnd, '2026-09-30');
  });

  test('join Aug 15 @ ₹4,121/mo → floor(412100 × 17/31)', () => {
    const pr = firstMonthRentForCalendarPolicy(412_100, '2026-08-15');
    assert.equal(pr.daysActive, 17);
    assert.equal(pr.daysInMonth, 31);
    assert.equal(pr.isFullMonth, false);
    assert.equal(pr.amountPaise, Math.floor((412_100 * 17) / 31));
  });

  test('join Aug 31 → 1 day proration', () => {
    const pr = firstMonthRentForCalendarPolicy(412_100, '2026-08-31');
    assert.equal(pr.daysActive, 1);
    assert.equal(pr.daysInMonth, 31);
    assert.equal(pr.amountPaise, Math.floor(412_100 / 31));
  });

  test('join Aug 1 → full month', () => {
    const pr = firstMonthRentForCalendarPolicy(412_100, '2026-08-01');
    assert.equal(pr.isFullMonth, true);
    assert.equal(pr.amountPaise, 412_100);
  });

  test('Feb 28 in non-leap year', () => {
    const partial = firstPartialMonthPeriod('2025-02-28');
    assert.equal(partial.periodEnd, '2025-02-28');
    const pr = firstMonthRentForCalendarPolicy(300_000, '2025-02-28');
    assert.equal(pr.daysActive, 1);
    assert.equal(pr.daysInMonth, 28);
  });

  test('default billing day for calendar policy is 1', () => {
    assert.equal(defaultBillingDayForPolicy('calendar_month_1st', '2026-07-21'), STANDARD_CALENDAR_BILLING_DAY);
    assert.equal(defaultBillingDayForPolicy('anniversary', '2026-07-21'), 21);
  });

  test('billingPeriodForPolicy calendar uses full calendar month', () => {
    const period = billingPeriodForPolicy('calendar_month_1st', {
      dueDate: '2026-09-01',
      billingDay: 1,
      billingMonth: '2026-09-01',
    });
    assert.equal(period.periodStart, '2026-09-01');
    assert.equal(period.periodEnd, '2026-09-30');
  });

  test('first auto billing after Aug 15 check-in is Sep 1', () => {
    const auto = firstAutoBillingDate('2026-08-15', STANDARD_CALENDAR_BILLING_DAY);
    assert.equal(auto, '2026-09-01');
  });

  test('first auto billing after Aug 1 check-in is Sep 1', () => {
    const auto = firstAutoBillingDate('2026-08-01', STANDARD_CALENDAR_BILLING_DAY);
    assert.equal(auto, '2026-09-01');
  });
});

describe('calendar month billing — no /30 proration', () => {
  test('April partial month uses 30 calendar days in denominator', () => {
    const pr = firstMonthRentForCalendarPolicy(300_000, '2026-04-15');
    assert.equal(pr.daysInMonth, 30);
    assert.equal(pr.daysActive, 16);
    assert.equal(pr.amountPaise, Math.floor((300_000 * 16) / 30));
  });
});
