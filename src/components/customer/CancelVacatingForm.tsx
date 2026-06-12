'use client';

import { useActionState } from 'react';
import {
  cancelVacatingAction,
  type CancelVacatingActionState,
} from '@/app/(customer)/account/resident/actions';
import { ACCOUNT_SURFACE_DANGER_BTN } from '@/src/components/customer/accountStyles';

const idle: CancelVacatingActionState = { status: 'idle' };

export function CancelVacatingForm({
  requestId,
  bookingId,
}: {
  requestId: string;
  bookingId: string;
}) {
  const [state, formAction, pending] = useActionState(cancelVacatingAction, idle);

  return (
    <form action={formAction} className="mt-3 space-y-2">
      <input type="hidden" name="requestId" value={requestId} />
      <input type="hidden" name="bookingId" value={bookingId} />
      <p className="text-xs text-zinc-600">
        Submitted by mistake? You can withdraw while admin has not acted on it yet.
      </p>
      <button type="submit" disabled={pending} className={ACCOUNT_SURFACE_DANGER_BTN}>
        {pending ? 'Withdrawing…' : 'Withdraw vacating request'}
      </button>
      {state.status === 'error' ? (
        <p className="rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700 ring-1 ring-inset ring-rose-200">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
