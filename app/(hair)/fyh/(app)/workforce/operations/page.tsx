import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getHairSession } from '@/src/hair/lib/auth/session';
import { requireHairHost } from '@/src/hair/lib/auth/guards';
import {
  getEmployeeDashboard,
  listEmployeesForEngine,
} from '@/src/workforce/brains/employeeBrain';
import {
  addIncentiveAction,
  setCommissionAction,
  setPerformanceTargetAction,
} from '@/src/workforce/actions/operations';
import { listBookableEmployees } from '@/src/workforce/services/appointmentsBridge';
import { listIncentives, listPayrollRuns } from '@/src/workforce/services/compensation';
import { getEmployeeSchedule } from '@/src/workforce/services/schedules';
import { WorkingHoursEditor } from '@/src/workforce/components/WorkingHoursEditor';
import { workforceJobRoleLabel, workforceRankLabel } from '@/src/workforce/labels';
import { hasWorkforcePermission } from '@/src/workforce/permissions/presets';
import { isWorkforceEngineEnabled, type WorkforceJobRole } from '@/src/workforce/types';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default async function WorkforceOperationsPage() {
  await requireHairHost();
  if (!isWorkforceEngineEnabled()) redirect('/dashboard');

  const session = await getHairSession();
  if (!session?.workforceEmployeeId) redirect('/login');

  const dash = await getEmployeeDashboard(session.workforceEmployeeId, 'fyh_salon');
  if (!dash?.membership) redirect('/login');

  const canViewStaff = hasWorkforcePermission(dash.grants, 'staff.view');
  const canEditStaff = hasWorkforcePermission(dash.grants, 'staff.edit');
  const canViewSalary = hasWorkforcePermission(dash.grants, 'finance.view_salary');

  if (!canViewStaff && !canViewSalary) {
    redirect('/me');
  }

  const team = await listEmployeesForEngine('fyh_salon', { activeOnly: true });
  const bookable = await listBookableEmployees('fyh_salon');
  const payrollRuns = canViewSalary ? await listPayrollRuns('fyh_salon', 5) : [];
  const incentives = canViewSalary
    ? await listIncentives({ engineId: 'fyh_salon', limit: 10 })
    : [];

  const schedulePreview = await Promise.all(
    team.slice(0, 6).map(async (row) => ({
      employee: row.employee,
      membership: row.membership,
      schedule: await getEmployeeSchedule(row.employee.id, 'fyh_salon'),
    })),
  );

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-fyh-text-secondary">Workforce operations</p>
          <h1 className="text-3xl font-semibold text-fyh-text">Hours · Attendance · Pay</h1>
          <p className="text-sm text-fyh-text-secondary">
            Phase 4 foundations — appointments roster, working hours, attendance, performance,
            salary, commission, and incentives.
          </p>
        </div>
        <Link href="/workforce/home" className="text-sm text-fyh-accent underline">
          Back to dashboard
        </Link>
      </header>

      <section className="rounded-2xl border border-[color:var(--fyh-border)] bg-[color:var(--fyh-surface)] p-5">
        <h2 className="text-lg font-medium text-fyh-text">Appointment roster</h2>
        <p className="mt-1 text-sm text-fyh-text-secondary">
          Employees with <code className="text-xs">appointments.receive_bookings</code> — consumed
          by Appointment Brain via Workforce bridge.
        </p>
        <ul className="mt-4 divide-y divide-[color:var(--fyh-border)] text-sm">
          {bookable.map((b) => (
            <li key={b.employeeId} className="flex justify-between gap-3 py-2">
              <span className="font-medium text-fyh-text">{b.fullName}</span>
              <span className="text-fyh-text-secondary">
                {workforceJobRoleLabel(b.jobRole as WorkforceJobRole)} · target ₹
                {(b.performanceTargetPaise / 100).toLocaleString('en-IN')}
              </span>
            </li>
          ))}
          {bookable.length === 0 ? (
            <li className="py-3 text-fyh-text-secondary">No bookable employees yet.</li>
          ) : null}
        </ul>
      </section>

      <section className="rounded-2xl border border-[color:var(--fyh-border)] bg-[color:var(--fyh-surface)] p-5">
        <h2 className="text-lg font-medium text-fyh-text">Working hours</h2>
        <div className="mt-4 space-y-6">
          {schedulePreview.map(({ employee, schedule }) =>
            canEditStaff ? (
              <WorkingHoursEditor
                key={employee.id}
                employeeId={employee.id}
                employeeName={employee.fullName}
                initial={schedule.map((d) => ({
                  dayOfWeek: d.dayOfWeek,
                  startTime: d.startTime,
                  endTime: d.endTime,
                  isOff: d.isOff,
                }))}
              />
            ) : (
              <div key={employee.id} className="border-t border-[color:var(--fyh-border)] pt-3 first:border-0 first:pt-0">
                <p className="font-medium text-fyh-text">{employee.fullName}</p>
                <div className="mt-2 flex flex-wrap gap-2 text-xs text-fyh-text-secondary">
                  {schedule.map((d) => (
                    <span
                      key={d.id}
                      className="rounded-md border border-[color:var(--fyh-border)] px-2 py-1"
                    >
                      {DAY_LABELS[d.dayOfWeek] ?? d.dayOfWeek}:{' '}
                      {d.isOff ? 'Off' : `${d.startTime}–${d.endTime}`}
                    </span>
                  ))}
                  {schedule.length === 0 ? <span>No hours set.</span> : null}
                </div>
              </div>
            ),
          )}
        </div>
      </section>

      {canEditStaff ? (
        <section className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-[color:var(--fyh-border)] bg-[color:var(--fyh-surface)] p-5">
            <h2 className="text-lg font-medium text-fyh-text">Commission</h2>
            <form action={setCommissionAction} className="mt-3 space-y-3 text-sm">
              <select
                name="employeeId"
                required
                className="w-full rounded-lg border border-[color:var(--fyh-border)] bg-transparent px-3 py-2"
              >
                {team.map((t) => (
                  <option key={t.employee.id} value={t.employee.id}>
                    {t.employee.fullName}
                  </option>
                ))}
              </select>
              <select
                name="type"
                className="w-full rounded-lg border border-[color:var(--fyh-border)] bg-transparent px-3 py-2"
              >
                <option value="none">None</option>
                <option value="fixed">Fixed (₹)</option>
                <option value="percent">Percent</option>
              </select>
              <input
                name="fixedInr"
                type="number"
                min={0}
                step="1"
                placeholder="Fixed ₹"
                className="w-full rounded-lg border border-[color:var(--fyh-border)] bg-transparent px-3 py-2"
              />
              <input
                name="percent"
                type="number"
                min={0}
                step="0.01"
                placeholder="Percent (e.g. 15)"
                className="w-full rounded-lg border border-[color:var(--fyh-border)] bg-transparent px-3 py-2"
              />
              <button
                type="submit"
                className="rounded-lg bg-fyh-accent px-4 py-2 font-medium text-white"
              >
                Save commission
              </button>
            </form>
          </div>

          <div className="rounded-2xl border border-[color:var(--fyh-border)] bg-[color:var(--fyh-surface)] p-5">
            <h2 className="text-lg font-medium text-fyh-text">Performance target</h2>
            <form action={setPerformanceTargetAction} className="mt-3 space-y-3 text-sm">
              <select
                name="employeeId"
                required
                className="w-full rounded-lg border border-[color:var(--fyh-border)] bg-transparent px-3 py-2"
              >
                {team.map((t) => (
                  <option key={t.employee.id} value={t.employee.id}>
                    {t.employee.fullName}
                  </option>
                ))}
              </select>
              <input
                name="targetInr"
                type="number"
                min={0}
                step="1"
                required
                placeholder="Monthly target ₹"
                className="w-full rounded-lg border border-[color:var(--fyh-border)] bg-transparent px-3 py-2"
              />
              <button
                type="submit"
                className="rounded-lg bg-fyh-accent px-4 py-2 font-medium text-white"
              >
                Save target
              </button>
            </form>
          </div>
        </section>
      ) : null}

      {canViewSalary || canEditStaff ? (
        <section className="rounded-2xl border border-[color:var(--fyh-border)] bg-[color:var(--fyh-surface)] p-5">
          <h2 className="text-lg font-medium text-fyh-text">Incentives</h2>
          {canEditStaff ? (
            <form action={addIncentiveAction} className="mt-3 grid gap-3 sm:grid-cols-4 text-sm">
              <select
                name="employeeId"
                required
                className="rounded-lg border border-[color:var(--fyh-border)] bg-transparent px-3 py-2"
              >
                {team.map((t) => (
                  <option key={t.employee.id} value={t.employee.id}>
                    {t.employee.fullName}
                  </option>
                ))}
              </select>
              <input
                name="label"
                placeholder="Label"
                required
                className="rounded-lg border border-[color:var(--fyh-border)] bg-transparent px-3 py-2"
              />
              <input
                name="amountInr"
                type="number"
                min={1}
                required
                placeholder="₹"
                className="rounded-lg border border-[color:var(--fyh-border)] bg-transparent px-3 py-2"
              />
              <input
                name="effectiveDate"
                type="date"
                required
                defaultValue={new Date().toISOString().slice(0, 10)}
                className="rounded-lg border border-[color:var(--fyh-border)] bg-transparent px-3 py-2"
              />
              <button
                type="submit"
                className="sm:col-span-4 rounded-lg bg-fyh-accent px-4 py-2 font-medium text-white sm:w-fit"
              >
                Add incentive
              </button>
            </form>
          ) : null}
          <ul className="mt-4 divide-y divide-[color:var(--fyh-border)] text-sm">
            {incentives.map((i) => (
              <li key={i.id} className="flex justify-between gap-3 py-2">
                <span className="text-fyh-text">
                  {i.label} · {i.effectiveDate}
                </span>
                <span className="text-fyh-text-secondary">
                  ₹{(i.amountPaise / 100).toLocaleString('en-IN')} · {i.status}
                </span>
              </li>
            ))}
            {incentives.length === 0 ? (
              <li className="py-3 text-fyh-text-secondary">No incentives recorded.</li>
            ) : null}
          </ul>
        </section>
      ) : null}

      {canViewSalary ? (
        <section className="rounded-2xl border border-[color:var(--fyh-border)] bg-[color:var(--fyh-surface)] p-5">
          <h2 className="text-lg font-medium text-fyh-text">Payroll runs</h2>
          <p className="mt-1 text-sm text-fyh-text-secondary">
            Draft foundation only — salary + pending incentives; sales commission attribution later.
          </p>
          <ul className="mt-4 divide-y divide-[color:var(--fyh-border)] text-sm">
            {payrollRuns.map((r) => (
              <li key={r.id} className="flex justify-between gap-3 py-2">
                <span className="text-fyh-text">
                  {r.periodStart} → {r.periodEnd}
                </span>
                <span className="text-fyh-text-secondary">{r.status}</span>
              </li>
            ))}
            {payrollRuns.length === 0 ? (
              <li className="py-3 text-fyh-text-secondary">No payroll runs yet.</li>
            ) : null}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
