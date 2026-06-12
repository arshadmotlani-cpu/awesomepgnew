'use client';

import { useRouter } from 'next/navigation';
import { useActionState, useEffect } from 'react';
import {
  activateReservationAction,
  shiftToReservationAction,
  type MapActionState,
} from '@/app/(admin)/admin/pgs/[pgId]/map/actions';
import { todayString } from '@/src/lib/dates';

export function BedMapReservationForm({
  pgId,
  bookingId,
  mode,
  reservedFrom,
}: {
  pgId: string;
  bookingId: string;
  mode: 'shift_to_reservation' | 'activate_now';
  reservedFrom?: string | null;
}) {
  const router = useRouter();
  const actionFn =
    mode === 'activate_now' ? activateReservationAction : shiftToReservationAction;
  const [state, action, pending] = useActionState(actionFn, {
    ok: false,
  } satisfies MapActionState);

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state.ok, router]);

  if (mode === 'shift_to_reservation') {
    return (
      <form action={action} className="space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
        <input type="hidden" name="bookingId" value={bookingId} />
        <input type="hidden" name="pgId" value={pgId} />
        <p className="text-xs font-semibold uppercase tracking-wide text-violet-300">
          Shift to reservation
        </p>
        <p className="text-xs text-apg-silver">
          Tenant has not moved in yet — bed stays bookable on the website until this date.
        </p>
        <label className="block text-sm">
          <span className="text-apg-silver">Move-in date</span>
          <input
            type="date"
            name="moveInDate"
            required
            min={todayString()}
            className="apg-admin-field mt-1 w-full rounded-lg border border-white/10 px-3 py-2 text-sm"
          />
        </label>
        {state.error ? <p className="text-xs text-rose-300">{state.error}</p> : null}
        {state.ok ? <p className="text-xs text-emerald-300">Reservation updated.</p> : null}
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-lg border border-violet-400/40 bg-violet-500/10 px-3 py-2 text-xs font-semibold text-violet-100 hover:bg-violet-500/20 disabled:opacity-60"
        >
          {pending ? 'Saving…' : 'Mark as reserved'}
        </button>
      </form>
    );
  }

  return (
    <form action={action} className="space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <input type="hidden" name="bookingId" value={bookingId} />
      <input type="hidden" name="pgId" value={pgId} />
      <p className="text-xs font-semibold uppercase tracking-wide text-emerald-300">
        Activate reservation
      </p>
      <p className="text-xs text-apg-silver">
        Reserved from {reservedFrom ?? '—'} — mark as moved in today.
      </p>
      {state.error ? <p className="text-xs text-rose-300">{state.error}</p> : null}
      {state.ok ? <p className="text-xs text-emerald-300">Tenant marked as moved in.</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg border border-emerald-400/40 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-100 hover:bg-emerald-500/20 disabled:opacity-60"
      >
        {pending ? 'Saving…' : 'Moved in today'}
      </button>
    </form>
  );
}
