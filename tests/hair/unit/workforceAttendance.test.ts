import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { distanceMetres, isPlausibleGpsReading, isWithinRadiusMetres } from '@/src/workforce/lib/geoDistance';
import {
  absenceDeductionPaise,
  classifyAttendanceDay,
  dailySalaryPaise,
  payrollNetAfterAttendance,
  summarizeMonthAttendance,
} from '@/src/workforce/lib/attendanceSalaryMath';
import { canonicalBusinessDate } from '@/src/workforce/lib/attendanceBusinessDate';
import { DEFAULT_ATTENDANCE_RADIUS_METRES } from '@/src/hair/db/schema/settings';
import { WORKFORCE_SESSION_TTL_DAYS } from '@/src/hair/lib/auth/constants';
import { workforceSessionMs } from '@/src/workforce/auth/sessionPolicy';

describe('geo distance validation', () => {
  it('accepts coordinates within 50m', () => {
    const officeLat = 18.5204;
    const officeLon = 73.8567;
    const d = distanceMetres(officeLat, officeLon, officeLat + 0.0002, officeLon);
    assert.ok(d <= DEFAULT_ATTENDANCE_RADIUS_METRES);
    assert.equal(
      isWithinRadiusMetres(officeLat + 0.0002, officeLon, officeLat, officeLon, 50, 10),
      true,
    );
  });

  it('rejects coordinates far from office', () => {
    assert.equal(isWithinRadiusMetres(19, 74, 18.5204, 73.8567, 50, 5), false);
  });

  it('rejects implausible GPS readings', () => {
    assert.equal(isPlausibleGpsReading({ latitude: 999, longitude: 0 }), false);
    assert.equal(isPlausibleGpsReading({ latitude: 18.5, longitude: 73.8, accuracyMetres: 900 }), false);
  });
});

describe('attendance business date', () => {
  it('uses salon timezone for canonical date', () => {
    const key = canonicalBusinessDate('Asia/Kolkata', new Date('2026-09-07T10:00:00+05:30'));
    assert.match(key, /^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('attendance salary math', () => {
  it('deducts absent days only', () => {
    assert.equal(dailySalaryPaise(30_000_00, 30), 1_000_00);
    assert.equal(absenceDeductionPaise(30_000_00, 2, 30), 2_000_00);
    const payroll = payrollNetAfterAttendance({
      monthlySalaryPaise: 30_000_00,
      commissionPaise: 0,
      incentivePaise: 0,
      otherDeductionsPaise: 0,
      absentDays: 2,
      eligibleWorkingDays: 30,
    });
    assert.equal(payroll.netPaise, 28_000_00);
  });

  it('does not crash when salary is zero', () => {
    assert.equal(absenceDeductionPaise(0, 3, 30), 0);
  });

  it('classifies paid leave without absence deduction impact', () => {
    const classification = classifyAttendanceDay({
      workDate: '2026-09-05',
      todayKey: '2026-09-07',
      schedule: [{ dayOfWeek: 5, isOff: false }],
      timezone: 'Asia/Kolkata',
      record: { status: 'leave' },
    });
    assert.equal(classification, 'paid_leave');
  });

  it('does not mark future dates absent', () => {
    const classification = classifyAttendanceDay({
      workDate: '2026-09-10',
      todayKey: '2026-09-07',
      schedule: [{ dayOfWeek: 4, isOff: false }],
      timezone: 'Asia/Kolkata',
      record: null,
    });
    assert.equal(classification, 'future');
  });
});

describe('staff session policy', () => {
  it('uses 30-day workforce session TTL', () => {
    assert.equal(WORKFORCE_SESSION_TTL_DAYS, 30);
    assert.equal(workforceSessionMs(), 30 * 86_400_000);
  });
});

describe('attendance permissions in role templates', () => {
  it('grants staff attendance mark/view permissions', () => {
    const src = require('node:fs').readFileSync('src/workforce/permissions/roleTemplates.ts', 'utf8') as string;
    assert.match(src, /attendance\.view_own/);
    assert.match(src, /attendance\.mark/);
  });
});
