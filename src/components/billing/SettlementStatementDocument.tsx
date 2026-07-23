'use client';

import { formatDate, paiseToInr } from '@/src/lib/format';
import {
  FinancialDocumentCollapsibleSection,
  FinancialDocumentDisclaimer,
  FinancialDocumentHeader,
  FinancialDocumentHeroGrid,
  FinancialDocumentMetaGrid,
  FinancialDocumentRowList,
  FinancialDocumentSectionHeading,
  FinancialDocumentShell,
  FinancialDocumentTotals,
} from '@/src/components/billing/FinancialDocumentLayout';
import {
  dividerClass,
  mutedClass,
  type FinancialDocumentSurface,
} from '@/src/lib/billing/financialDocumentTheme';
import {
  modeBadge,
  type SettlementStatementDocumentModel,
} from '@/src/lib/vacating/settlementStatementModel';

type Props = {
  document: SettlementStatementDocumentModel;
  surface?: FinancialDocumentSurface;
  /** @deprecated use surface */
  variant?: 'admin' | 'resident';
  embed?: 'page' | 'modal';
  className?: string;
};

function resolveSurface(props: Props): FinancialDocumentSurface {
  if (props.surface) return props.surface;
  if (props.variant === 'resident') return 'resident';
  if (props.embed === 'modal') return 'adminModal';
  return 'adminPage';
}

export function SettlementStatementDocument({
  document: doc,
  surface: surfaceProp,
  variant,
  embed = 'page',
  className = '',
}: Props) {
  const surface = surfaceProp ?? (variant === 'resident' ? 'resident' : embed === 'modal' ? 'adminModal' : 'adminPage');
  const muted = mutedClass(surface);
  const compact = embed === 'modal';

  const badge = (
    <span
      className={
        'inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase ring-1 ' +
        (surface === 'adminPage'
          ? 'bg-amber-500/15 text-amber-100 ring-amber-400/40 print:bg-amber-100 print:text-amber-900'
          : 'bg-amber-100 text-amber-900 ring-amber-300')
      }
    >
      {modeBadge(doc.mode)}
    </span>
  );

  const totalRows = [
    ...(doc.estimatedUnusedRentCreditPaise > 0
      ? [
          {
            label: 'Unused rent credit',
            value: paiseToInr(doc.estimatedUnusedRentCreditPaise),
            tone: 'muted' as const,
          },
        ]
      : []),
    {
      label: doc.refundTotalLabel,
      value: paiseToInr(doc.estimatedRefundPaise),
      tone: 'bold' as const,
    },
  ];

  return (
    <FinancialDocumentShell
      surface={surface}
      ariaLabel={doc.modeLabel}
      padding={compact ? 'compact' : 'default'}
      className={`flex flex-col ${compact ? 'min-h-0' : ''} ${className}`}
    >
      <FinancialDocumentHeader
        surface={surface}
        letterhead={doc.letterhead}
        docTitle={doc.modeLabel}
        docNumber={doc.statementNumber}
        issuedAt={doc.issuedAt}
        badge={badge}
      />

      <FinancialDocumentMetaGrid
        surface={surface}
        left={{
          title: 'Resident',
          children: (
            <>
              <p className="font-semibold">{doc.customerName}</p>
              <p className={`text-xs ${muted}`}>{doc.customerPhone}</p>
              <p className={`mt-2 text-xs ${muted}`}>
                {[doc.roomNumber ? `Room ${doc.roomNumber}` : null, doc.bedCode ? `Bed ${doc.bedCode}` : null]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              <p className={`text-xs ${muted}`}>Booking {doc.bookingCode}</p>
            </>
          ),
        }}
        right={{
          title: 'Move-out',
          children: (
            <dl className={`space-y-1 text-xs ${muted}`}>
              <div className="flex justify-between gap-4">
                <dt>Notice given</dt>
                <dd>{formatDate(doc.noticeGivenDate)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt>Leaving date</dt>
                <dd>{formatDate(doc.vacatingDate)}</dd>
              </div>
            </dl>
          ),
        }}
      />

      <FinancialDocumentHeroGrid surface={surface} metrics={doc.heroMetrics} />

      <section className={`mt-4 border-b pb-4 ${dividerClass(surface)}`}>
        <FinancialDocumentSectionHeading surface={surface} title={doc.rentSummary.title} className="mb-3" />
        <FinancialDocumentRowList surface={surface} rows={doc.rentSummary.rows} />
      </section>

      <div className={`${compact ? 'min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain pr-1' : 'mt-4 space-y-2'}`}>
        {doc.collapsedSections.map((section) => (
          <FinancialDocumentCollapsibleSection key={section.id} surface={surface} title={section.title}>
            <FinancialDocumentRowList surface={surface} rows={section.rows} />
          </FinancialDocumentCollapsibleSection>
        ))}

        {doc.auditTrace.length > 0 ? (
          <FinancialDocumentCollapsibleSection surface={surface} title="Audit / engine trace">
            <FinancialDocumentRowList
              surface={surface}
              rows={doc.auditTrace.map((row) => ({ ...row, hint: null, deduct: false }))}
            />
          </FinancialDocumentCollapsibleSection>
        ) : null}
      </div>

      <div className={compact ? 'mt-auto shrink-0 border-t pt-3' : ''}>
        <FinancialDocumentTotals surface={surface} rows={totalRows} className={compact ? 'mt-2' : ''} />
        <FinancialDocumentDisclaimer surface={surface}>{doc.disclaimer}</FinancialDocumentDisclaimer>
      </div>
    </FinancialDocumentShell>
  );
}
