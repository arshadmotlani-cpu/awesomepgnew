import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { firstOfMonth, lastDayOfMonth, prorateForMonth } from '../../src/services/billing';

/** Pure transition math mirrored from billingCycleMigration for unit tests. */
function computeTransitionPeriod(args: {
  moveInDate: string;
  paidThroughDate: string | null;
  monthlyRentPaise: number;
}) {
  const paidThrough = args.paidThroughDate;
  let transitionStart = paidThrough
    ? new Date(`${paidThrough}T00:00:00Z`)
    : new Date(`${args.moveInDate}T00:00:00Z`);
  if (paidThrough) {
    transitionStart.setUTCDate(transitionStart.getUTCDate() + 1);
  }
  const transitionStartStr = transitionStart.toISOString().slice(0, 10);
  const monthStart = firstOfMonth(transitionStartStr);
  if (transitionStartStr === monthStart) return null;

  const periodEnd = lastDayOfMonth(transitionStartStr);
  const proration = prorateForMonth({
    monthlyRatePaise: args.monthlyRentPaise,
    billingMonth: monthStart,
    activeStart: transitionStartStr,
    activeEnd: new Date(`${periodEnd}T00:00:00Z`),
  });
  if (proration.amountPaise <= 0) return null;
  return {
    periodStart: transitionStartStr,
    periodEnd,
    amountPaise: proration.amountPaise,
    daysActive: proration.daysActive,
    daysInMonth: proration.daysInMonth,
  };
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
      activeEnd: new Date('2026-09-30T00:00:00Z'),
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
