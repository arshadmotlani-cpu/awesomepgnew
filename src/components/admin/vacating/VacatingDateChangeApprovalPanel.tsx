'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { EstimatedSettlementBreakdown } from '@/src/components/admin/vacating/EstimatedSettlementBreakdown';
import { formatDate, paiseToInr } from '@/src/lib/format';
import type { VacatingDateChangeRequest } from '@/src/db/schema/vacatingDateChangeRequests';
import type { VacatingDateChangePreview } from '@/src/services/vacatingDateChange';
import {
  approveVacatingDateChangeAction,
  rejectVacatingDateChangeAction,
} from '@/app/(admin)/admin/vacating/actions';

export function VacatingDateChangeApprovalPanel({
  request,
}: {
  request: VacatingDateChangeRequest & {
    preview?: VacatingDateChangePreview | null;
  };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const preview = (request.previewSnapshot as VacatingDateChangePreview | null) ?? request.preview;

  return (
    <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 p-4">
      <p className="text-sm font-semibold text-amber-100">Leaving date change — pending approval</p>
      <p className="mt-1 text-sm text-amber-100/90">
        {formatDate(String(request.currentVacatingDate))} →{' '}
        {formatDate(String(request.requestedVacatingDate))}
      </p>
      <p className="mt-1 text-xs text-amber-200/80">
        Refund delta: {paiseToInr(request.refundDeltaPaise)} ({request.refundDeltaPaise >= 0 ? '+' : ''}
        {request.refundDeltaPaise} paise)
      </p>
      {request.residentNotes ? (
        <p className="mt-2 text-xs text-amber-100/80">Resident note: {request.residentNotes}</p>
      ) : null}

      {preview?.requestedEstimatedSettlement ? (
        <div className="mt-4">
          <EstimatedSettlementBreakdown preview={preview.requestedEstimatedSettlement} compact />
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending}
          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
          onClick={() =>
            startTransition(async () => {
              await approveVacatingDateChangeAction(request.id);
              router.refresh();
            })
          }
        >
          Approve date change
        </button>
        <button
          type="button"
          disabled={pending}
          className="rounded-lg border border-rose-400/40 px-3 py-1.5 text-xs font-semibold text-rose-200 hover:bg-rose-500/10 disabled:opacity-50"
          onClick={() =>
            startTransition(async () => {
              await rejectVacatingDateChangeAction(request.id);
              router.refresh();
            })
          }
        >
          Reject
        </button>
      </div>
    </div>
  );
}
