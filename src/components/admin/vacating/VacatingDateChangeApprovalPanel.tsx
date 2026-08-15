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
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-sm font-semibold text-amber-100">Move-out date change</p>
        {bookingContext ? (
          <p className="text-xs text-amber-200/80">
            {bookingContext.customerName} · {bookingContext.bookingCode}
            {bookingContext.roomNumber ? ` · Room ${bookingContext.roomNumber}` : ''}
          </p>
        ) : null}
      </div>
      <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs text-amber-200/70">Current approved stay</dt>
          <dd className="font-medium text-amber-50">{formatDate(String(request.currentVacatingDate))}</dd>
        </div>
        <div>
          <dt className="text-xs text-amber-200/70">Requested stay</dt>
          <dd className="font-medium text-amber-50">{formatDate(String(request.requestedVacatingDate))}</dd>
        </div>
        {request.preview?.noticeGivenDate ? (
          <div>
            <dt className="text-xs text-amber-200/70">Original notice</dt>
            <dd className="font-medium text-amber-50">{formatDate(request.preview.noticeGivenDate)}</dd>
          </div>
        ) : null}
        <div>
          <dt className="text-xs text-amber-200/70">Notice compliance</dt>
          <dd className="font-medium text-amber-50">
            {request.preview?.noticeCompliant ? '✓ 5-day requirement satisfied' : 'Review notice shortfall'}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-amber-200/70">Current electricity</dt>
          <dd className="font-medium text-amber-50">Not yet calculated</dd>
          <p className="text-[11px] text-amber-200/70">Final meter reading required during refund process</p>
        </div>
      </dl>
      {request.preview?.direction === 'later' &&
      (request.preview.additionalStayDays ?? 0) > 0 ? (
        <p className="mt-1 text-xs text-amber-200/80">
          Extension: {request.preview.additionalStayDays} additional days · additional rent{' '}
          {paiseToInr(request.preview.additionalRentPaise ?? 0)}
        </p>
      ) : null}
      {request.preview?.direction === 'earlier' &&
      (request.preview.unusedPrepaidRentPaise ?? 0) > 0 ? (
        <p className="mt-1 text-xs text-amber-200/80">
          Unused prepaid rent if approved: {paiseToInr(request.preview.unusedPrepaidRentPaise ?? 0)}
        </p>
      ) : null}
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
