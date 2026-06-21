/**
 * Phase 5.5 — pure billing math.
 *
 * Covers the deterministic policy surface that the resident-billing
 * services compose: late-fee accrual, vacating penalty + notice
 * compliance, electricity split rounding, and partial-month pro-ration.
 */
import { strict as assert } from 'node:assert';
import test from 'node:test';
import {
  ELECTRICITY_GRACE_DAYS,
  computeElectricityLateFee,
  computeLateFee,
  computeNextRentDueDate,
  dailyRateFromMonthly,
  daysInMonth,
  daysOverdue,
  dueDateForMonth,
  electricityDaysOverdue,
  electricityDueDate,
  firstOfMonth,
  formatInr,
  isNoticeCompliant,
  monthBounds,
  prorateForMonth,
  splitElectricity,
  vacatingPenalty,
} from '../../src/services/billing';
import { formatDate } from '../../src/lib/dates';

// ───────────────────────────────────────────────────────────────────────────
// daysInMonth / monthBounds / firstOfMonth
// ───────────────────────────────────────────────────────────────────────────

test('daysInMonth handles 28/29/30/31', () => {
  assert.equal(daysInMonth('2026-01-15'), 31);
  assert.equal(daysInMonth('2026-02-15'), 28);
  assert.equal(daysInMonth('2024-02-15'), 29); // leap
  assert.equal(daysInMonth('2026-04-15'), 30);
});

test('monthBounds returns half-open [first, next-first)', () => {
  const { start, end } = monthBounds('2026-06-12');
  assert.equal(formatDate(start), '2026-06-01');
  assert.equal(formatDate(end), '2026-07-01');
});

test('firstOfMonth normalises to YYYY-MM-01', () => {
  assert.equal(firstOfMonth('2026-06-30'), '2026-06-01');
  assert.equal(firstOfMonth('2026-12-01'), '2026-12-01');
});

// ───────────────────────────────────────────────────────────────────────────
// Late-fee policy
// ───────────────────────────────────────────────────────────────────────────

test('dueDateForMonth is the 5th of the billing month', () => {
  assert.equal(formatDate(dueDateForMonth('2026-06-01')), '2026-06-05');
});

test('daysOverdue: zero through the 5th, 1 on the 6th', () => {
  assert.equal(daysOverdue('2026-06-01', '2026-06-01'), 0);
  assert.equal(daysOverdue('2026-06-01', '2026-06-05'), 0); // grace
  assert.equal(daysOverdue('2026-06-01', '2026-06-06'), 1);
  assert.equal(daysOverdue('2026-06-01', '2026-06-15'), 10);
});

test('computeLateFee matches spec example (₹6000 → +₹60/day)', () => {
  const rent = 6_00_000; // ₹6,000
  // Day of grace: 0 fee.
  assert.equal(computeLateFee({ rentPaise: rent, billingMonth: '2026-06-01', today: '2026-06-05' }), 0);
  // Day 1 overdue (6th): 1% = ₹60.
  assert.equal(computeLateFee({ rentPaise: rent, billingMonth: '2026-06-01', today: '2026-06-06' }), 60_00);
  // Day 2 overdue (7th): 2% = ₹120 — linear, NOT compounded.
  assert.equal(computeLateFee({ rentPaise: rent, billingMonth: '2026-06-01', today: '2026-06-07' }), 120_00);
  // Day 30 overdue: 30% = ₹1,800.
  assert.equal(computeLateFee({ rentPaise: rent, billingMonth: '2026-06-01', today: '2026-07-05' }), 1800_00);
});

test('computeLateFee returns 0 for zero rent', () => {
  assert.equal(computeLateFee({ rentPaise: 0, billingMonth: '2026-06-01', today: '2026-07-01' }), 0);
});

// ───────────────────────────────────────────────────────────────────────────
// Vacating penalty
// ───────────────────────────────────────────────────────────────────────────

