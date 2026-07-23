'use client';

import type { ReactNode } from 'react';
import type { InvoiceDocumentLetterhead } from '@/src/lib/billing/invoiceDocumentModel';
import {
  amountDeductClass,
  amountPendingClass,
  amountPositiveClass,
  brandAccentClass,
  collapsibleShellClass,
  disclaimerShellClass,
  dividerClass,
  emphasisTextClass,
  heroMetricShellClass,
  mutedClass,
  pgNameClass,
  type FinancialDocumentSurface,
  type FinancialDocumentVariant,
  resolveSurface,
  shellClasses,
} from '@/src/lib/billing/financialDocumentTheme';

type SurfaceProp = {
  surface?: FinancialDocumentSurface;
  /** @deprecated use surface */
  variant?: FinancialDocumentVariant;
};

function useSurface(props: SurfaceProp): FinancialDocumentSurface {
  return resolveSurface(props.surface, props.variant);
}

export function FinancialDocumentShell({
  surface,
  variant,
  className = '',
  padding = 'default',
  ariaLabel,
  children,
}: SurfaceProp & {
  className?: string;
  padding?: 'default' | 'compact' | 'none';
  ariaLabel: string;
  children: ReactNode;
}) {
  const s = useSurface({ surface, variant });
  const pad =
    padding === 'none' ? '' : padding === 'compact' ? 'p-4 sm:p-5' : 'p-6 sm:p-8';

  return (
    <article className={`${shellClasses(s)} ${pad} ${className}`} aria-label={ariaLabel}>
      {children}
    </article>
  );
}

export function FinancialDocumentHeader({
  surface,
  variant,
  letterhead,
  docTitle,
  docNumber,
  issuedAt,
  secondaryDate,
  secondaryDateLabel = 'Due',
  badge,
}: SurfaceProp & {
  letterhead: InvoiceDocumentLetterhead;
  docTitle: string;
  docNumber: string;
  issuedAt: string;
  secondaryDate?: string | null;
  secondaryDateLabel?: string;
  badge?: ReactNode;
}) {
  const s = useSurface({ surface, variant });
  const muted = mutedClass(s);
  const emphasis = emphasisTextClass(s);

  return (
    <header className={`flex flex-wrap items-start justify-between gap-4 border-b pb-6 print:pb-4 ${dividerClass(s)}`}>
      <div className="min-w-0 space-y-1">
        <p className={`text-lg font-bold tracking-tight ${emphasis}`}>{letterhead.businessName}</p>
        <p className={`text-sm font-medium ${pgNameClass(s)}`}>{letterhead.pgName}</p>
        {letterhead.addressLines.map((line) => (
          <p key={line} className={`text-xs ${muted}`}>
            {line}
          </p>
        ))}
        {letterhead.gstin ? (
          <p className={`text-xs ${muted}`}>GSTIN: {letterhead.gstin}</p>
        ) : null}
        {letterhead.contactPhone ? (
          <p className={`text-xs ${muted}`}>Phone: {letterhead.contactPhone}</p>
        ) : null}
        {letterhead.contactEmail ? (
          <p className={`text-xs ${muted}`}>Email: {letterhead.contactEmail}</p>
        ) : null}
      </div>
      <div className="text-right">
        <p className={`text-xs font-semibold uppercase tracking-[0.2em] ${brandAccentClass()}`}>{docTitle}</p>
        <p className={`mt-2 font-mono text-sm font-semibold ${emphasis}`}>{docNumber}</p>
        <p className={`mt-1 text-xs ${muted}`}>Issued {issuedAt}</p>
        {secondaryDate ? (
          <p className={`mt-0.5 text-xs ${muted}`}>
            {secondaryDateLabel} {secondaryDate}
          </p>
        ) : null}
        {badge ? <div className="mt-3">{badge}</div> : null}
      </div>
    </header>
  );
}

