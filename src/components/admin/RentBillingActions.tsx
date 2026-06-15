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
    <form action={action} className="inline-flex flex-col gap-1">
      <input type="hidden" name="billingMonth" value={billingMonth} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-[#FF5A1F] px-3 py-2 text-xs font-semibold text-white hover:brightness-110 disabled:opacity-50"
      >
        {pending ? 'Generating…' : `Generate rent for ${billingMonth.slice(0, 7)}`}
      </button>
      {state.status === 'ok' ? (
        <span className="text-[11px] text-emerald-300">{state.message}</span>
      ) : state.status === 'error' ? (
        <span className="text-[11px] text-rose-300">{state.message}</span>
      ) : null}
    </form>
  );
}

export function MarkOverdueButton() {
  const [state, action, pending] = useActionState(markOverdueAction, idle);
  return (
    <form action={action} className="inline-flex flex-col gap-1">
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg border border-white/10 px-3 py-2 text-xs font-medium text-apg-silver hover:text-white disabled:opacity-50"
      >
        {pending ? 'Sweeping…' : 'Mark overdue'}
      </button>
      {state.status === 'ok' ? (
        <span className="text-[11px] text-emerald-300">{state.message}</span>
      ) : state.status === 'error' ? (
        <span className="text-[11px] text-rose-300">{state.message}</span>
      ) : null}
    </form>
  );
}
