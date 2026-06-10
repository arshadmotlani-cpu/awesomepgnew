'use client';

import { useActionState } from 'react';
import {
  generateInvoicesAction,
  markOverdueAction,
  type ActionState,
} from '@/app/(admin)/admin/rent/actions';

const idle: ActionState = { status: 'idle' };

export function GenerateInvoicesButton({ billingMonth }: { billingMonth: string }) {
  const [state, action, pending] = useActionState(generateInvoicesAction, idle);
  return (
    <form action={action} className="inline-flex flex-col items-end gap-1">
      <input type="hidden" name="billingMonth" value={billingMonth} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-indigo-500 disabled:bg-indigo-300"
      >
        {pending ? 'Generating…' : `Generate invoices for ${billingMonth.slice(0, 7)}`}
      </button>
      {state.status === 'ok' ? (
        <span className="text-[11px] text-emerald-700">{state.message}</span>
      ) : state.status === 'error' ? (
        <span className="text-[11px] text-rose-700">{state.message}</span>
      ) : null}
    </form>
  );
}

export function MarkOverdueButton() {
  const [state, action, pending] = useActionState(markOverdueAction, idle);
  return (
    <form action={action} className="inline-flex flex-col items-end gap-1">
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 ring-1 ring-inset ring-zinc-200 hover:bg-zinc-50 disabled:opacity-60"
      >
        {pending ? 'Sweeping…' : 'Mark overdue (sweep)'}
      </button>
      {state.status === 'ok' ? (
        <span className="text-[11px] text-emerald-700">{state.message}</span>
      ) : state.status === 'error' ? (
        <span className="text-[11px] text-rose-700">{state.message}</span>
      ) : null}
    </form>
  );
}
