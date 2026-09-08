import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import {
  ATTENDANCE_MANAGE_HREF,
  ATTENDANCE_MAP_HREF,
  ATTENDANCE_SELF_HREF,
  isOwnerAttendancePath,
} from '@/src/workforce/lib/attendanceRoutes';
import { formatStaffDisplayName } from '@/src/workforce/lib/staffDisplayName';
import { attendanceBoxLabel } from '@/src/workforce/components/attendance/AttendanceMonthCalendar';
import {
  classifyAttendanceDay,
  payrollNetAfterAttendance,
} from '@/src/workforce/lib/attendanceSalaryMath';
import { isWithinRadiusMetres } from '@/src/workforce/lib/geoDistance';
import { DEFAULT_ATTENDANCE_RADIUS_METRES } from '@/src/hair/db/schema/settings';
import { orgFilter } from '@/src/hair/lib/tenant/filters';
import { fyhSettings } from '@/src/hair/db/schema/settings';

const root = process.cwd();

function read(rel: string) {
  return readFileSync(join(root, rel), 'utf8');
}

describe('Attendance UX routes and navigation', () => {
  it('A — owner pages include Attendance + Attendance Map sub-nav', () => {
    const manage = read('app/(hair)/fyh/(app)/attendance/manage/page.tsx');
    const map = read('app/(hair)/fyh/(app)/attendance/map/page.tsx');
    const subNav = read('src/workforce/components/attendance/AttendanceSectionSubNav.tsx');
    assert.match(manage, /AttendanceSectionSubNav/);
    assert.match(map, /AttendanceSectionSubNav/);
    assert.match(subNav, /Attendance Map/);
    assert.match(subNav, /Attendance/);
  });

  it('B — staff page is self-service only', () => {
    const page = read('app/(hair)/fyh/(app)/attendance/page.tsx');
    assert.match(page, /PhotoAttendanceButton/);
    assert.match(page, /attendance\.view_own/);
    assert.doesNotMatch(page, /AttendanceSectionSubNav/);
    assert.doesNotMatch(page, /finance\.view_salary/);
  });

  it('C — attendance map requires team attendance access server-side', () => {
    const map = read('app/(hair)/fyh/(app)/attendance/map/page.tsx');
    assert.match(map, /requireTeamAttendanceAccess/);
  });

  it('D — staff page redirects team viewers away from self-service', () => {
    const page = read('app/(hair)/fyh/(app)/attendance/page.tsx');
    assert.match(page, /attendance\.view_team/);
    assert.match(page, /redirect\('\/attendance\/manage'\)/);
  });

  it('E — staff photo flow does not expose editable date', () => {
    const page = read('app/(hair)/fyh/(app)/attendance/page.tsx');
    assert.doesNotMatch(page, /type="date"/);
    const photo = read('src/workforce/components/attendance/PhotoAttendanceButton.tsx');
    assert.doesNotMatch(photo, /workDate/);
  });
});

describe('Photo + geofence attendance', () => {
  it('F/G/H/I/J/K — photo action and server-side geofence remain authoritative', () => {
    const actions = read('src/workforce/actions/attendance.ts');
    assert.match(actions, /markPresentWithPhotoAction/);
    assert.match(actions, /persistAttendancePhotoFromFile/);
    assert.match(actions, /markPresentWithGeolocation/);

    const photo = read('src/workforce/components/attendance/PhotoAttendanceButton.tsx');
    assert.match(photo, /Camera access is required to mark attendance/);
    assert.match(photo, /Location access is required to mark attendance/);

    const service = read('src/workforce/services/attendance.ts');
    assert.match(service, /isWithinRadiusMetres/);
    assert.match(service, /clockInPhotoUrl/);

    assert.equal(
      isWithinRadiusMetres(18.5204, 73.8567, 18.5204, 73.8567, DEFAULT_ATTENDANCE_RADIUS_METRES, 5),
      true,
    );
    assert.equal(isWithinRadiusMetres(19, 74, 18.5204, 73.8567, 50, 5), false);
  });

  it('L/M — duplicate today attendance is rejected and locked', () => {
    const service = read('src/workforce/services/attendance.ts');
    assert.match(service, /already_marked/);
    assert.match(service, /lockedAt/);
  });
});

