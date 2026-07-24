'use client';

import { SettlementStatementDocument } from '@/src/components/billing/SettlementStatementDocument';
import type { SettlementStatementDocumentModel } from '@/src/lib/vacating/settlementStatementModel';

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
  document,
  className = '',
}: {
  document: SettlementStatementDocumentModel;
  className?: string;
}) {
  return (
    <SettlementStatementDocument
      document={document}
      surface="resident"
      audience="resident"
      embed="page"
      className={className}
    />
  );
}
