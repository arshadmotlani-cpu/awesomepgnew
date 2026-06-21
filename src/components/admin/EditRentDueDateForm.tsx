'use client';

import { useActionState, useId } from 'react';
import {
  updateRentDueDateAction,
  type UpdateRentDueState,
} from '@/app/(admin)/admin/residents/[customerId]/actions';
import { AdminConfirmSubmit } from '@/src/components/admin/AdminConfirmSubmit';

export function EditRentDueDateForm({
  bookingId,
  customerId,
  currentNextDueDate,
  billingDay,
}: {
  bookingId: string;
  customerId: string;
  currentNextDueDate: string;
  billingDay: number;
}) {
  const formId = useId().replace(/:/g, '');
  const [state, action, pending] = useActionState(updateRentDueDateAction, {
    ok: false,
  } satisfies UpdateRentDueState);

  return (
    <form
      id={formId}
      action={action}
      className="space-y-3 rounded-2xl border border-white/10 bg-[#1A1F27] p-5"
    >
      <input type="hidden" name="bookingId" value={bookingId} />
      <input type="hidden" name="customerId" value={customerId} />

      <div>
        <h3 className="text-sm font-semibold text-white">Override rent due date</h3>
        <p className="mt-1 text-xs text-apg-silver">
          Current billing day: <strong className="text-white">{billingDay}</strong> · Next due:{' '}
          <strong className="text-white">{currentNextDueDate}</strong>. Updates the billing day and
          the earliest open rent bill. Logged in audit.
        </p>
      </div>

      <label className="block text-sm">
        <span className="font-medium text-apg-silver">Next rent due date</span>
        <input
          type="date"
          name="nextDueDate"
          required
          defaultValue={currentNextDueDate}
          className="apg-admin-field mt-1 w-full max-w-xs rounded-lg border border-white/10 px-3 py-2 text-sm"
        />
      </label>

      <label className="block text-sm">
        <span className="font-medium text-apg-silver">Reason</span>
        <input
          type="text"
          name="reason"
          required
          maxLength={200}
          placeholder="Why are you changing the due date?"
          className="apg-admin-field mt-1 w-full rounded-lg border border-white/10 px-3 py-2 text-sm"
        />
      </label>

      {state.error ? <p className="text-xs text-rose-300">{state.error}</p> : null}
      {state.ok ? (
        <p className="text-xs text-emerald-300">
          Rent due date updated. Billing day is now the {state.billingDay}
          {state.billingDay === 1 ? 'st' : state.billingDay === 2 ? 'nd' : state.billingDay === 3 ? 'rd' : 'th'} of
          each month.
        </p>
      ) : null}

      <AdminConfirmSubmit
        formId={formId}
        title="Update rent due date?"
        description="This changes the billing day and the due date on the earliest open rent invoice."
        confirmLabel="Update due date"
        pending={pending}
        className="rounded-lg border border-white/15 px-4 py-2 text-sm font-semibold text-white hover:bg-white/5 disabled:opacity-60"
      >
        {pending ? 'Saving…' : 'Save rent due date'}
      </AdminConfirmSubmit>
    </form>
  );
}
