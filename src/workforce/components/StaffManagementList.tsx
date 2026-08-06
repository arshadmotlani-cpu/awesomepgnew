import Link from 'next/link';
import { listEmployeesForEngine } from '@/src/workforce/brains/employeeBrain';
import { AddEmployeePopup } from '@/src/workforce/components/AddEmployeePopup';
import { workforceAccessRoleLabel } from '@/src/workforce/labels';
import { hasWorkforcePermission } from '@/src/workforce/permissions/presets';
import type { WorkforcePermissionGrants } from '@/src/workforce/types';

type Props = {
  canAdd: boolean;
  grants: WorkforcePermissionGrants | null;
};

export async function StaffManagementList({ canAdd, grants }: Props) {
  const employees = await listEmployeesForEngine('fyh_salon', { activeOnly: false });
  const canViewOperations =
    grants === null || hasWorkforcePermission(grants, 'staff.view') || hasWorkforcePermission(grants, 'finance.view_salary');

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="fyh-section-eyebrow">Team</p>
          <h1 className="fyh-display mt-1 text-3xl font-semibold text-fyh-text">Staff</h1>
          <p className="mt-1 text-sm text-fyh-text-secondary">
            Employee profiles, roles, permissions, and HR operations. Workforce Engine is the
            permanent staff system for the salon.
          </p>
          <div className="mt-3 flex flex-wrap gap-4 text-sm">
            <Link
              href="/dashboard/staff-performance"
              className="text-fyh-accent underline-offset-2 hover:underline"
            >
              Staff performance analytics
            </Link>
            {canViewOperations ? (
              <Link
                href="/workforce/operations"
                className="text-fyh-accent underline-offset-2 hover:underline"
              >
                Hours · attendance · pay
              </Link>
            ) : null}
          </div>
        </div>
        {canAdd ? <AddEmployeePopup /> : null}
      </div>

      <section className="overflow-hidden rounded-xl border border-[color:var(--fyh-border)]">
        <table className="w-full text-left text-sm">
          <thead className="bg-[color:var(--fyh-surface-muted)] text-fyh-text-secondary">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Phone</th>
              <th className="px-4 py-3 font-medium">Access Role</th>
              <th className="px-4 py-3 font-medium">Bookings</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {employees.map((row) => (
              <tr key={row.employee.id} className="border-t border-[color:var(--fyh-border)]">
                <td className="px-4 py-3 font-medium text-fyh-text">
                  <Link
                    href={`/staff/${row.employee.id}`}
                    className="text-fyh-accent underline-offset-2 hover:underline"
                  >
                    {row.employee.fullName}
                  </Link>
                </td>
                <td className="px-4 py-3">{row.employee.mobile ?? '—'}</td>
                <td className="px-4 py-3">
                  {workforceAccessRoleLabel(row.membership.jobRole)}
                </td>
                <td className="px-4 py-3">
                  {row.grants.permissions.includes('appointments.receive_bookings') ? 'Yes' : 'No'}
                </td>
                <td className="px-4 py-3">{row.employee.status}</td>
              </tr>
            ))}
            {employees.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-fyh-text-secondary">
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
