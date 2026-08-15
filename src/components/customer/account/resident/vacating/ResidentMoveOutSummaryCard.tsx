'use client';

import { ApgCard } from '@/src/components/customer/design-system';
import { formatDate } from '@/src/lib/format';
import { VACATING_NOTICE_MIN_DAYS } from '@/src/services/billing';
import { formatFinalStayDateLabel } from '@/src/lib/vacating/vacatingBedSemantics';

function statusLabel(status: string): string {
  if (status === 'approved') return 'Approved';
  if (status === 'pending') return 'Pending approval';
  if (status === 'completed') return 'Completed';
  if (status === 'rejected') return 'Not approved';
  return status.replace(/_/g, ' ');
}

export function ResidentMoveOutSummaryCard({
  vacatingDate,
  noticeGivenDate,
  vacatingStatus,
  roomLabel,
  bookingCode,
}: {
  vacatingDate: string;
  noticeGivenDate: string | null;
  vacatingStatus: string;
  roomLabel: string;
  bookingCode: string;
}) {
  return (
    <ApgCard tier="resident" className="space-y-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-apg-orange">Move-out</p>
        <h1 className="mt-1 text-lg font-semibold text-white">Your move-out</h1>
        <p className="mt-1 text-xs text-apg-silver">{roomLabel} · Booking {bookingCode}</p>
      </div>
      <dl className="space-y-2 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-apg-silver">Current approved final stay date</dt>
          <dd className="font-semibold text-white">{formatFinalStayDateLabel(vacatingDate)}</dd>
        </div>
        {noticeGivenDate ? (
          <div className="flex justify-between gap-3">
            <dt className="text-apg-silver">Notice submitted</dt>
            <dd className="text-white">{formatDate(noticeGivenDate)}</dd>
          </div>
        ) : null}
        <div className="flex justify-between gap-3">
          <dt className="text-apg-silver">Notice period</dt>
          <dd className="text-white">{VACATING_NOTICE_MIN_DAYS} days</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-apg-silver">Status</dt>
          <dd className="font-medium text-white">{statusLabel(vacatingStatus)}</dd>
        </div>
      </dl>
    </ApgCard>
  );
}
