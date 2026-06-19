'use client';

import { useRouter } from 'next/navigation';
import { useActionState, useEffect, type ReactNode } from 'react';
import { AdminConfirmSubmit } from '@/src/components/admin/AdminConfirmSubmit';
import {
  approveVacatingAction,
  cancelVacatingNoticeAction,
  completeVacatingAction,
  extendVacatingDateAction,
  rejectVacatingAction,
  undoVacatingApprovalAction,
  undoVacatingCompletionAction,
  type ActionState,
} from '@/app/(admin)/admin/vacating/actions';

const idle: ActionState = { status: 'idle' };

function MicroForm({
  formId,
  requestId,
  pgId,
  action,
  label,
  pendingLabel,
  className,
  title,
  description,
  confirmLabel,
  tone = 'default',
  extraFields,
}: {
  formId: string;
  requestId: string;
  pgId?: string;
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  label: string;
  pendingLabel?: string;
  className: string;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  tone?: 'default' | 'danger';
  extraFields?: ReactNode;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(action, idle);

  useEffect(() => {
    if (state.status === 'ok') router.refresh();
  }, [state.status, router]);

  return (
    <form id={formId} action={formAction}>
      <input type="hidden" name="requestId" value={requestId} />
      {pgId ? <input type="hidden" name="pgId" value={pgId} /> : null}
      {extraFields}
      <AdminConfirmSubmit
        formId={formId}
        title={title}
        description={description}
        confirmLabel={confirmLabel}
        tone={tone}
        pending={pending}
        className={className + ' disabled:opacity-50'}
      >
        {pending ? pendingLabel ?? '…' : label}
      </AdminConfirmSubmit>
      {state.status === 'error' ? (
        <p className="mt-1 max-w-[14rem] text-[10px] leading-snug text-rose-600">{state.message}</p>
      ) : null}
    </form>
  );
}

export function ApproveVacatingButton({
  requestId,
  pgId,
  className,
  label = 'Approve',
}: {
  requestId: string;
  pgId?: string;
  className?: string;
  label?: string;
}) {
  return (
    <MicroForm
      formId={`approve-vacating-${requestId}`}
      requestId={requestId}
      pgId={pgId}
      label={label}
      action={approveVacatingAction}
      className={
        className ??
        'rounded-md bg-indigo-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-indigo-500'
      }
      title="Approve vacating notice?"
      description="The bed will open for website pre-booking from the vacating date. The tenant stays until then."
      confirmLabel="Approve notice"
    />
  );
}

export function RejectVacatingButton({
  requestId,
  pgId,
}: {
  requestId: string;
  pgId?: string;
}) {
  return (
    <MicroForm
      formId={`reject-vacating-${requestId}`}
      requestId={requestId}
      pgId={pgId}
      label="Reject"
      action={rejectVacatingAction}
      className="rounded-md bg-white px-2 py-1 text-[11px] font-medium text-zinc-700 ring-1 ring-inset ring-zinc-200 hover:bg-zinc-50"
      title="Reject vacating notice?"
      description="The tenant must continue their stay. This cannot be undone from the vacating queue — they can file a new notice later."
      confirmLabel="Reject notice"
      tone="danger"
      extraFields={
        <input type="hidden" name="reason" value="Rejected by admin from vacating queue" />
      }
    />
  );
}

export function CompleteVacatingButton({
  requestId,
  pgId,
}: {
  requestId: string;
  pgId?: string;
}) {
  return (
    <MicroForm
      formId={`complete-vacating-${requestId}`}
      requestId={requestId}
      pgId={pgId}
      label="Complete"
      action={completeVacatingAction}
      className="rounded-md bg-emerald-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-emerald-500"
      title="Complete vacating?"
      description={
        <>
          <strong className="text-zinc-900">Only use when the tenant has physically left.</strong>{' '}
          This writes deposit deductions/refunds, cancels future rent & electricity bills, and marks
          the booking completed. If the bed is already empty, use <em>Cancel notice</em> instead.
        </>
      }
      confirmLabel="Complete vacating"
      tone="danger"
    />
  );
}

export function UndoVacatingCompletionButton({
  requestId,
  pgId,
}: {
  requestId: string;
  pgId?: string;
}) {
  return (
    <MicroForm
      formId={`undo-complete-vacating-${requestId}`}
      requestId={requestId}
      pgId={pgId}
      label="Undo"
      pendingLabel="Undoing…"
      action={undoVacatingCompletionAction}
      className="rounded-md bg-amber-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-amber-500"
      title="Undo vacating completion?"
      description="Restores the booking to confirmed, reopens the bed assignment, and reverses deposit ledger entries from this completion. Blocked if someone else took the bed."
      confirmLabel="Undo completion"
      tone="danger"
    />
  );
}

export function CancelVacatingNoticeButton({
  requestId,
  pgId,
}: {
  requestId: string;
  pgId?: string;
}) {
  return (
    <MicroForm
      formId={`cancel-vacating-${requestId}`}
      requestId={requestId}
      pgId={pgId}
      label="Cancel notice"
      action={cancelVacatingNoticeAction}
      className="rounded-md bg-white px-2 py-1 text-[11px] font-medium text-amber-800 ring-1 ring-inset ring-amber-200 hover:bg-amber-50"
      title="Cancel vacating notice?"
      description="Removes the notice entirely. Tenancy continues without a new booking."
      confirmLabel="Remove notice"
      tone="danger"
    />
  );
}

export function ExtendVacatingDateForm({
  bookingId,
  currentVacatingDate,
}: {
  bookingId: string;
  currentVacatingDate?: string;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(extendVacatingDateAction, idle);
  const formId = `extend-vacating-${bookingId}`;

  useEffect(() => {
    if (state.status === 'ok') router.refresh();
  }, [state.status, router]);

  return (
    <form id={formId} action={formAction} className="mt-2 flex flex-wrap items-end gap-2">
      <input type="hidden" name="bookingId" value={bookingId} />
      <label className="text-[11px] text-zinc-600">
        New vacate / end date
        <input
          type="date"
          name="newVacatingDate"
          defaultValue={currentVacatingDate}
          required
          className="mt-0.5 block rounded border border-zinc-300 px-2 py-1 text-xs"
        />
      </label>
      <AdminConfirmSubmit
        formId={formId}
        title="Change vacate date?"
        description="Extends or shortens the stay on the existing booking — no duplicate booking. Occupancy and revenue update immediately."
        confirmLabel="Update date"
        pending={pending}
        className="rounded-md bg-sky-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-sky-500 disabled:opacity-50"
      >
        {pending ? 'Saving…' : 'Extend / change date'}
      </AdminConfirmSubmit>
      {state.status === 'ok' ? (
        <p className="w-full text-[10px] text-emerald-700">{state.message}</p>
      ) : state.status === 'error' ? (
        <p className="w-full text-[10px] text-rose-600">{state.message}</p>
      ) : null}
    </form>
  );
}

export function UndoVacatingApprovalButton({
  requestId,
  pgId,
}: {
  requestId: string;
  pgId?: string;
}) {
  return (
    <MicroForm
      formId={`undo-approve-vacating-${requestId}`}
      requestId={requestId}
      pgId={pgId}
      label="Undo approve"
      action={undoVacatingApprovalAction}
      className="rounded-md bg-white px-2 py-1 text-[11px] font-medium text-indigo-700 ring-1 ring-inset ring-indigo-200 hover:bg-indigo-50"
      title="Undo approval?"
      description="Notice goes back to pending. The bed will no longer show as pre-bookable on the website until you approve again."
      confirmLabel="Undo approval"
    />
  );
}