export function FinancialDocumentMetaGrid({
  surface,
  variant,
  left,
  right,
}: SurfaceProp & {
  left: { title: string; children: ReactNode };
  right?: { title: string; children: ReactNode } | null;
}) {
  const s = useSurface({ surface, variant });
  const muted = mutedClass(s);
  const emphasis = emphasisTextClass(s);

  return (
    <section className={`mt-6 grid gap-6 border-b pb-6 sm:grid-cols-2 ${dividerClass(s)}`}>
      <div>
        <h2 className={`text-[10px] font-semibold uppercase tracking-wide ${muted}`}>{left.title}</h2>
        <div className={`mt-2 text-sm ${emphasis}`}>{left.children}</div>
      </div>
      {right ? (
        <div>
          <h2 className={`text-[10px] font-semibold uppercase tracking-wide ${muted}`}>{right.title}</h2>
          <div className={`mt-2 text-sm ${emphasis}`}>{right.children}</div>
        </div>
      ) : null}
    </section>
  );
}

export type FinancialDocumentLineRow = {
  key: string;
  label: string;
  subtitle?: string | null;
  period?: string | null;
  amount: string;
  deduct?: boolean;
  pending?: boolean;
};

export function FinancialDocumentLineTable({
  surface,
  variant,
  title = 'Line items',
  columns = { primary: 'Description', secondary: 'Period', amount: 'Amount' },
  rows,
  emptyMessage,
}: SurfaceProp & {
  title?: string;
  columns?: { primary: string; secondary: string; amount: string };
  rows: FinancialDocumentLineRow[];
  emptyMessage?: string;
}) {
  const s = useSurface({ surface, variant });
  const muted = mutedClass(s);
  const divider = dividerClass(s);
  const emphasis = emphasisTextClass(s);

  return (
    <section className="mt-6">
      <h2 className={`text-[10px] font-semibold uppercase tracking-wide ${muted}`}>{title}</h2>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[480px] text-sm">
          <thead>
            <tr className={`border-b text-left text-[10px] uppercase tracking-wide ${divider} ${muted}`}>
              <th className="pb-2 pr-4 font-medium">{columns.primary}</th>
              <th className="pb-2 pr-4 font-medium">{columns.secondary}</th>
              <th className="pb-2 text-right font-medium">{columns.amount}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && emptyMessage ? (
              <tr>
                <td colSpan={3} className={`py-4 text-center text-xs ${muted}`}>
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.key} className={`border-b ${divider}`}>
                  <td className="py-3 pr-4">
                    <p className={`font-medium ${emphasis}`}>{row.label}</p>
                    {row.subtitle ? <p className={`text-xs ${muted}`}>{row.subtitle}</p> : null}
                  </td>
                  <td className={`py-3 pr-4 text-xs ${muted}`}>{row.period ?? '—'}</td>
                  <td
                    className={
                      'py-3 text-right tabular-nums font-medium ' +
                      (row.deduct && row.amount.startsWith('−')
                        ? amountDeductClass(s)
                        : row.pending || row.amount.includes('Pending')
                          ? amountPendingClass(s)
                          : emphasis)
                    }
                  >
                    {row.amount}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export type FinancialDocumentTotalRow = {
  label: string;
  value: string;
  tone?: 'default' | 'muted' | 'positive' | 'deduct' | 'accent' | 'bold';
  size?: 'default' | 'sm';
};

export function FinancialDocumentTotals({
  surface,
  variant,
  rows,
  className = '',
}: SurfaceProp & {
  rows: FinancialDocumentTotalRow[];
  className?: string;
}) {
  const s = useSurface({ surface, variant });
  const muted = mutedClass(s);
  const divider = dividerClass(s);
  const emphasis = emphasisTextClass(s);

  function rowClass(tone: FinancialDocumentTotalRow['tone']) {
    if (tone === 'positive') return 'tabular-nums text-emerald-600 print:text-emerald-700';
    if (tone === 'deduct') return 'tabular-nums text-emerald-600';
    if (tone === 'accent') return 'tabular-nums text-[#FF5A1F] print:text-zinc-900';
    if (tone === 'bold') return `tabular-nums font-bold ${amountPositiveClass(s)}`;
    return `tabular-nums ${emphasis}`;
  }

  function labelClass(tone: FinancialDocumentTotalRow['tone']) {
    if (tone === 'bold') return 'font-bold';
    if (tone === 'accent') return 'font-bold';
    if (tone === 'muted') return muted;
    return tone === 'default' ? '' : muted;
  }

  return (
    <section className={`mt-6 flex justify-end ${className}`}>
      <dl className="w-full max-w-xs space-y-2 text-sm">
        {rows.map((row, i) => (
          <div
            key={`${row.label}-${i}`}
            className={
              'flex justify-between gap-4 ' +
              (row.size === 'sm' ? 'text-xs ' : '') +
              (row.tone === 'bold' ? `border-t pt-2 font-semibold ${divider}` : '')
            }
          >
            <dt className={labelClass(row.tone)}>{row.label}</dt>
            <dd className={rowClass(row.tone)}>{row.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function FinancialDocumentDisclaimer({
  surface,
  variant,
  children,
  className = '',
}: SurfaceProp & { children: ReactNode; className?: string }) {
  const s = useSurface({ surface, variant });
  return (
    <footer className={`mt-4 rounded-xl border px-3 py-2 text-xs ${disclaimerShellClass(s)} ${className}`}>
      {children}
    </footer>
  );
}

export type FinancialDocumentHeroMetric = {
  id: string;
  label: string;
  value: string;
  tone?: 'default' | 'positive' | 'deduct' | 'pending';
  large?: boolean;
};

export function FinancialDocumentHeroGrid({
  surface,
  variant,
  metrics,
}: SurfaceProp & { metrics: FinancialDocumentHeroMetric[] }) {
  const s = useSurface({ surface, variant });
  const muted = mutedClass(s);
  const emphasis = emphasisTextClass(s);

  function valueClass(tone: FinancialDocumentHeroMetric['tone'], large?: boolean) {
    const size = large ? 'text-xl sm:text-2xl' : 'text-sm';
    if (tone === 'positive') return `${size} font-semibold tabular-nums ${amountPositiveClass(s)}`;
    if (tone === 'deduct') return `${size} font-semibold tabular-nums ${amountDeductClass(s)}`;
    if (tone === 'pending') return `${size} font-semibold tabular-nums ${amountPendingClass(s)}`;
    return `${size} font-semibold tabular-nums ${emphasis}`;
  }

  return (
    <section className="mt-4">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {metrics.map((metric) => (
          <div key={metric.id} className={heroMetricShellClass(s)}>
            <p className={`text-[10px] font-semibold uppercase tracking-wide ${muted}`}>{metric.label}</p>
            <p className={`mt-1 ${valueClass(metric.tone, metric.large)}`}>{metric.value}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

export function FinancialDocumentSectionHeading({
  surface,
  variant,
  title,
  className = '',
}: SurfaceProp & { title: string; className?: string }) {
  const s = useSurface({ surface, variant });
  return (
    <h2 className={`text-[10px] font-semibold uppercase tracking-wide ${mutedClass(s)} ${className}`}>
      {title}
    </h2>
  );
}

export function FinancialDocumentCollapsibleSection({
  surface,
  variant,
  title,
  defaultOpen = false,
  children,
}: SurfaceProp & {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const s = useSurface({ surface, variant });
  const muted = mutedClass(s);
  const emphasis = emphasisTextClass(s);

  return (
    <details open={defaultOpen} className={collapsibleShellClass(s)}>
      <summary
        className={`cursor-pointer list-none px-4 py-3 text-xs font-medium uppercase tracking-wider ${muted} hover:opacity-80 marker:content-none [&::-webkit-details-marker]:hidden`}
      >
        <span className={emphasis}>▶</span> {title}
      </summary>
      <div className={`border-t px-4 py-4 ${dividerClass(s)}`}>{children}</div>
    </details>
  );
}

export function FinancialDocumentRowList({
  surface,
  variant,
  rows,
}: SurfaceProp & {
  rows: Array<{ id: string; label: string; value: string; hint?: string | null; deduct?: boolean }>;
}) {
  const s = useSurface({ surface, variant });
  const muted = mutedClass(s);
  const emphasis = emphasisTextClass(s);

  return (
    <dl className="space-y-2.5">
      {rows.map((row) => (
        <div key={row.id}>
          <div className="flex items-start justify-between gap-3 text-sm">
            <dt className={muted}>{row.label}</dt>
            <dd
              className={
                'font-medium tabular-nums ' +
                (row.deduct && row.value.startsWith('−') ? amountDeductClass(s) : emphasis)
              }
            >
              {row.value}
            </dd>
          </div>
          {row.hint ? <p className={`mt-1 text-[11px] leading-relaxed ${muted}`}>{row.hint}</p> : null}
        </div>
      ))}
    </dl>
  );
}
