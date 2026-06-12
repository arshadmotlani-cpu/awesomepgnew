'use client';

import { useActionState } from 'react';
import {
  cleanupOperatorTestDataAction,
  type CleanupActionState,
} from '@/app/(admin)/admin/settings/cleanup-actions';

const idleState: CleanupActionState = { status: 'idle' };

export function OperatorTestDataCleanupButton() {
  const [state, formAction, pending] = useActionState(cleanupOperatorTestDataAction, idleState);

  return (
    <form action={formAction} className="space-y-3">
      <p className="text-sm text-zinc-600">
        Clears June 2026 deposit deductions that inflate Overview extra income (verify-script rows,
        test accounts, and other non-vacating charges). Also cancels your own pending test bookings.
      </p>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-60"
      >
        {pending ? 'Cleaning up…' : 'Remove test data from overview'}
      </button>
      {state.status === 'ok' ? (
        <p className="text-sm text-emerald-700">{state.message}</p>
      ) : null}
      {state.status === 'error' ? (
        <p className="text-sm text-rose-700">{state.message}</p>
      ) : null}
    </form>
  );
}
