'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { SettlementStatementDocument } from '@/src/components/billing/SettlementStatementDocument';
import { settlementStatementPageHref } from '@/src/lib/billing/settlementStatementPdfLinks';
import { formatDate, paiseToInr } from '@/src/lib/format';
import type { VacatingDateChangeRequest } from '@/src/db/schema/vacatingDateChangeRequests';
import type { VacatingDateChangePreview } from '@/src/services/vacatingDateChange';
import { buildSettlementStatementModel } from '@/src/lib/vacating/settlementStatementModel';
import { buildFallbackPgLetterhead } from '@/src/lib/billing/pgLetterheadFallback';
import {
  approveVacatingDateChangeAction,
  rejectVacatingDateChangeAction,
} from '@/app/(admin)/admin/vacating/actions';

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
}: {
  request: VacatingDateChangeRequest & {
    preview?: VacatingDateChangePreview | null;
  };
  bookingContext?: VacatingDateChangeBookingContext;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const preview = (request.previewSnapshot as VacatingDateChangePreview | null) ?? request.preview;

  const statementDocument =
    preview?.requestedEstimatedSettlement && bookingContext
      ? buildSettlementStatementModel({
          preview: preview.requestedEstimatedSettlement,
          vacatingRequestId: bookingContext.vacatingRequestId,
          bookingId: bookingContext.bookingId,
          customerName: bookingContext.customerName,
          customerPhone: bookingContext.customerPhone ?? '—',
          bookingCode: bookingContext.bookingCode,
          pgName: bookingContext.pgName,
          roomNumber: bookingContext.roomNumber,
          bedCode: bookingContext.bedCode,
          noticeGivenDate: bookingContext.noticeGivenDate,
          vacatingDate: bookingContext.vacatingDate,
          letterhead: buildFallbackPgLetterhead(bookingContext.pgName),
        })
      : null;

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

      {statementDocument ? (
        <div className="mt-4 space-y-2">
          <SettlementStatementDocument document={statementDocument} surface="adminModal" embed="modal" />
          <p className="text-xs text-amber-200/70">
            <Link
              href={settlementStatementPageHref(bookingContext!.vacatingRequestId)}
              target="_blank"
              className="font-medium text-amber-100 hover:underline"
            >
              Open full statement
            </Link>
          </p>
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
