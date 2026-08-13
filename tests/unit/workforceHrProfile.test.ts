import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  validateAccountNumber,
  validateIfscCode,
  validatePercentage,
  validatePositiveSalaryInr,
  validateThresholdMultiplier,
  validateUpiId,
} from '@/src/workforce/lib/hrValidation';
import {
  computePercentageThresholdIncentivePaise,
  thresholdPaiseFromConfig,
} from '@/src/workforce/lib/incentivePlanMath';
import { scheduleFromWeekOffDays, weekOffDaysFromSchedule } from '@/src/workforce/lib/weekOff';

describe('Workforce HR validation', () => {
  test('account number must be numeric 9-18 digits', () => {
    assert.equal(validateAccountNumber('123456789'), '123456789');
    assert.throws(() => validateAccountNumber('abc'));
  });

  test('IFSC format', () => {
    assert.equal(validateIfscCode('hdfc0001234'), 'HDFC0001234');
    assert.throws(() => validateIfscCode('BAD'));
  });

  test('UPI format', () => {
    assert.equal(validateUpiId('Name@okhdfcbank'), 'name@okhdfcbank');
    assert.throws(() => validateUpiId('not-upi'));
  });

  test('salary and percentage bounds', () => {
    assert.equal(validatePositiveSalaryInr('15000'), 1_500_000);
    assert.throws(() => validatePositiveSalaryInr('-1'));
    assert.equal(validatePercentage('10'), 1000);
    assert.throws(() => validatePercentage('101'));
    assert.equal(validateThresholdMultiplier('2'), 2);
    assert.throws(() => validateThresholdMultiplier('0'));
  });
});

describe('Workforce incentive plan math', () => {
  test('percentage threshold switch — 10% on entire performance above threshold', () => {
    const config = {
      baseSalaryPaise: 1_500_000,
      thresholdMultiplier: 2,
      belowThresholdPercentBps: 500,
      aboveThresholdPercentBps: 1000,
    };
    assert.equal(thresholdPaiseFromConfig(config), 3_000_000);
    assert.equal(computePercentageThresholdIncentivePaise(config, 4_200_000), 420_000);
  });
});

describe('Workforce week off schedule', () => {
  test('maps off days to is_off flags', () => {
    const days = scheduleFromWeekOffDays([0, 3]);
    const sun = days.find((d) => d.dayOfWeek === 0);
    const wed = days.find((d) => d.dayOfWeek === 3);
    const mon = days.find((d) => d.dayOfWeek === 1);
    assert.equal(sun?.isOff, true);
    assert.equal(wed?.isOff, true);
    assert.equal(mon?.isOff, false);
  });

  test('round-trips week off days', () => {
    const schedule = scheduleFromWeekOffDays([2, 5]);
    const off = weekOffDaysFromSchedule(
      schedule.map((d) => ({ dayOfWeek: d.dayOfWeek, isOff: Boolean(d.isOff) })),
    );
    assert.deepEqual(off.sort(), [2, 5]);
  });
});

