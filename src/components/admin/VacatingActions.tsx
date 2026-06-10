'use client';

import { useActionState } from 'react';
import {
  approveVacatingAction,
  completeVacatingAction,
  rejectVacatingAction,
  type ActionState,
} from '@/app/(admin)/admin/vacating/actions';

const idle: ActionState = { status: 'idle' };

function MicroForm({
  requestId,
  label,
  action,
  className,
}: {
  requestId: string;
  label: string;
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  className: string;
}) {
  const [state, formAction, pending] = useActionState(action, idle);
  return (
    <form action={formAction}>
      <input type="hidden" name="requestId" value={requestId} />
      <button
        type="submit"
        disabled={pending}
        title={state.status === 'error' ? state.message : undefined}
        className={className + ' disabled:opacity-50'}
      >
        {pending ? '…' : label}
      </button>
    </form>
  );
}

export function ApproveVacatingButton({ requestId }: { requestId: string }) {
  return (
    <MicroForm
      requestId={requestId}
      label="Approve"
      action={approveVacatingAction}
      className="rounded-md bg-indigo-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-indigo-500"
    />
  );
}

export function RejectVacatingButton({ requestId }: { requestId: string }) {
  return (
    <MicroForm
      requestId={requestId}
      label="Reject"
      action={rejectVacatingAction}
      className="rounded-md bg-white px-2 py-1 text-[11px] font-medium text-zinc-700 ring-1 ring-inset ring-zinc-200 hover:bg-zinc-50"
    />
  );
}

export function CompleteVacatingButton({ requestId }: { requestId: string }) {
  return (
    <MicroForm
      requestId={requestId}
      label="Complete"
      action={completeVacatingAction}
      className="rounded-md bg-emerald-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-emerald-500"
    />
  );
}
