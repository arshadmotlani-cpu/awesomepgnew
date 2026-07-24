'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { AdminReviewSettlementScan } from '@/src/components/admin/vacating/AdminReviewSettlementScan';
import { formatDate, paiseToInr } from '@/src/lib/format';
import type { VacatingDateChangeRequest } from '@/src/db/schema/vacatingDateChangeRequests';
import type { VacatingDateChangePreview } from '@/src/services/vacatingDateChange';
import type { SettlementStatementDocumentModel } from '@/src/lib/vacating/settlementStatementModel';
import {
  approveVacatingDateChangeAction,
  rejectVacatingDateChangeAction,
} from '@/app/(admin)/admin/vacating/dateChangeActions';

export type VacatingDateChangeBookingContext = {
  vacatingRequestId: string;
  bookingId: string;
  customerName: string;
  customerPhone?: string;
  bookingCode: string;
  pgName: string;
  roomNumber: string;
  bedCode: string;
  noticeGivenDate: string;
  vacatingDate: string;
};

export function VacatingDateChangeApprovalPanel({
  request,
  bookingContext,
  statementDocument,
}: {
  request: VacatingDateChangeRequest & {
    preview?: VacatingDateChangePreview | null;
  };
  bookingContext?: VacatingDateChangeBookingContext;
  statementDocument?: SettlementStatementDocumentModel | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 p-4">
      <p className="text-sm font-semibold text-amber-100">Leaving date change — pending approval</p>
      <p className="mt-1 text-sm text-amber-100/90">
        {formatDate(String(request.currentVacatingDate))} →{' '}
        {formatDate(String(request.requestedVacatingDate))}
      </p>
      <p className="mt-1 text-xs text-amber-200/80">
        Refund delta: {paiseToInr(request.refundDeltaPaise)}
        {request.refundDeltaPaise >= 0 ? ' (increase)' : ' (decrease)'}
      </p>
      {request.residentNotes ? (
        <p className="mt-2 text-xs text-amber-100/80">Resident note: {request.residentNotes}</p>
      ) : null}

      {statementDocument && bookingContext ? (
        <div className="mt-4">
          <AdminReviewSettlementScan
            statement={statementDocument}
            vacatingRequestId={bookingContext.vacatingRequestId}
            moveOutDate={bookingContext.vacatingDate}
            noticeLine={
              request.preview
                ? request.preview.noticeCompliant
                  ? 'Notice period met for requested date'
                  : 'Notice may be short for requested date — review full statement before approving'
                : undefined
            }
            tone="amber"
            linkClassName="font-medium text-amber-100 hover:underline"
          />
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
