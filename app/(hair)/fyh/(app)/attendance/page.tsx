import { redirect } from 'next/navigation';
import Link from 'next/link';
import { requireHairHost } from '@/src/hair/lib/auth/guards';
import { getHairSession } from '@/src/hair/lib/auth/session';
import { canonicalBusinessDate } from '@/src/workforce/lib/attendanceBusinessDate';
import { MarkPresentButton } from '@/src/workforce/components/attendance/MarkPresentButton';
import { buildStaffMonthAttendanceSummary } from '@/src/workforce/services/attendancePayroll';
import { getTodayAttendance } from '@/src/workforce/services/attendance';
import { getOfficeLocationConfig } from '@/src/workforce/services/officeLocation';
import { getSalonSettings } from '@/src/hair/services/settings';
import { employeeHasPermission } from '@/src/workforce/brains/employeeBrain';
import { isWorkforceEngineEnabled } from '@/src/workforce/types';

const LABELS: Record<string, string> = {
  present: 'Present',
  absent: 'Absent',
  paid_leave: 'Paid Leave',
  weekly_off: 'Weekly Off',
  holiday: 'Holiday',
  future: '—',
  not_marked: 'Not marked',
};

export default async function StaffAttendancePage() {
  await requireHairHost();
  if (!isWorkforceEngineEnabled()) redirect('/dashboard');

  const session = await getHairSession();
  if (!session?.workforceEmployeeId) redirect('/login');

  const canView = await employeeHasPermission(
    session.workforceEmployeeId,
    'fyh_salon',
    'attendance.view_own',
  );
  if (!canView) redirect('/dashboard');

  const settings = await getSalonSettings();
  const timezone = settings.timezone ?? 'Asia/Kolkata';
  const todayKey = canonicalBusinessDate(timezone);
  const today = await getTodayAttendance({ employeeId: session.workforceEmployeeId, timezone });
  const month = await buildStaffMonthAttendanceSummary({ employeeId: session.workforceEmployeeId });
  const office = await getOfficeLocationConfig();

  const todayLabel = new Date(`${todayKey}T12:00:00Z`).toLocaleDateString('en-IN', {
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
    <div className="mx-auto max-w-3xl space-y-8 p-4 md:p-8">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Attendance</h1>
          <p className="text-sm text-fyh-text-secondary">Mark your daily presence at the office.</p>
        </div>
        <Link href="/me" className="text-sm text-fyh-accent underline">
          My profile
        </Link>
      </header>

      <section className="rounded-2xl border border-[color:var(--fyh-border)] bg-[color:var(--fyh-surface)] p-5">
        <h2 className="text-lg font-medium">Today</h2>
        <p className="mt-2 text-sm text-fyh-text-secondary">Date: {todayLabel}</p>
        <p className="text-sm">
          Status:{' '}
          <span className="font-medium">{marked ? 'Present' : 'Not marked'}</span>
        </p>
        {marked && markedTime ? (
          <p className="mt-2 text-sm text-emerald-400">
            ✓ Present — marked at {markedTime}. Attendance locked.
          </p>
        ) : (
          <div className="mt-4">
            {!office.configured ? (
              <p className="mb-3 text-sm text-amber-300">
                Office location is not configured yet. Ask your owner to set it in Settings →
                Attendance.
              </p>
            ) : null}
            <MarkPresentButton alreadyMarked={marked} disabled={!office.configured} />
          </div>
        )}
      </section>

      {month ? (
        <section className="rounded-2xl border border-[color:var(--fyh-border)] bg-[color:var(--fyh-surface)] p-5">
          <h2 className="text-lg font-medium">Monthly attendance</h2>
          <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
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
            <div>
              <p className="text-fyh-text-secondary">Weekly off</p>
              <p className="text-lg font-semibold">{month.weeklyOffDays}</p>
            </div>
          </div>
          <ul className="mt-4 max-h-80 space-y-1 overflow-y-auto text-sm">
            {month.days.map((d) => (
              <li key={d.workDate} className="flex justify-between gap-3 border-b border-[color:var(--fyh-border)] py-1">
                <span>{d.workDate}</span>
                <span className="text-fyh-text-secondary">{LABELS[d.classification] ?? d.classification}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