test('dailyRateFromMonthly is floor(monthly / 30)', () => {
  assert.equal(dailyRateFromMonthly(6_00_000), 20_000); // ₹6000 / 30 = ₹200
  assert.equal(dailyRateFromMonthly(14_00_000), 46_666); // ₹14000 / 30 = ₹466.66 floor 46_666 paise
});

test('vacatingPenalty matches spec example (₹6000 → ₹1000)', () => {
  assert.equal(vacatingPenalty(6_00_000), 100_000); // 5 × ₹200 = ₹1,000
});

test('isNoticeCompliant: 14-day boundary inclusive', () => {
  assert.equal(
    isNoticeCompliant({ noticeGivenDate: '2026-06-01', vacatingDate: '2026-06-15' }),
    true,
  );
  assert.equal(
    isNoticeCompliant({ noticeGivenDate: '2026-06-01', vacatingDate: '2026-06-14' }),
    false,
  );
  assert.equal(
    isNoticeCompliant({ noticeGivenDate: '2026-06-01', vacatingDate: '2026-06-30' }),
    true,
  );
  assert.equal(
    isNoticeCompliant({ noticeGivenDate: '2026-06-01', vacatingDate: '2026-06-01' }),
    false,
  );
});

// ───────────────────────────────────────────────────────────────────────────
// Electricity split
// ───────────────────────────────────────────────────────────────────────────

test('splitElectricity: even split, no remainder', () => {
  const r = splitElectricity({ totalPaise: 1500_00, occupantCount: 2 });
  assert.equal(r.perResidentPaise, 750_00);
  assert.equal(r.remainderPaise, 0);
});

test('splitElectricity: rounding remainder absorbed by operator', () => {
  // ₹1501 split 3 ways = ₹500 each + ₹1 remainder
  const r = splitElectricity({ totalPaise: 1501_00, occupantCount: 3 });
  assert.equal(r.perResidentPaise, 500_33); // floor(150100/3) = 50033 paise
  assert.equal(r.remainderPaise, 1); // 150100 - 3*50033 = 1
});

test('splitElectricity: zero occupants → 0 per resident, full remainder', () => {
  const r = splitElectricity({ totalPaise: 1500_00, occupantCount: 0 });
  assert.equal(r.perResidentPaise, 0);
  assert.equal(r.remainderPaise, 1500_00);
});

// ───────────────────────────────────────────────────────────────────────────
// Pro-ration
// ───────────────────────────────────────────────────────────────────────────

test('prorateForMonth: full month → full rent', () => {
  const r = prorateForMonth({
    monthlyRatePaise: 6000_00,
    billingMonth: '2026-06-01',
    activeStart: '2026-06-01',
    activeEnd: '2026-07-01',
  });
  assert.equal(r.amountPaise, 6000_00);
  assert.equal(r.isFullMonth, true);
  assert.equal(r.daysActive, 30);
});

test('prorateForMonth: partial month — resident joined on 15th of 30-day month', () => {
  // June has 30 days. Active 16 days (15-30 inclusive ⇒ 15 → 31 exclusive = 16 days).
  const r = prorateForMonth({
    monthlyRatePaise: 6000_00,
    billingMonth: '2026-06-01',
    activeStart: '2026-06-15',
    activeEnd: '2026-07-01',
  });
  assert.equal(r.daysActive, 16);
  assert.equal(r.isFullMonth, false);
  // floor(6000_00 * 16 / 30) = floor(320000) = 320000.
  assert.equal(r.amountPaise, 320_000);
});

test('prorateForMonth: zero overlap → 0', () => {
  const r = prorateForMonth({
    monthlyRatePaise: 6000_00,
    billingMonth: '2026-06-01',
    activeStart: '2026-08-01',
    activeEnd: '2026-09-01',
  });
  assert.equal(r.amountPaise, 0);
  assert.equal(r.daysActive, 0);
});

