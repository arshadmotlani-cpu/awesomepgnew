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
  test('percentage threshold example from spec', () => {
    const config = {
      baseSalaryPaise: 1_500_000,
      thresholdMultiplier: 2,
      aboveThresholdPercentBps: 1000,
    };
    assert.equal(thresholdPaiseFromConfig(config), 3_000_000);
    assert.equal(computePercentageThresholdIncentivePaise(config, 4_200_000), 120_000);
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
  test('AddEmployeePopup includes HR sections', () => {
    const { readFileSync } = require('node:fs') as typeof import('node:fs');
    const { join } = require('node:path') as typeof import('node:path');
    const src = readFileSync(
      join(process.cwd(), 'src/workforce/components/AddEmployeePopup.tsx'),
      'utf8',
    );
    assert.match(src, /Payment details/i);
    assert.match(src, /Incentive plan/i);
    assert.match(src, /name="salaryFrequency"/);
    assert.match(src, /WeekOffPicker/);
    assert.match(src, /name="bankAccountHolderName"/);
    assert.match(src, /name="incentivePlanType"/);
  });

  test('EmployeeProfilePanel has profile sections', () => {
    const { readFileSync } = require('node:fs') as typeof import('node:fs');
    const { join } = require('node:path') as typeof import('node:path');
    const src = readFileSync(
      join(process.cwd(), 'src/workforce/components/EmployeeProfilePanel.tsx'),
      'utf8',
    );
    for (const title of [
      'Basic information',
      'Employment',
      'Salary',
      'Incentive plan',
      'Payment details',
      'Permissions',
      'Documents',
    ]) {
      assert.match(src, new RegExp(title, 'i'));
    }
  });
});
