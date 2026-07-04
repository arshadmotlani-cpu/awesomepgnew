import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  anniversaryBillingPeriod,
  billingDayFromMoveIn,
  effectiveBillingDayInMonth,
  firstAutoBillingDate,
  formatAnniversaryBillingPeriodLabel,
  fullMonthlyRentPaise,
  isBillingAnniversaryToday,
  isResidentActiveOnDate,
} from '../../src/services/billing';

describe('anniversary billing — full monthly rent', () => {
  test('fullMonthlyRentPaise never prorates', () => {
    assert.equal(fullMonthlyRentPaise(412_100), 412_100);
    assert.equal(fullMonthlyRentPaise(0), 0);
  });
});

describe('anniversary billing — billing day clamping', () => {
  const cases: Array<{ billingDay: number; month: string; expectedEnd: string; expectedStart: string }> = [
    { billingDay: 1, month: '2026-02-01', expectedEnd: '2026-02-01', expectedStart: '2026-01-01' },
    { billingDay: 4, month: '2026-08-04', expectedEnd: '2026-08-04', expectedStart: '2026-07-04' },
    { billingDay: 15, month: '2026-03-15', expectedEnd: '2026-03-15', expectedStart: '2026-02-15' },
    { billingDay: 28, month: '2026-03-28', expectedEnd: '2026-03-28', expectedStart: '2026-02-28' },
    { billingDay: 29, month: '2024-03-29', expectedEnd: '2024-03-29', expectedStart: '2024-02-29' },
    { billingDay: 30, month: '2026-04-30', expectedEnd: '2026-04-30', expectedStart: '2026-03-30' },
    { billingDay: 31, month: '2026-01-31', expectedEnd: '2026-01-31', expectedStart: '2025-12-31' },
    { billingDay: 31, month: '2026-02-28', expectedEnd: '2026-02-28', expectedStart: '2026-01-31' },
    { billingDay: 31, month: '2024-02-29', expectedEnd: '2024-02-29', expectedStart: '2024-01-31' },
    { billingDay: 31, month: '2026-04-30', expectedEnd: '2026-04-30', expectedStart: '2026-03-31' },
    { billingDay: 30, month: '2026-02-28', expectedEnd: '2026-02-28', expectedStart: '2026-01-30' },
  ];

  for (const c of cases) {
    test(`billing day ${c.billingDay} on ${c.month}`, () => {
      const period = anniversaryBillingPeriod(c.expectedEnd, c.billingDay);
      assert.equal(period.periodEnd, c.expectedEnd);
      assert.equal(period.periodStart, c.expectedStart);
    });
  }
});

describe('anniversary billing — invoice schedule', () => {
  test('check-in 4 Jul → first auto bill 4 Aug', () => {
    const day = billingDayFromMoveIn('2026-07-04');
    assert.equal(day, 4);
    assert.equal(firstAutoBillingDate('2026-07-04', day), '2026-08-04');
    assert.equal(isBillingAnniversaryToday('2026-07-04', day, '2026-08-04'), false);
    assert.equal(isBillingAnniversaryToday('2026-08-04', day, '2026-08-04'), true);
  });

  test('31 Jan anchor → Feb 28 then Mar 31', () => {
    const day = 31;
    const firstAuto = firstAutoBillingDate('2026-01-31', day);
    assert.equal(firstAuto, '2026-02-28');
    assert.equal(effectiveBillingDayInMonth('2026-02-01', day), 28);
    assert.equal(isBillingAnniversaryToday('2026-02-28', day, firstAuto), true);
    assert.equal(isBillingAnniversaryToday('2026-03-31', day, firstAuto), true);
  });
});

describe('anniversary billing — period label', () => {
  test('formats 4 Jul 2026 → 4 Aug 2026', () => {
    const label = formatAnniversaryBillingPeriodLabel('2026-07-04', '2026-08-04');
    assert.match(label, /4 Jul 2026/);
    assert.match(label, /4 Aug 2026/);
    assert.match(label, /→/);
  });
});

describe('anniversary billing — stay activity', () => {
  test('active through billing anniversary', () => {
    assert.equal(
      isResidentActiveOnDate({ start: '2026-07-04', end: null }, '2026-08-04'),
      true,
    );
    assert.equal(
      isResidentActiveOnDate({ start: '2026-07-04', end: '2026-08-04' }, '2026-08-04'),
      false,
    );
  });
});
