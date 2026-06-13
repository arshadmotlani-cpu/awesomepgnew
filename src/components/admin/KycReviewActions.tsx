'use client';

import { useActionState, useId } from 'react';
import { AdminConfirmSubmit } from '@/src/components/admin/AdminConfirmSubmit';
import {
  approveKycAction,
  rejectKycAction,
  type KycReviewActionState,
} from '@/app/(admin)/admin/residents/kyc/actions';

const INITIAL: KycReviewActionState = { status: 'idle' };

const SURFACE = 'rounded-2xl border border-white/10 bg-[#1A1F27]';

export function KycReviewActions({ submissionId }: { submissionId: string }) {
  const approveFormId = useId().replace(/:/g, '');
  const rejectFormId = useId().replace(/:/g, '');

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
    <div className={`${SURFACE} space-y-4 p-5`}>
      <h3 className="text-sm font-semibold uppercase tracking-wide text-apg-orange">
        Verify &amp; decide
      </h3>
      <p className="text-sm text-apg-silver">
        Check photos match the resident. Approve to clear them for check-in.
      </p>

      <form id={approveFormId} action={approveAction}>
        <input type="hidden" name="submissionId" value={submissionId} />
        <AdminConfirmSubmit
          formId={approveFormId}
          title="Approve KYC?"
          description="The resident can check in with verified identity. Make sure documents are clear and match their profile."
          confirmLabel="Approve"
          pending={approvePending}
          disabled={rejectPending}
          className="w-full rounded-lg bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
        >
          {approvePending ? 'Approving…' : 'Approve KYC'}
        </AdminConfirmSubmit>
      </form>

      <form id={rejectFormId} action={rejectAction} className="space-y-2 border-t border-white/10 pt-4">
        <input type="hidden" name="submissionId" value={submissionId} />
        <label className="block text-xs font-medium text-apg-silver">
          Rejection reason
          <textarea
            name="reason"
            rows={2}
            required
            placeholder="e.g. Aadhaar number not visible"
            className="apg-admin-field mt-1 w-full rounded-lg border border-white/10 bg-[#12161C] px-3 py-2 text-sm text-white"
          />
        </label>
        <AdminConfirmSubmit
          formId={rejectFormId}
          title="Reject KYC?"
          description="The resident will need to re-upload documents."
          confirmLabel="Reject"
          tone="danger"
          pending={rejectPending}
          disabled={approvePending}
          className="w-full rounded-lg bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-500 disabled:opacity-50"
        >
          {rejectPending ? 'Rejecting…' : 'Reject KYC'}
        </AdminConfirmSubmit>
      </form>

      {feedback ? (
        <p
          className={`text-sm ${
            feedback.status === 'ok' ? 'text-emerald-300' : 'text-rose-300'
          }`}
        >
          {feedback.message}
        </p>
      ) : null}
    </div>
  );
}
