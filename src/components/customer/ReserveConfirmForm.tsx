'use client';

import { useActionState } from 'react';
import {
  createBedReserveAction,
  type ReserveActionState,
} from '@/app/(customer)/reserve/new/actions';

const idle: ReserveActionState = { status: 'idle' };

export function ReserveConfirmForm({
  bedId,
  reserveStart,
  checkInDate,
}: {
  bedId: string;
  reserveStart: string;
  checkInDate: string;
}) {
  const [state, action, pending] = useActionState(createBedReserveAction, idle);

  return (
    <form action={action} className="mt-6">
      <input type="hidden" name="bedId" value={bedId} />
      <input type="hidden" name="reserveStart" value={reserveStart} />
      <input type="hidden" name="checkInDate" value={checkInDate} />
      {state.status === 'error' ? (
        <p className="mb-3 text-sm text-rose-700">{state.message}</p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-apg-orange py-3 text-sm font-semibold text-white disabled:opacity-60"
      >
        {pending ? 'Creating reserve…' : 'Pay reserve fee'}
      </button>
    </form>
  );
}
