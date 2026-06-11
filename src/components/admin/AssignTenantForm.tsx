'use client';

import { useActionState } from 'react';
import {
  assignTenantAction,
  type AssignTenantState,
} from '@/app/(admin)/admin/bookings/new/actions';

type BedOption = {
  bedId: string;
  label: string;
};

export function AssignTenantForm({
  beds,
  defaultBedId,
  defaultStartDate,
  prefill,
}: {
  beds: BedOption[];
  defaultBedId?: string;
  defaultStartDate: string;
  prefill?: {
    customerId: string;
    fullName: string;
    email: string;
    phone: string;
    gender: 'male' | 'female' | 'other';
  } | null;
}) {
  const [state, action, pending] = useActionState(assignTenantAction, {
    ok: false,
  } satisfies AssignTenantState);

  return (
    <form action={action} className="max-w-xl space-y-4 rounded-xl border border-zinc-200 bg-white p-6">
      {prefill ? <input type="hidden" name="customerId" value={prefill.customerId} /> : null}

      <label className="block text-sm">
        <span className="font-medium text-zinc-700">Bed *</span>
        <select
          name="bedId"
          required
          defaultValue={defaultBedId ?? ''}
          className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
        >
          <option value="" disabled>
            Select bed…
          </option>
          {beds.map((b) => (
            <option key={b.bedId} value={b.bedId}>
              {b.label}
            </option>
          ))}
        </select>
      </label>

      <label className="block text-sm">
        <span className="font-medium text-zinc-700">Move-in date *</span>
        <input
          type="date"
          name="startDate"
          required
          defaultValue={defaultStartDate}
          className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
        />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="font-medium text-zinc-700">Full name *</span>
          <input
            name="fullName"
            required
            defaultValue={prefill?.fullName ?? ''}
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-zinc-700">Phone *</span>
          <input
            name="phone"
            required
            placeholder="+91…"
            defaultValue={prefill?.phone ?? ''}
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
          />
        </label>
      </div>

      <label className="block text-sm">
        <span className="font-medium text-zinc-700">Email *</span>
        <input
          type="email"
          name="email"
          required
          defaultValue={prefill?.email ?? ''}
          className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
        />
      </label>

      <label className="block text-sm">
        <span className="font-medium text-zinc-700">Gender *</span>
        <select
          name="gender"
          required
          defaultValue={prefill?.gender ?? 'male'}
          className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
        >
          <option value="male">Male</option>
          <option value="female">Female</option>
          <option value="other">Other</option>
        </select>
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="font-medium text-zinc-700">Monthly rent (₹)</span>
          <input
            type="number"
            name="monthlyRentInr"
            min="0"
            step="1"
            placeholder="7140 — grandfathered rate"
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
          />
          <span className="mt-1 block text-xs text-zinc-500">
            Locked on booking — only this tenant sees it on their dashboard.
          </span>
        </label>
        <label className="block text-sm">
          <span className="font-medium text-zinc-700">Deposit collected (₹)</span>
          <input
            type="number"
            name="depositInr"
            min="0"
            step="1"
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
          />
        </label>
      </div>

      <label className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-950">
        <input type="checkbox" name="blocksWholeRoom" className="mt-1" />
        <span>
          <strong>Block whole room on calendar</strong> — both/all beds show occupied to
          others; when this tenant vacates, all beds in the room free on the same date.
          Use for single-sharing rent in a multi-bed room (e.g. Room 201).
        </span>
      </label>

      <label className="block text-sm">
        <span className="font-medium text-zinc-700">Notes</span>
        <textarea
          name="notes"
          rows={2}
          className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
          placeholder="Grandfathered single-sharing rent until Jul 2026…"
        />
      </label>

      {state.error ? <p className="text-sm text-rose-600">{state.error}</p> : null}

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-[#FF5A1F] px-4 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-60"
      >
        {pending ? 'Assigning…' : 'Assign tenant to bed'}
      </button>
    </form>
  );
}
