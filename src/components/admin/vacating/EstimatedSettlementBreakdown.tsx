'use client';

import type { EstimatedSettlementPreview } from '@/src/lib/vacating/estimatedSettlementPreview';
import { SettlementStatementDocument } from '@/src/components/billing/SettlementStatementDocument';
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

  return (
    <SettlementStatementDocument
      document={document}
      variant="admin"
      embed={compact ? 'modal' : 'page'}
      className={className}
    />
  );
}
