'use client';

import { SettlementStatementDocument } from '@/src/components/billing/SettlementStatementDocument';
import type { SettlementStatementDocumentModel } from '@/src/lib/vacating/settlementStatementModel';

export function ResidentSettlementDetailedBreakdown({
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
