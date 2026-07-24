'use client';

import Link from 'next/link';
import type { EstimatedSettlementPreview } from '@/src/lib/vacating/estimatedSettlementPreview';
import { AdminReviewSettlementScan } from '@/src/components/admin/vacating/AdminReviewSettlementScan';
import { SettlementStatementDocument } from '@/src/components/billing/SettlementStatementDocument';
import { settlementStatementPageHref } from '@/src/lib/billing/settlementStatementPdfLinks';
import { buildSettlementStatementModel } from '@/src/lib/vacating/settlementStatementModel';
import { buildFallbackPgLetterhead } from '@/src/lib/billing/pgLetterheadFallback';

/** @deprecated Use SettlementStatementDocument directly. */
export function EstimatedSettlementBreakdown({
  preview,
  compact = false,
  className = '',
  vacatingRequestId,
  bookingId,
  customerName,
  customerPhone,
  bookingCode,
  pgName,
  roomNumber,
  bedCode,
  noticeGivenDate,
  vacatingDate,
  noticeCompletedDays,
  noticeRequiredDays,
}: {
  preview: EstimatedSettlementPreview;
  compact?: boolean;
  className?: string;
  vacatingRequestId?: string;
  bookingId?: string;
  customerName?: string;
  customerPhone?: string;
  bookingCode?: string;
  pgName?: string;
  roomNumber?: string;
  bedCode?: string;
  noticeGivenDate?: string;
  vacatingDate?: string;
  noticeCompletedDays?: number;
  noticeRequiredDays?: number;
}) {
  if (!vacatingRequestId || !bookingId || !customerName || !pgName) {
    return null;
  }

  const document = buildSettlementStatementModel({
    preview,
    vacatingRequestId,
    bookingId,
    customerName,
    customerPhone: customerPhone ?? '—',
    bookingCode: bookingCode ?? '—',
    pgName,
    roomNumber: roomNumber ?? '—',
    bedCode: bedCode ?? '—',
    noticeGivenDate: noticeGivenDate ?? '—',
    vacatingDate: vacatingDate ?? '—',
    letterhead: buildFallbackPgLetterhead(pgName),
  });

  if (compact && noticeCompletedDays != null && noticeRequiredDays != null && vacatingDate) {
    return (
      <div className={className}>
        <AdminReviewSettlementScan
          statement={document}
          vacatingRequestId={vacatingRequestId}
          noticeCompletedDays={noticeCompletedDays}
          noticeRequiredDays={noticeRequiredDays}
          moveOutDate={vacatingDate}
        />
      </div>
    );
  }

  return (
    <SettlementStatementDocument
      document={document}
      surface={compact ? 'adminModal' : 'adminPage'}
      audience={compact ? 'adminReview' : 'accountant'}
      embed={compact ? 'modal' : 'page'}
      className={className}
    />
  );
}

export function EstimatedSettlementAccountantLink({
  vacatingRequestId,
  className = 'text-xs text-zinc-500',
}: {
  vacatingRequestId: string;
  className?: string;
}) {
  return (
    <p className={className}>
      <Link
        href={settlementStatementPageHref(vacatingRequestId)}
        target="_blank"
        className="font-medium text-[#FF5A1F] hover:underline"
      >
        Open full statement
      </Link>
    </p>
  );
}
