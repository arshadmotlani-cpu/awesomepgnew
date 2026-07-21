'use client';

import type { ReactNode } from 'react';
import { NoticeSettlementPanel } from '@/src/components/shared/NoticeDeductionBreakdown';
import { formatDate, paiseToInr } from '@/src/lib/format';
import type { VacatingApprovalPreview } from '@/src/lib/vacating/approvalPreview';

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid grid-cols-[9rem_1fr] gap-x-3 gap-y-0.5 text-sm">
      <span className="text-apg-silver">{label}</span>
      <span className="font-medium text-white">{value}</span>
    </div>
  );
}

export function ApproveVacatingPreview({ preview }: { preview: VacatingApprovalPreview }) {
  const noticeShort =
    preview.noticeCompletedDays < preview.noticeRequiredDays;

  return (
    <div className="space-y-4">
      <div className="space-y-2 rounded-2xl border border-white/10 bg-[#1A1F27] p-4">
        <DetailRow label="Resident" value={preview.residentName} />
        <DetailRow label="PG" value={preview.pgName} />
        <DetailRow label="Room" value={`${preview.roomNumber} · ${preview.bedCode}`} />
        <DetailRow label="Notice submitted" value={formatDate(preview.noticeSubmittedDate)} />
        <DetailRow label="Move-out requested" value={formatDate(preview.moveOutDate)} />
        <DetailRow
          label="Notice period"
          value={`${preview.noticeCompletedDays} days (required ${preview.noticeRequiredDays})`}
        />
        <DetailRow label="Bed status" value={preview.bedStatus} />
        <DetailRow label="Deposit held" value={paiseToInr(preview.depositHeldPaise)} />
        <DetailRow label="Expected refund" value={paiseToInr(preview.estimatedRefundPaise)} />
      </div>

      {preview.noticeBreakdown ? (
        <NoticeSettlementPanel settlement={preview.noticeBreakdown} variant="admin" />
      ) : noticeShort ? (
        <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm text-amber-100">
          <p className="font-semibold">Notice period shorter than required</p>
          <p className="mt-1 text-xs text-amber-200/90">No deposit deduction — compliant or fully covered.</p>
        </div>
      ) : null}

      <p className="text-xs text-apg-silver">
        After approval the bed opens for website pre-booking from the move-out date. The tenant stays
        until then.
      </p>
    </div>
  );
}