describe('Owner correction and office location', () => {
  it('N — owner correction uses audit trail service', () => {
    const actions = read('src/workforce/actions/attendance.ts');
    assert.match(actions, /correctAttendanceByOwner/);
    assert.match(actions, /attendance\.correct/);
  });

  it('O/P — office location is tenant-scoped via orgFilter', () => {
    const office = read('src/workforce/services/officeLocation.ts');
    assert.match(office, /orgFilter\(fyhSettings\.organizationId/);
    assert.match(office, /resolveTenantContextForService/);
    const settingsPage = read('app/(hair)/fyh/(app)/settings/attendance/page.tsx');
    assert.match(settingsPage, /getTenantContextForPage/);
    assert.match(settingsPage, /getOfficeLocationConfig\(ctx\)/);

    const ctxA = {
      userId: 'u1',
      organizationId: 'org-a',
      locationId: 'loc-a',
      membershipId: 'm1',
      membershipRole: 'owner' as const,
      allowedLocationIds: ['loc-a'],
      permissions: [] as const,
    };
    const ctxB = { ...ctxA, organizationId: 'org-b', locationId: 'loc-b' };
    const prev = process.env.FYH_SAAS_TENANT;
    process.env.FYH_SAAS_TENANT = '1';
    try {
      const filterA = orgFilter(fyhSettings.organizationId, ctxA);
      const filterB = orgFilter(fyhSettings.organizationId, ctxB);
      assert.notDeepEqual(filterA, filterB);
    } finally {
      if (prev === undefined) delete process.env.FYH_SAAS_TENANT;
      else process.env.FYH_SAAS_TENANT = prev;
    }
  });
});

describe('Attendance map + salary SSOT', () => {
  it('Q — calendar boxes map Present/Absent/Paid Leave', () => {
    assert.equal(attendanceBoxLabel('present'), 'P');
    assert.equal(attendanceBoxLabel('absent'), 'A');
    assert.equal(attendanceBoxLabel('paid_leave'), 'PL');
  });

  it('R — salary summary uses attendanceSalaryMath payroll helper', () => {
    const payroll = read('src/workforce/services/attendancePayroll.ts');
    assert.match(payroll, /payrollNetAfterAttendance/);
    const net = payrollNetAfterAttendance({
      monthlySalaryPaise: 30_000_00,
      commissionPaise: 0,
      incentivePaise: 0,
      otherDeductionsPaise: 0,
      absentDays: 1,
      eligibleWorkingDays: 30,
    });
    assert.equal(net.netPaise, 29_000_00);
  });

  it('S — staff page hides salary; map gates salary on finance permission', () => {
    const staff = read('app/(hair)/fyh/(app)/attendance/page.tsx');
    assert.doesNotMatch(staff, /finalSalaryPaise/);
    const map = read('app/(hair)/fyh/(app)/attendance/map/page.tsx');
    assert.match(map, /finance\.view_salary/);
    assert.match(map, /showSalary={canSalary}/);
  });
});

describe('Staff roster + display names', () => {
  it('T — owner roster uses team attendance adapter with tenant context', () => {
    const manage = read('app/(hair)/fyh/(app)/attendance/manage/page.tsx');
    const map = read('app/(hair)/fyh/(app)/attendance/map/page.tsx');
    assert.match(manage, /listTeamStaffForAttendance\(ctx\)/);
    assert.match(map, /listTeamStaffForAttendance\(ctx\)/);
    const adapter = read('src/hair/adapters/workforceStaffAdapter.ts');
    assert.match(adapter, /receiveBookingsOnly: false/);
    assert.match(adapter, /filterSelectablePosStaff/);
  });

  it('U — display names are title-cased generically', () => {
    assert.equal(formatStaffDisplayName('arshad motlani'), 'Arshad Motlani');
    assert.equal(formatStaffDisplayName('  lata   khadse '), 'Lata Khadse');
    assert.equal(formatStaffDisplayName('Arshad'), 'Arshad');
    const adapter = read('src/hair/adapters/workforceStaffAdapter.ts');
    assert.match(adapter, /formatStaffDisplayName/);
  });
});

describe('Owner vs staff route constants', () => {
  it('owner paths are distinct from staff self-service', () => {
    assert.equal(ATTENDANCE_SELF_HREF, '/attendance');
    assert.equal(ATTENDANCE_MANAGE_HREF, '/attendance/manage');
    assert.equal(ATTENDANCE_MAP_HREF, '/attendance/map');
    assert.ok(isOwnerAttendancePath('/attendance/map'));
    assert.ok(!isOwnerAttendancePath('/attendance'));
  });
});

describe('Paid leave classification', () => {
  it('leave status maps to paid_leave classification', () => {
    const classification = classifyAttendanceDay({
      workDate: '2026-09-05',
      todayKey: '2026-09-08',
      schedule: [{ dayOfWeek: 5, isOff: false }],
      timezone: 'Asia/Kolkata',
      record: { status: 'leave' },
    });
    assert.equal(classification, 'paid_leave');
  });
});
