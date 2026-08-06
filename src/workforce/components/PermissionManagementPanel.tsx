'use client';

import { useActionState, useState } from 'react';
import {
  resetEmployeePermissionsAction,
  resetRoleTemplateAction,
  updateEmployeePermissionsAction,
  updateRoleTemplateAction,
  type PermissionActionState,
} from '@/src/workforce/actions/permissions';
import {
  WORKFORCE_ACCESS_ROLES,
  WORKFORCE_PERMISSION_GROUP_LABELS,
  WORKFORCE_PERMISSION_LIBRARY,
  permissionsByGroup,
  type WorkforcePermissionKey,
} from '@/src/workforce/types';
import { workforceAccessRoleLabel } from '@/src/workforce/labels';
import { Button } from '@/src/hair/components/ui/button';
import type { EmployeeWithMembership } from '@/src/workforce/brains/employeeBrain';

type TemplateRow = {
  accessRole: string;
  permissions: WorkforcePermissionKey[];
  maxBackdateDays: number | null;
};

type Props = {
  templates: TemplateRow[];
  employees: EmployeeWithMembership[];
};

const initial: PermissionActionState = {};

function PermissionChecklist({ selected }: { selected: Set<string> }) {
  const groups = permissionsByGroup();

  return (
    <div className="max-h-72 space-y-3 overflow-y-auto rounded-lg border border-[color:var(--fyh-border)] p-3">
      {Object.entries(groups).map(([group, defs]) => (
        <fieldset key={group} className="space-y-1">
          <legend className="text-xs font-semibold uppercase tracking-wide text-fyh-text-secondary">
            {WORKFORCE_PERMISSION_GROUP_LABELS[group as keyof typeof WORKFORCE_PERMISSION_GROUP_LABELS] ?? group}
          </legend>
          <div className="grid gap-1 sm:grid-cols-2">
            {defs.map((def) => (
              <label key={def.key} className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  name="permissions"
                  value={def.key}
                  defaultChecked={selected.has(def.key)}
                />
                <span>{def.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ))}
    </div>
  );
}

export function PermissionManagementPanel({ templates, employees }: Props) {
  const [selectedRole, setSelectedRole] = useState<string>(WORKFORCE_ACCESS_ROLES[0]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>(
    employees[0]?.employee.id ?? '',
  );

  const [templateState, templateAction, templatePending] = useActionState(
    updateRoleTemplateAction,
    initial,
  );
  const [resetTplState, resetTplAction, resetTplPending] = useActionState(
    resetRoleTemplateAction,
    initial,
  );
  const [empState, empAction, empPending] = useActionState(
    updateEmployeePermissionsAction,
    initial,
  );
  const [resetEmpState, resetEmpAction, resetEmpPending] = useActionState(
    resetEmployeePermissionsAction,
    initial,
  );

  const roleTemplate =
    templates.find((t) => t.accessRole === selectedRole) ?? {
      accessRole: selectedRole,
      permissions: [],
      maxBackdateDays: 0,
    };
  const employee = employees.find((e) => e.employee.id === selectedEmployeeId);

  return (
    <div className="space-y-10">
      <div>
        <p className="fyh-section-eyebrow">Access control</p>
        <h2 className="fyh-display mt-1 text-2xl font-semibold">Permission management</h2>
        <p className="mt-1 text-sm text-fyh-text-secondary">
          Access Roles are job titles only. Permissions are independent — edit role templates or
          override individual employees.
        </p>
      </div>

      <section className="space-y-4 rounded-xl border border-[color:var(--fyh-border)] p-5">
        <h3 className="text-lg font-medium text-fyh-text">Role templates</h3>
        <p className="text-sm text-fyh-text-secondary">
          Default permissions applied when an employee uses their Access Role template (no custom
          override).
        </p>
        <label className="block text-sm">
          <span className="font-medium">Access Role</span>
          <select
            className="fyh-select mt-1 w-full max-w-xs"
            value={selectedRole}
            onChange={(e) => setSelectedRole(e.target.value)}
          >
            {WORKFORCE_ACCESS_ROLES.map((r) => (
              <option key={r} value={r}>
                {workforceAccessRoleLabel(r)}
              </option>
            ))}
          </select>
        </label>

        <form action={templateAction} className="space-y-3">
          <input type="hidden" name="accessRole" value={selectedRole} />
          <PermissionChecklist selected={new Set(roleTemplate.permissions)} />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={templatePending}>
              {templatePending ? 'Saving…' : 'Save role template'}
            </Button>
          </div>
          {templateState.error ? <p className="text-sm text-red-600">{templateState.error}</p> : null}
          {templateState.success ? (
            <p className="text-sm text-emerald-700">{templateState.success}</p>
          ) : null}
        </form>

        <form action={resetTplAction}>
          <input type="hidden" name="accessRole" value={selectedRole} />
          <Button type="submit" variant="secondary" disabled={resetTplPending}>
            Reset template to factory defaults
          </Button>
          {resetTplState.success ? (
            <p className="mt-2 text-sm text-emerald-700">{resetTplState.success}</p>
          ) : null}
        </form>
      </section>

      <section className="space-y-4 rounded-xl border border-[color:var(--fyh-border)] p-5">
        <h3 className="text-lg font-medium text-fyh-text">Employee overrides</h3>
        {employees.length === 0 ? (
          <p className="text-sm text-fyh-text-secondary">No employees yet.</p>
        ) : (
          <>
            <label className="block text-sm">
              <span className="font-medium">Employee</span>
              <select
                className="fyh-select mt-1 w-full max-w-md"
                value={selectedEmployeeId}
                onChange={(e) => setSelectedEmployeeId(e.target.value)}
              >
                {employees.map((row) => (
                  <option key={row.employee.id} value={row.employee.id}>
                    {row.employee.fullName} — {workforceAccessRoleLabel(row.membership.jobRole)}
                  </option>
                ))}
              </select>
            </label>

            {employee ? (
              <>
                <p className="text-xs text-fyh-text-secondary">
                  Effective permissions: {employee.grants.permissions.length} keys
                </p>
                <form action={empAction} className="space-y-3">
                  <input type="hidden" name="employeeId" value={employee.employee.id} />
                  <PermissionChecklist selected={new Set(employee.grants.permissions)} />
                  <Button type="submit" disabled={empPending}>
                    {empPending ? 'Saving…' : 'Save employee override'}
                  </Button>
                  {empState.error ? <p className="text-sm text-red-600">{empState.error}</p> : null}
                  {empState.success ? (
                    <p className="text-sm text-emerald-700">{empState.success}</p>
                  ) : null}
                </form>
                <form action={resetEmpAction}>
                  <input type="hidden" name="employeeId" value={employee.employee.id} />
                  <Button type="submit" variant="secondary" disabled={resetEmpPending}>
                    Reset to role template
                  </Button>
                  {resetEmpState.success ? (
                    <p className="mt-2 text-sm text-emerald-700">{resetEmpState.success}</p>
                  ) : null}
                </form>
              </>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}
