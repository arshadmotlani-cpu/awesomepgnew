'use client';

import type { ReactNode } from 'react';
import { formatDate, paiseToInr } from '@/src/lib/format';
import type { VacatingApprovalPreview } from '@/src/lib/vacating/approvalPreview';

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid grid-cols-[9rem_1fr] gap-x-3 gap-y-0.5 text-sm">
      <span className="text-zinc-500">{label}</span>
      <span className="font-medium text-zinc-900">{value}</span>
    </div>
  );
}

export function ApproveVacatingPreview({ preview }: { preview: VacatingApprovalPreview }) {
  const noticeShort =
    preview.noticeCompletedDays < preview.noticeRequiredDays;

  return (
    <div className="space-y-4">
      <div className="space-y-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
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
        <DetailRow label="Expected deduction" value={paiseToInr(preview.estimatedDeductionPaise)} />
        <DetailRow label="Expected refund" value={paiseToInr(preview.estimatedRefundPaise)} />
      </div>

      {noticeShort ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
          <p className="font-semibold">Notice period shorter than required</p>
          <dl className="mt-2 space-y-1">
            <div className="flex justify-between gap-4">
              <dt className="text-amber-800">Required notice</dt>
              <dd className="font-medium">{preview.noticeRequiredDays} days</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-amber-800">Actual notice</dt>
              <dd className="font-medium">{preview.noticeCompletedDays} days</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-amber-800">Deduction</dt>
              <dd className="font-semibold">{paiseToInr(preview.estimatedDeductionPaise)}</dd>
            </div>
          </dl>
        </div>
      ) : null}

      <p className="text-xs text-zinc-500">
        After approval the bed opens for website pre-booking from the move-out date. The tenant stays
        until then.
      </p>
    </div>
  );
}
