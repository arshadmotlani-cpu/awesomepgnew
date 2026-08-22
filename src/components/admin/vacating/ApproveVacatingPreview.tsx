'use client';

import { AdminReviewSettlementScan } from '@/src/components/admin/vacating/AdminReviewSettlementScan';
import { formatDate } from '@/src/lib/format';
import type { VacatingApprovalPreview } from '@/src/lib/vacating/approvalPreview';
import { buildSettlementStatementFromApprovalPreview } from '@/src/lib/vacating/settlementStatementModel';
import { bedAvailableCalendarDate } from '@/src/lib/vacating/vacatingBedSemantics';

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
      <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-xs text-apg-silver">
        <p>
          <span className="font-semibold text-white">Notice for calculation:</span>{' '}
          {formatDate(preview.noticeCalculationDate)}
        </p>
        {preview.noticeSubmittedAt ? (
          <p className="mt-1">
            <span className="font-semibold text-white">Resident submitted:</span>{' '}
            {formatDate(preview.noticeSubmittedAt)}
          </p>
        ) : null}
        {preview.processingDate ? (
          <p className="mt-1">
            <span className="font-semibold text-white">Admin processing:</span>{' '}
            {formatDate(preview.processingDate)}
            {preview.processingDate !== preview.noticeCalculationDate
              ? ' (calculation uses notice date above, not this date)'
              : null}
          </p>
        ) : null}
        <p className="mt-1">
          <span className="font-semibold text-white">Requested move-out:</span>{' '}
          {formatDate(preview.moveOutDate)}
        </p>
      </div>
      {statement ? (
        <AdminReviewSettlementScan
          statement={statement}
          vacatingRequestId={vacatingRequestId}
          noticeCompletedDays={preview.noticeCompletedDays}
          noticeRequiredDays={preview.noticeRequiredDays}
          moveOutDate={preview.moveOutDate}
          estimatedDeductionPaise={preview.estimatedDeductionPaise}
        />
      ) : noticeShort ? (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
          <p className="font-semibold">Notice period shorter than required</p>
          <p className="mt-1 text-xs text-amber-900/80">
            Estimated settlement preview could not be loaded. Refresh and try again before approving.
          </p>
        </div>
      ) : null}

      <p className="text-xs text-zinc-500">
        After approval the bed opens for website pre-booking from{' '}
        {formatDate(bedAvailableCalendarDate(preview.moveOutDate))} at 12:00 AM PG local time. The
        tenant stays through {formatDate(preview.moveOutDate)}. Checkout settlement is created when
        the resident submits refund details.
      </p>
    </div>
  );
}
