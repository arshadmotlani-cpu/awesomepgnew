'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { createStaffQuickAction, type StaffActionState } from '@/src/hair/actions/staff';
import { Button } from '@/src/hair/components/ui/button';
import { Input } from '@/src/hair/components/ui/input';
import type { FyhStaff } from '@/src/hair/db/schema';
import { StaffScheduleEditor } from '@/src/hair/components/staff/StaffScheduleEditor';
import type { StaffScheduleRow } from '@/src/hair/services/staffSchedules';

const initialState: StaffActionState = {};

export function StaffPage({
  staff,
  schedulesByStaffId,
}: {
  staff: FyhStaff[];
  schedulesByStaffId: Record<string, StaffScheduleRow[]>;
}) {
  const [state, formAction, pending] = useActionState(createStaffQuickAction, initialState);

  return (
    <div className="space-y-6">
      <div>
        <p className="fyh-section-eyebrow">Team</p>
        <h1 className="fyh-display mt-1 text-3xl font-semibold">Staff</h1>
        <p className="mt-1 text-sm text-fyh-text-secondary">
          Assign stylists to services. Commissions accrue on paid invoices.{' '}
          <Link href="/fyh/staff/performance" className="text-fyh-accent underline-offset-2 hover:underline">
            View performance leaderboard
          </Link>
        </p>
      </div>

      <form action={formAction} className="fyh-glass grid gap-3 p-4 sm:grid-cols-4">
        <div className="space-y-1 sm:col-span-2">
          <label className="fyh-label" htmlFor="fullName">
            Name *
          </label>
          <Input id="fullName" name="fullName" required placeholder="Stylist name" />
        </div>
        <div className="space-y-1">
          <label className="fyh-label" htmlFor="phone">
            Phone
          </label>
          <Input id="phone" name="phone" placeholder="Optional" />
        </div>
        <div className="space-y-1">
          <label className="fyh-label" htmlFor="role">
            Role
          </label>
          <Input id="role" name="role" placeholder="Stylist · Colourist…" />
        </div>
        <div className="sm:col-span-4">
          {state.error ? <p className="mb-2 text-sm text-fyh-danger">{state.error}</p> : null}
          {state.success ? (
            <p className="mb-2 text-sm text-fyh-success">{state.success}</p>
          ) : null}
          <Button type="submit" disabled={pending}>
            {pending ? 'Adding…' : 'Add staff'}
          </Button>
        </div>
      </form>

      <div className="fyh-glass overflow-hidden">
        {staff.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-fyh-text-muted">
            No staff members yet. Add someone to assign them on services.
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-[color:var(--fyh-border)] bg-black/20 text-xs uppercase tracking-wide text-fyh-text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Phone</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Performance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--fyh-border)]">
              {staff.map((s) => (
                <tr key={s.id}>
                  <td className="px-4 py-3 font-medium">{s.fullName}</td>
                  <td className="px-4 py-3 tabular-nums text-fyh-text-muted">
                    {s.phone || '—'}
                  </td>
                  <td className="px-4 py-3 text-fyh-text-muted">{s.role || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={s.isActive ? 'text-fyh-success' : 'text-fyh-text-muted'}>
                      {s.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/fyh/staff/${s.id}/performance`}
                      className="text-fyh-accent underline-offset-2 hover:underline"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {staff.length > 0 ? (
        <div className="space-y-3">
          <h2 className="text-sm font-medium uppercase tracking-wide text-fyh-text-muted">
            Schedules
          </h2>
          {staff.map((s) => (
            <StaffScheduleEditor
              key={s.id}
              staffId={s.id}
              staffName={s.fullName}
              schedules={schedulesByStaffId[s.id] ?? []}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
