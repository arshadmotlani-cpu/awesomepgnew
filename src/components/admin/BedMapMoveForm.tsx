'use client';

import { useRouter } from 'next/navigation';
import { useActionState, useEffect } from 'react';
import {
  updateTenancyAction,
  type UpdateTenancyState,
} from '@/app/(admin)/admin/residents/[customerId]/actions';

type BedOption = { bedId: string; label: string };

export function BedMapMoveForm({
  pgId,
  bookingId,
  customerId,
  currentBedId,
  beds,
}: {
  pgId: string;
  bookingId: string;
  customerId: string;
  currentBedId: string;
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
    <form action={action} className="space-y-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
      <input type="hidden" name="bookingId" value={bookingId} />
      <input type="hidden" name="customerId" value={customerId} />
      <input type="hidden" name="pgId" value={pgId} />
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Shift to another bed</p>
      <select
        name="newBedId"
        defaultValue={currentBedId}
        className="apg-admin-field w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
      >
        {beds.map((b) => (
          <option key={b.bedId} value={b.bedId}>
            {b.label}
          </option>
        ))}
      </select>
      {state.error ? <p className="text-xs text-rose-600">{state.error}</p> : null}
      {state.ok ? <p className="text-xs text-emerald-600">Bed updated.</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-[#FF5A1F] px-3 py-2 text-xs font-semibold text-white hover:brightness-110 disabled:opacity-60"
      >
        {pending ? 'Moving…' : 'Save bed move'}
      </button>
    </form>
  );
}
