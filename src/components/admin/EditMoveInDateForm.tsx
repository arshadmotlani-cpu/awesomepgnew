'use client';

import { useActionState, useId } from 'react';
import {
  updateMoveInDateAction,
  type UpdateMoveInState,
} from '@/app/(admin)/admin/residents/[customerId]/actions';
import { AdminConfirmSubmit } from '@/src/components/admin/AdminConfirmSubmit';
import { STAY_TIMING_RULE_COPY } from '@/src/lib/residents/stayBillingRules';

export function EditMoveInDateForm({
  bookingId,
  customerId,
  currentMoveInDate,
}: {
  bookingId: string;
  customerId: string;
  currentMoveInDate: string;
}) {
  const formId = useId().replace(/:/g, '');
  const [state, action, pending] = useActionState(updateMoveInDateAction, {
    ok: false,
  } satisfies UpdateMoveInState);

  return (
    <form
      id={formId}
      action={action}
      className="space-y-3 rounded-2xl border border-white/10 bg-[#1A1F27] p-5"
    >
      <input type="hidden" name="bookingId" value={bookingId} />
      <input type="hidden" name="customerId" value={customerId} />

      <div>
        <h3 className="text-sm font-semibold text-white">Change check-in date</h3>
        <p className="mt-1 text-xs text-apg-silver">
          Current move-in: <strong className="text-white">{currentMoveInDate}</strong>. Rent due day
          follows the day of month you pick (e.g. 1st → due on the 1st each month). Open rent bills
          are recalculated automatically.
        </p>
        <p className="mt-2 text-[11px] text-apg-silver">{STAY_TIMING_RULE_COPY}</p>
      </div>

      <label className="block text-sm">
        <span className="font-medium text-apg-silver">New check-in date</span>
        <input
          type="date"
          name="moveInDate"
          required
          defaultValue={currentMoveInDate}
          max={new Date().toISOString().slice(0, 10)}
          className="apg-admin-field mt-1 w-full max-w-xs rounded-lg border border-white/10 px-3 py-2 text-sm"
        />
      </label>

      {state.error ? <p className="text-xs text-rose-300">{state.error}</p> : null}
      {state.ok ? (
        <p className="text-xs text-emerald-300">
          Check-in updated. Rent due day is now the {state.billingDay}
          {state.billingDay === 1 ? 'st' : state.billingDay === 2 ? 'nd' : state.billingDay === 3 ? 'rd' : 'th'} of
          each month
          {state.invoicesUpdated ? ` (${state.invoicesUpdated} open bill(s) adjusted).` : '.'}
        </p>
      ) : null}

      <AdminConfirmSubmit
        formId={formId}
        title="Update check-in date?"
        description="This changes billing pro-ration and due dates for unpaid rent bills. Paid bills are not changed."
        confirmLabel="Update check-in"
        pending={pending}
        className="rounded-lg border border-white/15 px-4 py-2 text-sm font-semibold text-white hover:bg-white/5 disabled:opacity-60"
      >
        {pending ? 'Saving…' : 'Save check-in date'}
      </AdminConfirmSubmit>
    </form>
  );
}
