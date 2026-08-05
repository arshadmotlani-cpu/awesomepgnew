'use client';

import { useActionState } from 'react';
import {
  createWorkforceEmployeeAction,
  type WorkforceActionState,
} from '@/src/workforce/actions/employees';
import { WORKFORCE_JOB_ROLES, WORKFORCE_PERMISSION_KEYS, WORKFORCE_RANKS } from '@/src/workforce/types';
import { Button } from '@/src/hair/components/ui/button';
import { Input } from '@/src/hair/components/ui/input';

const initial: WorkforceActionState = {};

const PERMISSION_GROUPS: Array<{ title: string; keys: string[] }> = [
  {
    title: 'Dashboard',
    keys: [
      'dashboard.view_revenue',
      'dashboard.view_expenses',
      'dashboard.view_staff',
      'dashboard.view_customers',
    ],
  },
  {
    title: 'Appointments',
    keys: [
      'appointments.receive_bookings',
      'appointments.view_own',
      'appointments.view_all',
      'appointments.edit',
    ],
  },
  {
    title: 'Billing',
    keys: ['billing.create_invoice', 'billing.edit_invoice', 'billing.backdate_invoice'],
  },
  {
    title: 'Inventory',
    keys: ['inventory.view', 'inventory.edit'],
  },
  {
    title: 'Finance',
    keys: ['finance.view_salary', 'finance.view_profit', 'finance.view_expenses'],
  },
  {
    title: 'Reports',
    keys: ['reports.view', 'reports.export'],
  },
  {
    title: 'Staff',
    keys: ['staff.view', 'staff.edit', 'staff.add'],
  },
  {
    title: 'Settings',
    keys: ['settings.manage'],
  },
];

export function WorkforceCreateForm() {
  const [state, action, pending] = useActionState(createWorkforceEmployeeAction, initial);

  return (
    <form action={action} className="space-y-6 rounded-xl border border-[color:var(--fyh-border)] bg-[color:var(--fyh-surface)] p-6">
      <div>
        <h2 className="text-lg font-semibold text-fyh-text">Add employee</h2>
        <p className="text-sm text-fyh-text-secondary">Workforce Engine — clean profile only.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span>Full name</span>
          <Input name="fullName" required />
        </label>
        <label className="space-y-1 text-sm">
          <span>Mobile (login)</span>
          <Input name="mobile" placeholder="9876543210" />
        </label>
        <label className="space-y-1 text-sm">
          <span>Password (optional until login needed)</span>
          <Input name="password" type="password" autoComplete="new-password" />
        </label>
        <label className="space-y-1 text-sm">
          <span>Gender</span>
          <select name="gender" className="w-full rounded-md border px-3 py-2">
            <option value="unspecified">Unspecified</option>
            <option value="female">Female</option>
            <option value="male">Male</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span>Emergency contact</span>
          <Input name="emergencyContact" />
        </label>
        <label className="space-y-1 text-sm">
          <span>Date of joining</span>
          <Input name="joiningDate" type="date" />
        </label>
        <label className="space-y-1 text-sm">
          <span>Aadhaar</span>
          <Input name="aadhaarNumber" />
        </label>
        <label className="space-y-1 text-sm">
          <span>PAN</span>
          <Input name="panNumber" />
        </label>
        <label className="space-y-1 text-sm">
          <span>Salary (₹)</span>
          <Input name="salaryInr" type="number" min={0} step="1" defaultValue={0} />
        </label>
        <label className="space-y-1 text-sm">
          <span>UPI ID</span>
          <Input name="upiId" />
        </label>
        <label className="space-y-1 text-sm">
          <span>QR code URL</span>
          <Input name="qrCodeUrl" />
        </label>
        <label className="space-y-1 text-sm">
          <span>Photo URL</span>
          <Input name="photoUrl" />
        </label>
        <label className="space-y-1 text-sm">
          <span>Status</span>
          <select name="status" className="w-full rounded-md border px-3 py-2" defaultValue="active">
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span>Rank</span>
          <select name="rank" className="w-full rounded-md border px-3 py-2" defaultValue="team_member">
            {WORKFORCE_RANKS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span>Job role</span>
          <select name="jobRole" className="w-full rounded-md border px-3 py-2" defaultValue="stylist">
            {WORKFORCE_JOB_ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span>Max backdate days (blank = rank default / unlimited for owner)</span>
          <Input name="maxBackdateDays" placeholder="7" />
        </label>
      </div>

      <div className="space-y-4">
        <h3 className="font-medium">Permissions</h3>
        {PERMISSION_GROUPS.map((g) => (
          <fieldset key={g.title} className="rounded-lg border p-3">
            <legend className="px-1 text-sm font-medium">{g.title}</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {g.keys.map((key) => (
                <label key={key} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="permissions" value={key} />
                  <span>{key.split('.').slice(1).join(' ')}</span>
                </label>
              ))}
            </div>
          </fieldset>
        ))}
        <p className="text-xs text-fyh-text-secondary">
          Leave unchecked to use rank/job-role defaults ({WORKFORCE_PERMISSION_KEYS.length} keys total).
        </p>
      </div>

      {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}
      {state.success ? <p className="text-sm text-emerald-700">{state.success}</p> : null}
      <Button type="submit" disabled={pending}>
        {pending ? 'Saving…' : 'Create employee'}
      </Button>
    </form>
  );
}
