import { listEmployeesForEngine } from '@/src/workforce/brains/employeeBrain';
import { AddEmployeePopup } from '@/src/workforce/components/AddEmployeePopup';
import { workforceJobRoleLabel, workforceRankLabel } from '@/src/workforce/labels';
import { isWorkforceEngineEnabled } from '@/src/workforce/types';
import { redirect } from 'next/navigation';

export default async function WorkforceAdminPage() {
  if (!isWorkforceEngineEnabled()) {
    redirect('/staff');
  }

  const employees = await listEmployeesForEngine('fyh_salon', { activeOnly: false });

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-fyh-text">Workforce</h1>
          <p className="text-sm text-fyh-text-secondary">
            Permanent employee system — Owner, Manager, and Staff. One person, multi-engine
            memberships. Legacy FYH staff is migrated here; do not extend the old staff model.
          </p>
        </div>
        <AddEmployeePopup />
      </div>

      <section className="overflow-hidden rounded-xl border border-[color:var(--fyh-border)]">
        <table className="w-full text-left text-sm">
          <thead className="bg-[color:var(--fyh-surface-muted)] text-fyh-text-secondary">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Phone</th>
              <th className="px-4 py-3 font-medium">Rank</th>
              <th className="px-4 py-3 font-medium">Designation</th>
              <th className="px-4 py-3 font-medium">Bookings</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {employees.map((row) => (
              <tr key={row.employee.id} className="border-t border-[color:var(--fyh-border)]">
                <td className="px-4 py-3 font-medium text-fyh-text">{row.employee.fullName}</td>
                <td className="px-4 py-3">{row.employee.mobile ?? '—'}</td>
                <td className="px-4 py-3">{workforceRankLabel(row.membership.rank)}</td>
                <td className="px-4 py-3">{workforceJobRoleLabel(row.membership.jobRole)}</td>
                <td className="px-4 py-3">
                  {row.grants.permissions.includes('appointments.receive_bookings') ? 'Yes' : 'No'}
                </td>
                <td className="px-4 py-3">{row.employee.status}</td>
              </tr>
            ))}
            {employees.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-fyh-text-secondary">
                  No employees yet. Use Add employee to create the first profile.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </div>
  );
}
