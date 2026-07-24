'use client';

import {
  FinancialDocumentCollapsibleSection,
  FinancialDocumentRowList,
  FinancialDocumentSectionHeading,
} from '@/src/components/billing/FinancialDocumentLayout';
import type { SettlementStatementDocumentModel } from '@/src/lib/vacating/settlementStatementModel';

export function ResidentSettlementDetailedBreakdown({
  document,
  className = '',
}: {
  document: SettlementStatementDocumentModel;
  className?: string;
}) {
  const surface = 'resident' as const;

  return (
    <div className={`space-y-2 ${className}`}>
      <section>
        <FinancialDocumentSectionHeading
          surface={surface}
          title={document.rentSummary.title}
          className="mb-3"
        />
        <FinancialDocumentRowList surface={surface} rows={document.rentSummary.rows} />
      </section>

      {document.collapsedSections.map((section) => (
        <FinancialDocumentCollapsibleSection
          key={section.id}
          surface={surface}
          title={section.title}
        >
          <FinancialDocumentRowList surface={surface} rows={section.rows} />
        </FinancialDocumentCollapsibleSection>
      ))}

      {document.auditTrace.length > 0 ? (
        <FinancialDocumentCollapsibleSection surface={surface} title="Audit / engine trace">
          <FinancialDocumentRowList
            surface={surface}
            rows={document.auditTrace.map((row) => ({ ...row, hint: null, deduct: false }))}
          />
        </FinancialDocumentCollapsibleSection>
      ) : null}
    </div>
  );
}
