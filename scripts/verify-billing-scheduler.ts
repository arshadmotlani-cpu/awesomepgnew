/* eslint-disable no-console */
/**
 * Simulates IST anniversary dates for the daily rent billing scheduler.
 * Pure logic only — no DB required.
 */
import 'dotenv/config';
import {
  billingDayFromMoveIn,
  firstAutoBillingDate,
  isBillingAnniversaryToday,
  billingMonthForAnniversaryDate,
} from '../src/services/billing';
import { formatDate, parseDate, addDays } from '../src/lib/dates';

function ok(label: string) {
  console.log(`  ✓ ${label}`);
}
function fail(label: string): never {
  console.error(`  ✗ ${label}`);
  process.exit(1);
}

function assertEq(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) fail(`${label}: expected ${expected}, got ${actual}`);
  ok(label);
}

console.log('Billing scheduler anniversary simulation (IST dates as UTC calendar dates)\n');

// Scenario: June 1 check-in
const anchor = '2026-06-01';
const billingDay = billingDayFromMoveIn(anchor);
const firstAuto = firstAutoBillingDate(anchor, billingDay);
assertEq(firstAuto, '2026-07-01', 'June check-in → first auto July 1');
assertEq(
  isBillingAnniversaryToday('2026-06-01', billingDay, firstAuto),
  false,
  'No bill on check-in day in check-in month',
);
assertEq(
  isBillingAnniversaryToday('2026-07-01', billingDay, firstAuto),
  true,
  'First anniversary on July 1',
);
assertEq(
  billingMonthForAnniversaryDate('2026-07-01'),
  '2026-07-01',
  'July run generates July billing month',
);

// Scenario: Jan 31 anchor
const jan31Day = billingDayFromMoveIn('2026-01-31');
const jan31First = firstAutoBillingDate('2026-01-31', jan31Day);
assertEq(jan31First, '2026-02-28', 'Jan 31 anchor → Feb 28 first auto');
assertEq(
  isBillingAnniversaryToday('2026-02-28', jan31Day, jan31First),
  true,
  'Feb 28 is anniversary for Jan 31 anchor',
);

// Walk 90 days from July 1 — only billing day hits
let hits = 0;
let cursor = parseDate('2026-07-01');
for (let i = 0; i < 90; i++) {
  const d = formatDate(cursor);
  if (isBillingAnniversaryToday(d, billingDay, firstAuto)) hits += 1;
  cursor = addDays(cursor, 1);
}
if (hits !== 3) fail(`Expected 3 anniversary hits in 90 days from July, got ${hits}`);
ok('Exactly one hit per month in 90-day walk');

console.log('\nAll scheduler anniversary checks passed.');
