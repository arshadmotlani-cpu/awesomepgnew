'use client';

import { useActionState, useMemo, useState } from 'react';
import {
  assignTenantAction,
  type AssignTenantState,
} from '@/app/(admin)/admin/bookings/new/actions';

type BedOption = {
  bedId: string;
  label: string;
  monthlyRatePaise: number;
};

const fieldClass =
  'apg-admin-field mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm';
const readOnlyFieldClass = `${fieldClass} bg-zinc-50`;

function inrFromPaise(paise: number): string {
  if (paise <= 0) return '';
  return (paise / 100).toLocaleString('en-IN');
}

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
  const [selectedBedId, setSelectedBedId] = useState(defaultBedId ?? '');

  const selectedBed = useMemo(
    () => beds.find((b) => b.bedId === selectedBedId) ?? null,
    [beds, selectedBedId],
  );

  return (
    <form action={action} className="max-w-xl space-y-4 rounded-xl border border-zinc-200 bg-white p-6">
      {prefill ? <input type="hidden" name="customerId" value={prefill.customerId} /> : null}

      <label className="block text-sm">
        <span className="font-medium text-zinc-700">Bed *</span>
        <select
          name="bedId"
          required
          value={selectedBedId}
          onChange={(e) => setSelectedBedId(e.target.value)}
          className={fieldClass}
        >
          <option value="" disabled>
            Select bed…
          </option>
          {beds.map((b) => (
            <option key={b.bedId} value={b.bedId}>
              {b.label}
              {b.monthlyRatePaise > 0 ? ` · ₹${inrFromPaise(b.monthlyRatePaise)}/mo` : ''}
            </option>
          ))}
        </select>
        {selectedBed && selectedBed.monthlyRatePaise > 0 ? (
          <span className="mt-1 block text-xs text-zinc-600">
            Room rate: <strong>₹{inrFromPaise(selectedBed.monthlyRatePaise)}/month</strong> — leave
            Monthly rent empty below to use this.
          </span>
        ) : selectedBed ? (
          <span className="mt-1 block text-xs text-amber-700">
            No rent saved for this bed yet. Open PG → Rooms and click Save room rent first.
          </span>
        ) : null}
      </label>

      <label className="block text-sm">
        <span className="font-medium text-zinc-700">Move-in date *</span>
        <input
          type="date"
          name="startDate"
          required
          defaultValue={defaultStartDate}
          min={defaultStartDate.slice(0, 8) + '01'}
          className={fieldClass}
        />
        <span className="mt-1 block text-xs text-zinc-500">
          Can be any day in the current month (e.g. 1 {defaultStartDate.slice(0, 7)}) after room rent
          is saved.
        </span>
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="font-medium text-zinc-700">Full name</span>
          <input
            name="fullName"
            required
            readOnly={!!prefill}
            defaultValue={prefill?.fullName ?? ''}
            className={prefill ? readOnlyFieldClass : fieldClass}
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-zinc-700">Phone</span>
          <input
            name="phone"
            required
            readOnly={!!prefill}
            placeholder="+91…"
            defaultValue={prefill?.phone ?? ''}
            className={prefill ? readOnlyFieldClass : fieldClass}
          />
        </label>
      </div>

      <label className="block text-sm">
        <span className="font-medium text-zinc-700">Email</span>
        <input
          type="email"
          name="email"
          required
          readOnly={!!prefill}
          defaultValue={prefill?.email ?? ''}
          className={prefill ? readOnlyFieldClass : fieldClass}
        />
        {prefill ? (
          <span className="mt-1 block text-xs text-zinc-500">
            From website signup — linked to their login.
          </span>
        ) : null}
      </label>

      <label className="block text-sm">
        <span className="font-medium text-zinc-700">Gender *</span>
        <select
          name="gender"
          required
          defaultValue={prefill?.gender ?? 'male'}
          className={fieldClass}
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
            placeholder="Leave empty = room rate"
            className={fieldClass}
          />
          <span className="mt-1 block text-xs text-zinc-500">
            Only fill this for a special rate (e.g. old tenant paying more). Otherwise leave blank.
          </span>
        </label>
        <label className="block text-sm">
          <span className="font-medium text-zinc-700">Deposit collected (₹)</span>
          <input
            type="number"
            name="depositInr"
            min="0"
            step="1"
            placeholder="Optional"
            className={fieldClass}
          />
        </label>
      </div>

      <label className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-950">
        <input type="checkbox" name="blocksWholeRoom" className="mt-1" />
        <span>
          <strong>Block whole room on calendar</strong> — all beds in the room show occupied to
          others. Only use when one person has the entire room alone (single sharing).
        </span>
      </label>

      <label className="block text-sm">
        <span className="font-medium text-zinc-700">Notes</span>
        <textarea
          name="notes"
          rows={2}
          className={fieldClass}
          placeholder="Optional internal note…"
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
