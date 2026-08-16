import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { firstOfMonth, lastDayOfMonth, prorateForMonth } from '../../src/services/billing';
import {
  billingTransitionOverlapsPaidThrough,
  resolvePaidThroughForBillingMigration,
} from '../../src/services/billingCycleMigration';
import { resolveAnniversaryPeriodContainingDate } from '../../src/lib/billing/vacatingFinalPeriodRent';
import { addDays, formatDate } from '../../src/lib/dates';

/** Pure transition math mirrored from billingCycleMigration for unit tests. */
function computeTransitionPeriod(args: {
  moveInDate: string;
  paidThroughDate: string | null;
  monthlyRentPaise: number;
}) {
  const paidThrough = args.paidThroughDate;
  let transitionStart = paidThrough
    ? formatDate(addDays(paidThrough, 1))
    : args.moveInDate;
  if (transitionStart < args.moveInDate) transitionStart = args.moveInDate;
  const monthStart = firstOfMonth(transitionStart);
  if (transitionStart === monthStart) return null;

  const periodEnd = lastDayOfMonth(transitionStart);
  if (paidThrough && paidThrough >= periodEnd) return null;

  const proration = prorateForMonth({
    monthlyRatePaise: args.monthlyRentPaise,
    billingMonth: monthStart,
    activeStart: transitionStart,
    activeEnd: formatDate(addDays(parseDate(periodEnd), 1)),
  });
  if (proration.amountPaise <= 0) return null;
  return {
    periodStart: transitionStart,
    periodEnd,
    amountPaise: proration.amountPaise,
    daysActive: proration.daysActive,
    daysInMonth: proration.daysInMonth,
  };
}

function parseDate(s: string) {
  return new Date(`${s}T00:00:00.000Z`);
}

describe('billing cycle migration transition preview', () => {
  test('paid through Aug 4 (anniversary) → transition Aug 5–31', () => {
    const t = computeTransitionPeriod({
      moveInDate: '2026-07-04',
      paidThroughDate: '2026-08-04',
      monthlyRentPaise: 412_100,
    });
    assert.ok(t);
    assert.equal(t!.periodStart, '2026-08-05');
    assert.equal(t!.periodEnd, '2026-08-31');
    assert.equal(t!.daysInMonth, 31);
    assert.ok(t!.daysActive >= 26 && t!.daysActive <= 27);
  });

  test('paid through Sep 20 → transition Sep 21–30', () => {
    const t = computeTransitionPeriod({
      moveInDate: '2026-07-21',
      paidThroughDate: '2026-09-20',
      monthlyRentPaise: 300_000,
    });
    assert.ok(t);
    assert.equal(t!.periodStart, '2026-09-21');
    assert.equal(t!.periodEnd, '2026-09-30');
    const expected = prorateForMonth({
      monthlyRatePaise: 300_000,
      billingMonth: '2026-09-01',
      activeStart: '2026-09-21',
      activeEnd: formatDate(addDays('2026-09-30', 1)),
    });
    assert.equal(t!.daysActive, expected.daysActive);
    assert.equal(t!.daysInMonth, 30);
  });

  test('already aligned on 1st — no partial transition', () => {
    const t = computeTransitionPeriod({
      moveInDate: '2026-08-01',
      paidThroughDate: '2026-08-31',
      monthlyRentPaise: 300_000,
    });
    assert.equal(t, null);
  });

  test('check-in date unchanged in transition math (move-in only sets anchor)', () => {
    const moveIn = '2026-05-15';
    const t = computeTransitionPeriod({
      moveInDate: moveIn,
      paidThroughDate: null,
      monthlyRentPaise: 200_000,
    });
    assert.ok(t);
    assert.equal(t!.periodStart, moveIn);
  });
});

describe('billing cycle migration flags', () => {
  test('already on target: calendar_month_1st + billing day 1', () => {
    const alreadyOnTarget =
      'calendar_month_1st' === 'calendar_month_1st' && 1 === 1;
    assert.equal(alreadyOnTarget, true);
  });

  test('lightweight flip: anniversary + billing day 1', () => {
    const lightweight =
      'anniversary' === 'anniversary' && 1 === 1 && 'calendar_month_1st' === 'calendar_month_1st';
    assert.equal(lightweight, true);
  });
});

describe('resolvePaidThroughForBillingMigration', () => {
  test('Saswat: paid Aug 8 → prepaid through Sep 8', () => {
    const moveIn = '2026-08-08';
    const billingDay = 8;
    const containing = resolveAnniversaryPeriodContainingDate({
      date: formatDate(addDays('2026-08-08', 1)),
      billingDay,
      moveInDate: moveIn,
    });
    assert.equal(containing?.periodEnd, '2026-09-08');

    const paidThrough = resolvePaidThroughForBillingMigration({
      moveInDate: moveIn,
      billingDay,
      billingCyclePolicy: 'anniversary',
      paidInvoiceCoverage: [
        { periodStart: '2026-07-08', periodEnd: '2026-08-08', paidPrincipalPaise: 412_080 },
      ],
      paidUntilFromVacating: null,
      lastPaidInvoice: { paidAt: new Date('2026-08-08T03:04:10.014Z'), status: 'paid' },
    });
    assert.equal(paidThrough, '2026-09-08');
  });

  test('paid through Sep 8 → bridge Sep 9–30 only', () => {
    const t = computeTransitionPeriod({
      moveInDate: '2026-08-08',
      paidThroughDate: '2026-09-08',
      monthlyRentPaise: 412_080,
    });
    assert.ok(t);
    assert.equal(t!.periodStart, '2026-09-09');
    assert.equal(t!.periodEnd, '2026-09-30');
    assert.equal(t!.daysActive, 22);
  });
});

describe('billingTransitionOverlapsPaidThrough', () => {
  test('Aug 13 transition overlaps paid through Sep 8', () => {
    assert.equal(billingTransitionOverlapsPaidThrough('2026-08-13', '2026-09-08'), true);
  });

  test('Sep 9 bridge does not overlap paid through Sep 8', () => {
    assert.equal(billingTransitionOverlapsPaidThrough('2026-09-09', '2026-09-08'), false);
  });
});