describe('Workforce HR UI contracts', () => {
  test('AddEmployeePopup uses five tabbed configuration sections', () => {
    const { readFileSync } = require('node:fs') as typeof import('node:fs');
    const { join } = require('node:path') as typeof import('node:path');
    const src = readFileSync(
      join(process.cwd(), 'src/workforce/components/AddEmployeePopup.tsx'),
      'utf8',
    );
    assert.match(src, /EmployeeProfileNav/);
    assert.match(src, /activeSection === 'staff-details'/);
    assert.match(src, /activeSection === 'credentials'/);
    assert.match(src, /activeSection === 'salary'/);
    assert.match(src, /activeSection === 'rights'/);
    assert.match(src, /activeSection === 'schedule'/);
    assert.match(src, /name="fullName"/);
    assert.match(src, /name="bankAccountHolderName"/);
    assert.match(src, /name="salaryInr"/);
    assert.match(src, /WeekOffPicker/);
    assert.match(src, /WorkingHoursFields/);
    assert.match(src, /Advanced Permission Overrides/);
    assert.match(src, /IncentiveRuleBuilder/);

    const staffBlock = src.split("activeSection === 'staff-details'")[1]?.split(
      "activeSection === 'credentials'",
    )[0];
    assert.ok(staffBlock);
    assert.doesNotMatch(staffBlock!, /name="salaryInr"/);
    assert.doesNotMatch(staffBlock!, /name="bankAccountHolderName"/);
    assert.doesNotMatch(staffBlock!, /WeekOffPicker/);

    const credentialsBlock = src.split("activeSection === 'credentials'")[1]?.split(
      "activeSection === 'salary'",
    )[0];
    assert.ok(credentialsBlock);
    assert.match(credentialsBlock!, /name="bankAccountHolderName"/);
    assert.doesNotMatch(credentialsBlock!, /name="salaryInr"/);

    const salaryBlock = src.split("activeSection === 'salary'")[1]?.split(
      "activeSection === 'rights'",
    )[0];
    assert.ok(salaryBlock);
    assert.match(salaryBlock!, /name="salaryInr"/);
    assert.match(salaryBlock!, /Service incentive/);
    assert.doesNotMatch(salaryBlock!, /name="bankAccountHolderName"/);
  });

  test('EmployeeProfilePanel has five profile sections with distinct content', () => {
    const { readFileSync } = require('node:fs') as typeof import('node:fs');
    const { join } = require('node:path') as typeof import('node:path');
    const profileSrc = readFileSync(
      join(process.cwd(), 'src/workforce/components/EmployeeProfilePanel.tsx'),
      'utf8',
    );
    const navSrc = readFileSync(
      join(process.cwd(), 'src/workforce/components/EmployeeProfileNav.tsx'),
      'utf8',
    );
    assert.match(navSrc, /Staff Details/);
    assert.match(navSrc, /Credentials/);
    assert.match(navSrc, /Salary & Incentives/);
    assert.match(navSrc, /Additional Rights/);
    assert.match(navSrc, /Shift Schedule/);
    assert.match(profileSrc, /activeSection === 'staff-details'/);
    assert.match(profileSrc, /activeSection === 'credentials'/);
    assert.match(profileSrc, /activeSection === 'salary'/);
    assert.match(profileSrc, /activeSection === 'rights'/);
    assert.match(profileSrc, /activeSection === 'schedule'/);
    assert.match(profileSrc, /WorkingHoursEditor/);
    assert.match(profileSrc, /IncentiveRuleBuilder/);
    assert.match(profileSrc, /SECTION_SAVE_LABELS/);
    assert.doesNotMatch(profileSrc, /Salary Effective From/i);

    const staffBlock = profileSrc.split("activeSection === 'staff-details'")[1]?.split(
      "activeSection === 'credentials'",
    )[0];
    assert.ok(staffBlock);
    assert.doesNotMatch(staffBlock!, /name="salaryInr"/);
    assert.doesNotMatch(staffBlock!, /name="bankAccountHolderName"/);
    assert.doesNotMatch(staffBlock!, /WeekOffPicker/);

    const credentialsBlock = profileSrc.split("activeSection === 'credentials'")[1]?.split(
      "activeSection === 'salary'",
    )[0];
    assert.ok(credentialsBlock);
    assert.match(credentialsBlock!, /name="bankAccountHolderName"/);
    assert.match(credentialsBlock!, /name="upiId"/);
    assert.doesNotMatch(credentialsBlock!, /name="salaryInr"/);

    const salaryBlock = profileSrc.split("activeSection === 'salary'")[1]?.split(
      "activeSection === 'rights'",
    )[0];
    assert.ok(salaryBlock);
    assert.match(salaryBlock!, /name="salaryInr"/);
    assert.match(salaryBlock!, /Service incentive/);
    assert.match(salaryBlock!, /periodIncentive/);
    assert.doesNotMatch(salaryBlock!, /name="bankAccountHolderName"/);

    const scheduleFormBlock = profileSrc.split("activeSection === 'schedule'")[1]?.split(
      'Preserve HR fields',
    )[0];
    assert.ok(scheduleFormBlock);
    assert.match(scheduleFormBlock!, /WeekOffPicker/);

    assert.match(profileSrc, /WorkingHoursEditor/);
  });
});