test('prorateForMonth: open-ended (far-future end) → full month', () => {
  const r = prorateForMonth({
    monthlyRatePaise: 6000_00,
    billingMonth: '2026-06-01',
    activeStart: '2026-05-01',
    activeEnd: '9999-12-31',
  });
  assert.equal(r.amountPaise, 6000_00);
  assert.equal(r.isFullMonth, true);
});

// ───────────────────────────────────────────────────────────────────────────
// formatInr (cosmetic but called in many UIs)
// ───────────────────────────────────────────────────────────────────────────

test('formatInr basic + signed + sub-rupee', () => {
  assert.equal(formatInr(6000_00), '₹6,000.00');
  assert.equal(formatInr(0), '₹0.00');
  assert.equal(formatInr(123), '₹1.23');
  assert.equal(formatInr(-500_00), '-₹500.00');
});

// ───────────────────────────────────────────────────────────────────────────
// Electricity due date + late fee
// ───────────────────────────────────────────────────────────────────────────

test('ELECTRICITY_GRACE_DAYS is 3 (spec)', () => {
  assert.equal(ELECTRICITY_GRACE_DAYS, 3);
});

test('electricityDueDate adds 3 days', () => {
  const d = electricityDueDate('2026-07-01');
  assert.equal(formatDate(d), '2026-07-04');
});

test('electricityDaysOverdue: 0 on due date, ticks up after', () => {
  assert.equal(electricityDaysOverdue('2026-07-04', '2026-07-04'), 0);
  assert.equal(electricityDaysOverdue('2026-07-04', '2026-07-05'), 1);
  assert.equal(electricityDaysOverdue('2026-07-04', '2026-07-14'), 10);
  assert.equal(electricityDaysOverdue('2026-07-04', '2026-07-01'), 0); // pre-due
});

test('computeElectricityLateFee: 1%/day after due (spec example)', () => {
  // Spec: ₹1500 bill, 1%/day after due. Day 1 late = ₹15, day 10 = ₹150.
  const amount = 1500_00;
  const dueDate = '2026-07-04';
  assert.equal(
    computeElectricityLateFee({ amountPaise: amount, dueDate, today: '2026-07-04' }),
    0,
  );
  assert.equal(
    computeElectricityLateFee({ amountPaise: amount, dueDate, today: '2026-07-05' }),
    15_00,
  );
  assert.equal(
    computeElectricityLateFee({ amountPaise: amount, dueDate, today: '2026-07-14' }),
    150_00,
  );
});

test('splitElectricity with prepaid credit deducted first', () => {
  const gross = 1500_00;
  const prepaid = 500_00;
  const net = gross - Math.min(prepaid, gross);
  const split = splitElectricity({ totalPaise: net, occupantCount: 2 });
  assert.equal(net, 1000_00);
  assert.equal(split.perResidentPaise, 500_00);
  assert.equal(split.remainderPaise, 0);
});

test('computeElectricityLateFee: 0 for zero or negative amounts', () => {
  assert.equal(
    computeElectricityLateFee({ amountPaise: 0, dueDate: '2026-07-04', today: '2026-08-01' }),
    0,
  );
  assert.equal(
    computeElectricityLateFee({ amountPaise: -100, dueDate: '2026-07-04', today: '2026-08-01' }),
    0,
  );
});

test('computeNextRentDueDate uses open invoice when present', () => {
  assert.equal(
    computeNextRentDueDate({
      moveInDate: '2026-06-01',
      billingDay: 1,
      openInvoiceDueDate: '2026-06-23',
    }),
    '2026-06-23',
  );
});

test('computeNextRentDueDate projects from billing day after check-in', () => {
  assert.equal(
    computeNextRentDueDate({
      moveInDate: '2026-06-15',
      billingDay: 15,
      today: '2026-06-10',
    }),
    '2026-06-15',
  );
  assert.equal(
    computeNextRentDueDate({
      moveInDate: '2026-06-15',
      billingDay: 15,
      today: '2026-06-20',
    }),
    '2026-07-15',
  );
});
