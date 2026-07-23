'use client';

import { formatDate, paiseToInr } from '@/src/lib/format';
import {
  brandAccentClass,
  dividerClass,
  emphasisTextClass,
  mutedClass,
  shellClasses,
  type FinancialDocumentVariant,
} from '@/src/lib/billing/financialDocumentTheme';
import {
  settlementStatementModeBadge,
  type SettlementStatementDocumentModel,
} from '@/src/lib/vacating/settlementStatementModel';

type Props = {
  document: SettlementStatementDocumentModel;
  variant?: FinancialDocumentVariant;
  embed?: 'page' | 'modal';
  className?: string;
};

function kpiToneClass(
  variant: FinancialDocumentVariant,
  tone: SettlementStatementDocumentModel['summaryKpis'][number]['tone'],
): string {
  if (tone === 'positive') {
    return variant === 'resident' ? 'text-emerald-700' : 'text-emerald-200 print:text-emerald-700';
  }
  if (tone === 'deduct') {
    return variant === 'resident' ? 'text-rose-700' : 'text-rose-200 print:text-rose-700';
  }
  if (tone === 'pending') {
    return variant === 'resident' ? 'text-amber-700 italic' : 'text-amber-200/90 italic print:text-amber-800';
  }
  return emphasisTextClass(variant);
}

function kpiShellClass(variant: FinancialDocumentVariant): string {
  return variant === 'resident'
    ? 'rounded-xl border border-zinc-200 bg-zinc-50 p-3'
    : 'rounded-xl border border-white/10 bg-white/[0.03] p-3 print:border-zinc-200 print:bg-zinc-50';
}

