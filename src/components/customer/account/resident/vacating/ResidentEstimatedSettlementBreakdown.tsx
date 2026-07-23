'use client';

import { SettlementStatementDocument } from '@/src/components/billing/SettlementStatementDocument';
import { buildFallbackPgLetterhead } from '@/src/lib/billing/pgLetterheadFallback';
import type { EstimatedSettlementPreview } from '@/src/lib/vacating/estimatedSettlementPreview';
import { buildSettlementStatementModel } from '@/src/lib/vacating/settlementStatementModel';

export type ResidentSettlementStatementContext = {
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

export function ResidentEstimatedSettlementBreakdown({
  preview,
  context,
  className = '',
}: {
  preview: EstimatedSettlementPreview;
  context: ResidentSettlementStatementContext;
  className?: string;
}) {
  const document = buildSettlementStatementModel({
    preview,
    vacatingRequestId: context.vacatingRequestId,
    bookingId: context.bookingId,
    customerName: context.customerName,
    customerPhone: context.customerPhone ?? '—',
    bookingCode: context.bookingCode,
    pgName: context.pgName,
    roomNumber: context.roomNumber,
    bedCode: context.bedCode,
    noticeGivenDate: context.noticeGivenDate,
    vacatingDate: context.vacatingDate,
    letterhead: buildFallbackPgLetterhead(context.pgName),
  });

  return (
    <SettlementStatementDocument
      document={document}
      surface="resident"
      embed="page"
      className={className}
    />
  );
}
