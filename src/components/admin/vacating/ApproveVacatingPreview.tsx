'use client';

import Link from 'next/link';
import { SettlementStatementDocument } from '@/src/components/billing/SettlementStatementDocument';
import { settlementStatementPageHref } from '@/src/lib/billing/settlementStatementPdfLinks';
import type { VacatingApprovalPreview } from '@/src/lib/vacating/approvalPreview';
import { buildSettlementStatementFromApprovalPreview } from '@/src/lib/vacating/settlementStatementModel';

export function ApproveVacatingPreview({
  preview,
  vacatingRequestId,
  bookingCode,
  bookingId,
}: {
  preview: VacatingApprovalPreview;
  vacatingRequestId: string;
  bookingCode?: string;
  bookingId?: string;
}) {
  const statement = buildSettlementStatementFromApprovalPreview({
    preview,
    vacatingRequestId,
    bookingCode,
    bookingId,
  });

  const noticeShort = preview.noticeCompletedDays < preview.noticeRequiredDays;

  return (
    <div className="space-y-3">
      {statement ? (
        <>
          <SettlementStatementDocument document={statement} variant="admin" embed="modal" />
          <p className="text-xs text-zinc-500">
            <Link
              href={settlementStatementPageHref(vacatingRequestId)}
              target="_blank"
              className="font-medium text-[#FF5A1F] hover:underline"
            >
              Open full statement
            </Link>
            {' · '}
            Share or download PDF from the statement page.
          </p>
        </>
      ) : preview.noticeBreakdown && noticeShort ? (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
          <p className="font-semibold">Notice period shorter than required</p>
          <p className="mt-1 text-xs text-amber-900/80">
            Estimated settlement preview is unavailable. Review notice details before approving.
          </p>
        </div>
      ) : null}

      <p className="text-xs text-zinc-500">
        After approval the bed opens for website pre-booking from the move-out date. The tenant stays
        until then. Checkout settlement is created when the resident submits refund details.
      </p>
    </div>
  );
}
