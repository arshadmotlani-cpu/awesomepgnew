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
import {
  applySettlementPresentationAudience,
  isDecisionAudience,
  resolveSettlementPresentationAudience,
  type SettlementPresentationAudience,
} from '@/src/lib/vacating/settlementPresentationAudience';

type Props = {
  document: SettlementStatementDocumentModel;
  surface?: FinancialDocumentSurface;
  audience?: SettlementPresentationAudience;
  /** @deprecated use surface */
  variant?: 'admin' | 'resident';
  embed?: 'page' | 'modal';
  className?: string;
};

function QuickRefundHero({
  surface,
  label,
  value,
  leavingDate,
}: {
  surface: FinancialDocumentSurface;
  label: string;
  value: string;
  leavingDate: string;
}) {
  const muted = mutedClass(surface);
  const emphasis = surface === 'adminModal' ? 'text-zinc-900' : 'text-emerald-800';
  return (
    <section className="mt-3 rounded-2xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50 to-white px-4 py-5 text-center">
      <p className={`text-[10px] font-semibold uppercase tracking-wide ${muted}`}>{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums sm:text-3xl ${emphasis}`}>{value}</p>
      <p className={`mt-2 text-xs ${muted}`}>
        Leaving <span className="font-medium text-zinc-800">{formatDate(leavingDate)}</span>
      </p>
    </section>
  );
}

export function SettlementStatementDocument({
  document: doc,
  surface: surfaceProp,
  audience: audienceProp,
  variant,
  embed = 'page',
  className = '',
}: Props) {
  const surface =
    surfaceProp ?? (variant === 'resident' ? 'resident' : embed === 'modal' ? 'adminModal' : 'adminPage');
  const audience = resolveSettlementPresentationAudience({ surface, audience: audienceProp });
  const view = applySettlementPresentationAudience(doc, audience);
  const muted = mutedClass(surface);
  const compact = embed === 'modal';
  const decision = isDecisionAudience(audience);
  const primaryHero = view.heroMetrics.find((m) => m.large) ?? view.heroMetrics[0];

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
    ...(view.showUnusedRentCreditFooter && doc.estimatedUnusedRentCreditPaise > 0
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
        badge={decision ? undefined : badge}
      />

      <FinancialDocumentMetaGrid
        surface={surface}
        left={{
          title: 'Resident',
          children: (
            <>
              <p className="font-semibold">{doc.customerName}</p>
              {view.showFullHeaderMeta ? <p className={`text-xs ${muted}`}>{doc.customerPhone}</p> : null}
              {view.showFullHeaderMeta ? (
                <p className={`mt-2 text-xs ${muted}`}>
                  {[doc.roomNumber ? `Room ${doc.roomNumber}` : null, doc.bedCode ? `Bed ${doc.bedCode}` : null]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              ) : null}
              <p className={`text-xs ${muted}`}>{decision ? doc.bookingCode : `Booking ${doc.bookingCode}`}</p>
            </>
          ),
        }}
        right={{
          title: 'Move-out',
          children: decision ? (
            <p className={`text-xs ${muted}`}>Notice {formatDate(doc.noticeGivenDate)}</p>
          ) : (
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

      {view.showDecisionHero && primaryHero ? (
        <QuickRefundHero
          surface={surface}
          label={primaryHero.label}
          value={primaryHero.value}
          leavingDate={doc.vacatingDate}
        />
      ) : view.showHeroGrid ? (
        <FinancialDocumentHeroGrid surface={surface} metrics={doc.heroMetrics} />
      ) : null}

      {decision ? (
        view.affectsRefundSection ? (
          <div
            className={`${compact ? 'min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain pr-1' : 'mt-4 space-y-2'}`}
          >
            <FinancialDocumentCollapsibleSection
              surface={surface}
              title={view.affectsRefundSection.title}
            >
              <FinancialDocumentRowList surface={surface} rows={view.affectsRefundSection.rows} />
            </FinancialDocumentCollapsibleSection>
          </div>
        ) : null
      ) : (
        <>
          <section className={`mt-4 border-b pb-4 ${dividerClass(surface)}`}>
            <FinancialDocumentSectionHeading surface={surface} title={doc.rentSummary.title} className="mb-3" />
            <FinancialDocumentRowList surface={surface} rows={doc.rentSummary.rows} />
          </section>

          <div
            className={`${compact ? 'min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain pr-1' : 'mt-4 space-y-2'}`}
          >
            {doc.collapsedSections.map((section) => (
              <FinancialDocumentCollapsibleSection key={section.id} surface={surface} title={section.title}>
                <FinancialDocumentRowList surface={surface} rows={section.rows} />
              </FinancialDocumentCollapsibleSection>
            ))}

            {view.showExplanations && doc.explanations?.lines.length ? (
              <FinancialDocumentCollapsibleSection surface={surface} title="Why these numbers">
                <ul className={`space-y-4 text-sm ${muted}`}>
                  {doc.explanations.lines.map((line) => (
                    <li key={line.id} className="rounded-lg border border-zinc-200/80 bg-zinc-50/80 p-3">
                      <p className="font-semibold text-zinc-900">
                        {line.label}: {line.valueDisplay}
                      </p>
                      {line.reasonLines.length > 0 ? (
                        <ul className="mt-1 list-inside list-disc text-xs text-zinc-600">
                          {line.reasonLines.map((r) => (
                            <li key={r}>{r}</li>
                          ))}
                        </ul>
                      ) : null}
                      <p className="mt-2 text-xs text-zinc-700">
                        <span className="font-medium">Formula:</span> {line.formula}
                      </p>
                      <p className="mt-1 text-xs text-zinc-600">
                        <span className="font-medium">Rule:</span> {line.businessRule}
                      </p>
                      <p className="mt-1 text-[10px] uppercase tracking-wide text-zinc-500">
                        Source: {line.source} · {line.businessRuleId}
                      </p>
                    </li>
                  ))}
                </ul>
              </FinancialDocumentCollapsibleSection>
            ) : null}

            {view.showAuditTrace && doc.auditTrace.length > 0 ? (
              <FinancialDocumentCollapsibleSection surface={surface} title="Accountant audit trail">
                <FinancialDocumentRowList
                  surface={surface}
                  rows={doc.auditTrace.map((row) => ({ ...row, deduct: false }))}
                />
              </FinancialDocumentCollapsibleSection>
            ) : null}
          </div>
        </>
      )}

      <div className={compact ? 'mt-auto shrink-0 border-t pt-3' : ''}>
        {!decision ? (
          <FinancialDocumentTotals surface={surface} rows={totalRows} className={compact ? 'mt-2' : ''} />
        ) : null}
        <FinancialDocumentDisclaimer surface={surface}>{doc.disclaimer}</FinancialDocumentDisclaimer>
      </div>
    </FinancialDocumentShell>
  );
}
