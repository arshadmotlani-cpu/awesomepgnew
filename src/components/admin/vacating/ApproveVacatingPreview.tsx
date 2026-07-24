'use client';

import { AdminReviewSettlementScan } from '@/src/components/admin/vacating/AdminReviewSettlementScan';
import { formatDate } from '@/src/lib/format';
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
        {formatDate(preview.moveOutDate)}. The tenant stays until then. Checkout settlement is created when
        the resident submits refund details.
      </p>
    </div>
  );
}
