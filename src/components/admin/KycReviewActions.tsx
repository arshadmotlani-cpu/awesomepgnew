'use client';

import { useActionState } from 'react';
import {
  approveKycAction,
  rejectKycAction,
  type KycReviewActionState,
} from '@/app/(admin)/admin/kyc/actions';

const INITIAL: KycReviewActionState = { status: 'idle' };

export function KycReviewActions({ submissionId }: { submissionId: string }) {
  const [approveState, approveAction, approvePending] = useActionState(
    approveKycAction,
    INITIAL,
  );
  const [rejectState, rejectAction, rejectPending] = useActionState(
    rejectKycAction,
    INITIAL,
  );

  const feedback =
    approveState.status === 'ok'
      ? approveState
      : rejectState.status === 'ok'
        ? rejectState
        : approveState.status === 'error'
          ? approveState
          : rejectState.status === 'error'
            ? rejectState
            : null;

  return (
    <div className="space-y-4 rounded-lg border border-zinc-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-zinc-900">Review decision</h3>

      <form action={approveAction} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="submissionId" value={submissionId} />
        <button
          type="submit"
          disabled={approvePending || rejectPending}
          className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
        >
          {approvePending ? 'Approving…' : 'Approve KYC'}
        </button>
      </form>

      <form action={rejectAction} className="space-y-2">
        <input type="hidden" name="submissionId" value={submissionId} />
        <label className="block text-xs font-medium text-zinc-600">
          Rejection reason
          <textarea
            name="reason"
            rows={2}
            placeholder="e.g. Aadhaar number not visible"
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900"
          />
        </label>
        <button
          type="submit"
          disabled={approvePending || rejectPending}
          className="rounded-md bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-500 disabled:opacity-50"
        >
          {rejectPending ? 'Rejecting…' : 'Reject KYC'}
        </button>
      </form>

      {feedback ? (
        <p
          className={`text-sm ${
            feedback.status === 'ok' ? 'text-emerald-700' : 'text-rose-700'
          }`}
        >
          {feedback.message}
        </p>
      ) : null}
    </div>
  );
}
