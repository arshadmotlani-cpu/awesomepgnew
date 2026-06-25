/**
 * Anniversary billing scheduler — pure date logic unit tests.
 */
import { strict as assert } from 'node:assert';
import test from 'node:test';
import {
  billingDayFromMoveIn,
  billingMonthForAnniversaryDate,
  effectiveBillingDayInMonth,
  firstAutoBillingDate,
  isBillingAnniversaryToday,
} from '../../src/services/billing';
import { formatDate } from '../../src/lib/dates';

test('billingDayFromMoveIn clamps to 1–31', () => {
  assert.equal(billingDayFromMoveIn('2026-01-31'), 31);
  assert.equal(billingDayFromMoveIn('2026-02-01'), 1);
});

test('effectiveBillingDayInMonth: 31st → last day of month', () => {
  assert.equal(effectiveBillingDayInMonth('2026-01-15', 31), 31);
  assert.equal(effectiveBillingDayInMonth('2026-02-15', 31), 28);
  assert.equal(effectiveBillingDayInMonth('2024-02-15', 31), 29);
  assert.equal(effectiveBillingDayInMonth('2026-04-15', 31), 30);
});

test('first auto bill is on billing day in month after check-in', () => {
  // Check-in 1 June → billing day 1 → first auto 1 July
  assert.equal(
    firstAutoBillingDate('2026-06-01', billingDayFromMoveIn('2026-06-01')),
    '2026-07-01',
  );
  // Check-in 15 March → first auto 15 April
  assert.equal(
    firstAutoBillingDate('2026-03-15', billingDayFromMoveIn('2026-03-15')),
    '2026-04-15',
  );
});

test('check-in month is never an anniversary billing day before first auto date', () => {
  const billingDay = billingDayFromMoveIn('2026-06-01');
  const firstAuto = firstAutoBillingDate('2026-06-01', billingDay);
  assert.equal(isBillingAnniversaryToday('2026-06-01', billingDay, firstAuto), false);
  assert.equal(isBillingAnniversaryToday('2026-06-15', billingDay, firstAuto), false);
  assert.equal(isBillingAnniversaryToday('2026-07-01', billingDay, firstAuto), true);
});

test('31st anchor bills on last day of shorter months', () => {
  const billingDay = billingDayFromMoveIn('2026-01-31');
  const firstAuto = firstAutoBillingDate('2026-01-31', billingDay);
  assert.equal(firstAuto, '2026-02-28');
  assert.equal(isBillingAnniversaryToday('2026-02-28', billingDay, firstAuto), true);
  assert.equal(isBillingAnniversaryToday('2026-02-27', billingDay, firstAuto), false);
  assert.equal(isBillingAnniversaryToday('2026-03-31', billingDay, firstAuto), true);
});

test('billingMonthForAnniversaryDate is current calendar month', () => {
  assert.equal(billingMonthForAnniversaryDate('2026-07-01'), '2026-07-01');
  assert.equal(billingMonthForAnniversaryDate('2026-07-15'), '2026-07-01');
});

test('isBillingAnniversaryToday requires exact effective day', () => {
  const billingDay = 5;
  const firstAuto = '2026-07-05';
  assert.equal(isBillingAnniversaryToday('2026-07-05', billingDay, firstAuto), true);
  assert.equal(isBillingAnniversaryToday('2026-07-04', billingDay, firstAuto), false);
  assert.equal(isBillingAnniversaryToday('2026-06-05', billingDay, firstAuto), false);
});
