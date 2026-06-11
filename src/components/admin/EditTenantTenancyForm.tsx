'use client';

import { useRouter } from 'next/navigation';
import { useActionState, useEffect } from 'react';
import {
  updateTenancyAction,
  type UpdateTenancyState,
} from '@/app/(admin)/admin/residents/[customerId]/actions';
import { paiseToInr } from '@/src/lib/format';

type BedOption = { bedId: string; label: string };

export function EditTenantTenancyForm({
  bookingId,
  currentBedId,
  currentRoomLabel,
  currentMonthlyRentPaise,
  blocksWholeRoom,
  beds,
}: {
  bookingId: string;
  currentBedId: string;
  currentRoomLabel: string;
  currentMonthlyRentPaise: number;
  blocksWholeRoom: boolean;
  beds: BedOption[];
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(updateTenancyAction, {
    ok: false,
  } satisfies UpdateTenancyState);

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state.ok, router]);

  return (
    <form action={action} className="space-y-4 rounded-xl border border-zinc-200 bg-white p-5">
      <input type="hidden" name="bookingId" value={bookingId} />
      <h3 className="text-sm font-semibold text-zinc-900">Edit assignment & billing</h3>
      <p className="text-sm text-zinc-600">
        Current: <strong>{currentRoomLabel}</strong> · Rent {paiseToInr(currentMonthlyRentPaise)}/mo
      </p>

      <label className="block text-sm">
        <span className="font-medium text-zinc-700">Move to bed</span>
        <select
          name="newBedId"
          defaultValue={currentBedId}
          className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
        >
          {beds.map((b) => (
            <option key={b.bedId} value={b.bedId}>
              {b.label}
            </option>
          ))}
        </select>
      </label>

      <label className="block text-sm">
        <span className="font-medium text-zinc-700">Monthly rent (₹)</span>
        <input
          type="number"
          name="monthlyRentInr"
          min="0"
          step="1"
          defaultValue={Math.round(currentMonthlyRentPaise / 100)}
          className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
        />
      </label>

      <label className="block text-sm">
        <span className="font-medium text-zinc-700">Additional deposit collected (₹)</span>
        <input
          type="number"
          name="additionalDepositInr"
          min="0"
          step="1"
          placeholder="0 — add to deposit ledger"
          className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
        />
      </label>

      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="blocksWholeRoom" defaultChecked={blocksWholeRoom} />
        <span>Block whole room on calendar (single-tenant room)</span>
      </label>

      {state.error ? <p className="text-sm text-rose-600">{state.error}</p> : null}
      {state.ok ? <p className="text-sm text-emerald-600">Saved.</p> : null}

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-[#FF5A1F] px-4 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-60"
      >
        {pending ? 'Saving…' : 'Save assignment & rent'}
      </button>
    </form>
  );
}
