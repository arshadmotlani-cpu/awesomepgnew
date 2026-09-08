import { redirect } from 'next/navigation';
import Link from 'next/link';
import { requireHairHost } from '@/src/hair/lib/auth/guards';
import { getHairSession } from '@/src/hair/lib/auth/session';
import { canonicalBusinessDate } from '@/src/workforce/lib/attendanceBusinessDate';
import { PhotoAttendanceButton } from '@/src/workforce/components/attendance/PhotoAttendanceButton';
import { AttendanceMonthCalendar } from '@/src/workforce/components/attendance/AttendanceMonthCalendar';
import { buildStaffMonthAttendanceSummary } from '@/src/workforce/services/attendancePayroll';
import { getTodayAttendance } from '@/src/workforce/services/attendance';
import { getOfficeLocationConfig } from '@/src/workforce/services/officeLocation';
import { getSalonSettings } from '@/src/hair/services/settings';
import { employeeHasPermission } from '@/src/workforce/brains/employeeBrain';
import { isWorkforceEngineEnabled } from '@/src/workforce/types';

export default async function StaffAttendancePage() {
  await requireHairHost();
  if (!isWorkforceEngineEnabled()) redirect('/dashboard');

  const session = await getHairSession();
  if (!session) redirect('/login?next=/attendance');
  if (session.admin.role === 'super_admin') redirect('/attendance/manage');
  if (!session.workforceEmployeeId) redirect('/login?next=/attendance');

  const canView = await employeeHasPermission(
    session.workforceEmployeeId,
    'fyh_salon',
    'attendance.view_own',
  );
  if (!canView) redirect('/dashboard');

  const canViewTeam = await employeeHasPermission(
    session.workforceEmployeeId,
    'fyh_salon',
    'attendance.view_team',
  );
  if (canViewTeam) redirect('/attendance/manage');

  const settings = await getSalonSettings();
  const timezone = settings.timezone ?? 'Asia/Kolkata';
  const todayKey = canonicalBusinessDate(timezone);
  const today = await getTodayAttendance({ employeeId: session.workforceEmployeeId, timezone });
  const month = await buildStaffMonthAttendanceSummary({ employeeId: session.workforceEmployeeId });
  const office = await getOfficeLocationConfig();

  const weekdayLabel = new Date(`${todayKey}T12:00:00Z`).toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: timezone,
  });

  const marked = Boolean(today?.clockInAt && today.lockedAt);
  const markedTime =
    today?.clockInAt &&
    new Date(today.clockInAt).toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: timezone,
    });

  return (
    <div className="mx-auto max-w-lg space-y-6 p-4 md:p-8">
      <header>
        <h1 className="text-2xl font-semibold">Today&apos;s Attendance</h1>
        <p className="mt-1 text-sm text-fyh-text-secondary">{weekdayLabel}</p>
      </header>

      <section className="rounded-2xl border border-[color:var(--fyh-border)] bg-[color:var(--fyh-surface)] p-5">
        {marked && markedTime ? (
          <div className="space-y-2">
            <p className="text-lg font-medium text-emerald-400">Present</p>
            <p className="text-sm text-fyh-text-secondary">Marked at {markedTime}</p>
            <p className="text-sm text-fyh-text-secondary">Attendance locked for today.</p>
          </div>
        ) : (
          <>
            {!office.configured ? (
              <p className="mb-4 text-sm text-amber-300">
                Office location is not configured yet. Ask your owner to set it in Settings → Attendance.
              </p>
            ) : null}
            <PhotoAttendanceButton alreadyMarked={marked} disabled={!office.configured} />
          </>
        )}
      </section>

      {month ? (
        <section className="rounded-2xl border border-[color:var(--fyh-border)] bg-[color:var(--fyh-surface)] p-5">
          <h2 className="text-sm font-medium uppercase tracking-wide text-fyh-text-secondary">
            My month
          </h2>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center text-sm">
            <div>
              <p className="text-fyh-text-secondary">Present</p>
              <p className="text-lg font-semibold">{month.presentDays}</p>
            </div>
            <div>
              <p className="text-fyh-text-secondary">Absent</p>
              <p className="text-lg font-semibold">{month.absentDays}</p>
            </div>
            <div>
              <p className="text-fyh-text-secondary">Paid leave</p>
              <p className="text-lg font-semibold">{month.paidLeaveDays}</p>
            </div>
          </div>
          <div className="mt-4">
            <AttendanceMonthCalendar days={month.days} compact />
          </div>
        </section>
      ) : null}

      <p className="text-center text-sm">
        <Link href="/me" className="text-fyh-accent underline">
          My profile
        </Link>
      </p>
    </div>
  );
}