export function SettlementStatementDocument({
  document: doc,
  variant = 'admin',
  embed = 'page',
  className = '',
}: Props) {
  const muted = mutedClass(variant);
  const divider = dividerClass(variant);
  const emphasis = emphasisTextClass(variant);
  const compact = embed === 'modal';

  const sections = Array.from(new Set(doc.lineItems.map((line) => line.section)));

  return (
    <article
      className={`${shellClasses(variant)} ${compact ? 'p-4 sm:p-5' : 'p-6 sm:p-8'} ${className}`}
      aria-label={doc.modeLabel}
    >
      <header className={`flex flex-wrap items-start justify-between gap-4 border-b pb-4 ${divider}`}>
        <div className="min-w-0 space-y-1">
          <p className={`text-lg font-bold tracking-tight ${emphasis}`}>{doc.letterhead.businessName}</p>
          <p className={`text-sm font-medium ${emphasis}`}>{doc.letterhead.pgName}</p>
          {doc.letterhead.addressLines.map((line) => (
            <p key={line} className={`text-xs ${muted}`}>
              {line}
            </p>
          ))}
        </div>
        <div className="text-right">
          <p className={`text-xs font-semibold uppercase tracking-[0.2em] ${brandAccentClass()}`}>
            {doc.modeLabel}
          </p>
          <p className={`mt-2 font-mono text-sm font-semibold ${emphasis}`}>{doc.statementNumber}</p>
          <p className={`mt-1 text-xs ${muted}`}>Issued {doc.issuedAt}</p>
          <span
            className={
              'mt-3 inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase ring-1 ' +
              (variant === 'resident'
                ? 'bg-amber-100 text-amber-900 ring-amber-300'
                : 'bg-amber-500/15 text-amber-100 ring-amber-400/40 print:bg-amber-100 print:text-amber-900')
            }
          >
            {settlementStatementModeBadge(doc.mode)}
          </span>
        </div>
      </header>

      <section className={`mt-4 grid gap-4 border-b pb-4 sm:grid-cols-2 ${divider}`}>
        <div>
          <h2 className={`text-[10px] font-semibold uppercase tracking-wide ${muted}`}>Resident</h2>
          <p className={`mt-2 text-sm font-semibold ${emphasis}`}>{doc.customerName}</p>
          <p className={`text-xs ${muted}`}>{doc.customerPhone}</p>
          <p className={`mt-2 text-xs ${muted}`}>
            {[doc.roomNumber ? `Room ${doc.roomNumber}` : null, doc.bedCode ? `Bed ${doc.bedCode}` : null]
              .filter(Boolean)
              .join(' · ')}
          </p>
          <p className={`text-xs ${muted}`}>Booking {doc.bookingCode}</p>
        </div>
        <div>
          <h2 className={`text-[10px] font-semibold uppercase tracking-wide ${muted}`}>Move-out</h2>
          <dl className={`mt-2 space-y-1 text-xs ${muted}`}>
            <div className="flex justify-between gap-4">
              <dt>Notice given</dt>
              <dd>{formatDate(doc.noticeGivenDate)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>Leaving date</dt>
              <dd>{formatDate(doc.vacatingDate)}</dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="mt-4">
        <h2 className={`text-[10px] font-semibold uppercase tracking-wide ${muted}`}>Summary</h2>
        <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-3">
          {doc.summaryKpis.map((kpi) => (
            <div key={kpi.id} className={kpiShellClass(variant)}>
              <p className={`text-[10px] font-semibold uppercase tracking-wide ${muted}`}>{kpi.label}</p>
              <p className={`mt-1 text-sm font-semibold tabular-nums ${kpiToneClass(variant, kpi.tone)}`}>
                {kpi.value}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section
        className={
          'mt-4 ' +
          (compact ? 'max-h-[min(40vh,320px)] overflow-y-auto overscroll-contain pr-1' : '')
        }
      >
        <h2 className={`text-[10px] font-semibold uppercase tracking-wide ${muted}`}>Calculation detail</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[420px] text-sm">
            <thead>
              <tr className={`border-b text-left text-[10px] uppercase tracking-wide ${divider} ${muted}`}>
                <th className="pb-2 pr-3 font-medium">Item</th>
                <th className="pb-2 pr-3 font-medium">Section</th>
                <th className="pb-2 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {sections.map((section) =>
                doc.lineItems
                  .filter((line) => line.section === section)
                  .map((line, i) => (
                    <tr key={`${section}-${line.label}-${i}`} className={`border-b ${divider}`}>
                      <td className="py-2.5 pr-3">
                        <p className={`font-medium ${emphasis}`}>{line.label}</p>
                        {line.detail ? <p className={`text-xs ${muted}`}>{line.detail}</p> : null}
                      </td>
                      <td className={`py-2.5 pr-3 text-xs ${muted}`}>{line.section}</td>
                      <td
                        className={
                          'py-2.5 text-right tabular-nums font-medium ' +
                          (line.deduct && line.amount.startsWith('−')
                            ? variant === 'resident'
                              ? 'text-rose-700'
                              : 'text-rose-200 print:text-rose-700'
                            : line.amount.includes('Pending')
                              ? variant === 'resident'
                                ? 'text-amber-700 italic'
                                : 'text-amber-200/90 italic print:text-amber-800'
                              : emphasis)
                        }
                      >
                        {line.amount}
                      </td>
                    </tr>
                  )),
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-4 flex justify-end">
        <dl className="w-full max-w-xs space-y-2 text-sm">
          {doc.estimatedUnusedRentCreditPaise > 0 ? (
            <div className="flex justify-between gap-4">
              <dt className={muted}>Unused rent credit</dt>
              <dd className="tabular-nums">{paiseToInr(doc.estimatedUnusedRentCreditPaise)}</dd>
            </div>
          ) : null}
          <div className={`flex justify-between gap-4 border-t pt-2 font-bold ${divider}`}>
            <dt>{doc.mode === 'final' ? 'Final refund' : 'Estimated refund'}</dt>
            <dd
              className={
                'tabular-nums ' +
                (variant === 'resident' ? 'text-emerald-700' : 'text-emerald-200 print:text-emerald-700')
              }
            >
              {paiseToInr(doc.estimatedRefundPaise)}
            </dd>
          </div>
        </dl>
      </section>

      <footer
        className={
          'mt-4 rounded-xl border px-3 py-2 text-xs ' +
          (variant === 'resident'
            ? 'border-amber-200 bg-amber-50 text-amber-950'
            : 'border-amber-400/25 bg-amber-500/[0.08] text-amber-100 print:border-amber-200 print:bg-amber-50 print:text-amber-950')
        }
      >
        {doc.disclaimer}
      </footer>
    </article>
  );
}
