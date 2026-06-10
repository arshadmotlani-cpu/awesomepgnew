import { strict as assert } from 'node:assert';
import test from 'node:test';
import {
  addDays,
  addMonths,
  diffDays,
  formatDate,
  isAfter,
  isBefore,
  isSameDay,
  maxDate,
  minDate,
  parseDate,
  todayString,
} from '../../src/lib/dates';

test('parseDate accepts YYYY-MM-DD and normalizes to UTC midnight', () => {
  const d = parseDate('2026-06-15');
  assert.equal(d.toISOString(), '2026-06-15T00:00:00.000Z');
});

test('parseDate accepts Date input and drops time-of-day', () => {
  const d = parseDate(new Date(Date.UTC(2026, 5, 15, 14, 30, 0)));
  assert.equal(d.toISOString(), '2026-06-15T00:00:00.000Z');
});

test('parseDate rejects invalid format', () => {
  assert.throws(() => parseDate('15-06-2026'), /YYYY-MM-DD/);
  assert.throws(() => parseDate('2026/06/15'), /YYYY-MM-DD/);
});

test('parseDate rejects nonexistent calendar dates', () => {
  assert.throws(() => parseDate('2026-02-30'), /does not exist/);
  assert.throws(() => parseDate('2025-02-29'), /does not exist/); // 2025 is not a leap year
});

test('parseDate accepts Feb 29 in leap years', () => {
  const d = parseDate('2024-02-29');
  assert.equal(formatDate(d), '2024-02-29');
});

test('formatDate produces YYYY-MM-DD', () => {
  assert.equal(formatDate(parseDate('2026-06-15')), '2026-06-15');
});

test('diffDays counts half-open nights', () => {
  assert.equal(diffDays('2026-06-01', '2026-06-10'), 9);
  assert.equal(diffDays('2026-06-01', '2026-06-01'), 0);
  assert.equal(diffDays('2026-06-10', '2026-06-01'), -9);
});

test('addDays adds calendar days, including across month boundaries', () => {
  assert.equal(formatDate(addDays('2026-06-28', 5)), '2026-07-03');
  assert.equal(formatDate(addDays('2026-12-31', 1)), '2027-01-01');
  assert.equal(formatDate(addDays('2026-03-01', -2)), '2026-02-27');
});

test('addMonths handles ordinary cases', () => {
  assert.equal(formatDate(addMonths('2026-06-15', 1)), '2026-07-15');
  assert.equal(formatDate(addMonths('2026-06-15', 12)), '2027-06-15');
  assert.equal(formatDate(addMonths('2026-06-15', -2)), '2026-04-15');
});

test('addMonths clamps end-of-month overflow', () => {
  // Jan 31 + 1 month = Feb 28 (not Mar 3)
  assert.equal(formatDate(addMonths('2026-01-31', 1)), '2026-02-28');
  // Jan 31 + 1 month in a leap year = Feb 29
  assert.equal(formatDate(addMonths('2024-01-31', 1)), '2024-02-29');
  // Mar 31 + 1 month = Apr 30
  assert.equal(formatDate(addMonths('2026-03-31', 1)), '2026-04-30');
});

test('comparison helpers', () => {
  assert.equal(isBefore('2026-06-01', '2026-06-02'), true);
  assert.equal(isBefore('2026-06-02', '2026-06-01'), false);
  assert.equal(isAfter('2026-06-02', '2026-06-01'), true);
  assert.equal(isSameDay('2026-06-01', '2026-06-01'), true);
  assert.equal(formatDate(maxDate('2026-06-01', '2026-06-02')), '2026-06-02');
  assert.equal(formatDate(minDate('2026-06-01', '2026-06-02')), '2026-06-01');
});

test('todayString produces a YYYY-MM-DD string', () => {
  const s = todayString();
  assert.match(s, /^\d{4}-\d{2}-\d{2}$/);
  // Round-trip parses cleanly.
  assert.equal(formatDate(parseDate(s)), s);
});
