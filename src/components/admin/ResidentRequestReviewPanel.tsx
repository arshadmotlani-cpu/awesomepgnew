'use client';

import { useActionState } from 'react';
import {
  reviewResidentRequestAction,
  type ReviewRequestState,
} from '@/app/(admin)/admin/requests/actions';
import { paiseToInr, titleCase } from '@/src/lib/format';

export function ResidentRequestReviewPanel({
  request,
}: {
  request: {
    id: string;
    type: string;
    status: string;
    amountPaise: number | null;
    requestedEndDate: string | null;
    customerName: string;
    customerPhone: string;
    customerId: string;
    bookingId: string;
    pgName: string;
    createdAt: Date;
  };
}) {
  const [state, action, pending] = useActionState(reviewResidentRequestAction, {
    ok: false,
  } satisfies ReviewRequestState);

  return (
    <form action={action} className="rounded-2xl border border-white/10 bg-[#1A1F27] p-5">
      <input type="hidden" name="requestId" value={request.id} />
      <h3 className="text-sm font-semibold text-white">
        {request.type === 'deposit_refund' ? 'Deposit refund' : 'Stay extension'} —{' '}
        {request.customerName}
      </h3>
      <p className="mt-1 text-xs text-apg-silver">
        {request.pgName} · {request.customerPhone} · {titleCase(request.status)}
      </p>
      {request.amountPaise ? (
        <p className="mt-2 text-sm text-white">Amount: {paiseToInr(request.amountPaise)}</p>
      ) : null}
      {request.requestedEndDate ? (
        <p className="mt-1 text-sm text-white">Requested until: {request.requestedEndDate}</p>
      ) : null}

      <label className="mt-4 block text-sm">
        <span className="text-apg-silver">Admin notes</span>
        <textarea
          name="adminNotes"
          rows={2}
          className="apg-admin-field mt-1 w-full rounded-lg border border-white/10 bg-[#12161C] px-3 py-2 text-sm text-white"
        />
      </label>

      {state.error ? <p className="mt-2 text-sm text-rose-300">{state.error}</p> : null}

      <div className="mt-4 flex flex-wrap gap-2">
        {request.status === 'submitted' ? (
          <button
            type="submit"
            name="action"
            value="under_review"
            disabled={pending}
            className="rounded-lg border border-white/10 px-3 py-2 text-xs font-medium text-white hover:bg-white/5"
          >
            Mark under review
          </button>
        ) : null}
        {['submitted', 'under_review'].includes(request.status) ? (
          <button
            type="submit"
            name="action"
            value="approve"
            disabled={pending}
            className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-500"
          >
            Approve
          </button>
        ) : null}
        {request.status === 'approved' && request.type === 'deposit_refund' ? (
          <button
            type="submit"
            name="action"
            value="complete"
            disabled={pending}
            className="rounded-lg bg-[#FF5A1F] px-3 py-2 text-xs font-semibold text-white"
          >
            Complete refund
          </button>
        ) : null}
        {!['rejected', 'completed'].includes(request.status) ? (
          <button
            type="submit"
            name="action"
            value="reject"
            disabled={pending}
            className="rounded-lg border border-rose-400/40 px-3 py-2 text-xs font-medium text-rose-300"
          >
            Reject
          </button>
        ) : null}
        <a
          href={`/admin/residents/${request.customerId}`}
          className="rounded-lg border border-white/10 px-3 py-2 text-xs text-apg-silver hover:text-white"
        >
          Resident profile →
        </a>
        <a
          href={`/admin/deposits/${request.bookingId}`}
          className="rounded-lg border border-white/10 px-3 py-2 text-xs text-apg-silver hover:text-white"
        >
          Deposit ledger →
        </a>
      </div>
    </form>
  );
}
