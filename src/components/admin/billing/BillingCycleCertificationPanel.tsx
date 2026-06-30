import Link from 'next/link';
import { paiseToInr } from '@/src/lib/format';
import type { BillingCycleReconciliation } from '@/src/services/billingCycleReconciliation';

/** Billing cycle certification on Billing Centre — never blocks the rest of the page. */
export function BillingCycleCertificationPanel({
  reconciliation,
  error,
  compact,
}: {
  reconciliation?: BillingCycleReconciliation | null;
  error?: string | null;
  compact?: boolean;
}) {
  if (error) {
    return (
      <section className="mb-8 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-6">
        <p className="text-lg font-semibold text-amber-100">Billing certification unavailable</p>
        <p className="mt-2 text-sm text-amber-200/90">{error}</p>
        <p className="mt-3 text-xs text-apg-silver">
          Collections, invoices, and Operations continue to work. Retry from this page after fixing
          the underlying data issue.
        </p>
      </section>
    );
  }

  if (!reconciliation) return null;

  const m = reconciliation.metrics;
  const month = reconciliation.billingMonth.slice(0, 7);
  const tab = (id: string) => `/admin/billing?tab=${id}&month=${month}`;
  const success = reconciliation.status === 'success';

  return (
    <section
      className={
        success
          ? 'mb-8 rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-6'
          : 'mb-8 rounded-2xl border border-rose-500/40 bg-rose-500/10 p-6'
      }
    >
      <header className="mb-4">
        <p
          className={
            success
              ? 'text-lg font-semibold text-emerald-100'
              : 'text-lg font-semibold text-rose-100'
          }
        >
          {reconciliation.headline}
        </p>
        <p className="mt-1 text-sm text-apg-silver">
          {reconciliation.monthLabel} · verified automatically from live invoice data
        </p>
      </header>

      {!success ? (
        <div className="mb-5 rounded-xl border border-rose-400/30 bg-rose-950/30 p-4">
          <p className="text-sm font-medium text-rose-100">What needs attention</p>
          <ul className="mt-2 space-y-1 text-sm text-rose-50/90">
            {reconciliation.failures.map((line) => (
              <li key={line}>• {line}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Residents billed · Rent" value={String(m.rentResidentsBilled)} href={tab('rent')} />
        <Metric
          label="Residents billed · Electricity"
          value={String(m.electricityResidentsBilled)}
          href={tab('electricity')}
        />
        <Metric label="Residents skipped" value={String(m.residentsSkipped)} href={tab('dashboard')} />
        <Metric label="Total billed" value={paiseToInr(m.totalBilledPaise)} href={tab('rent')} />
        <Metric label="Total collected" value={paiseToInr(m.totalCollectedPaise)} href={tab('paid')} tone="success" />
        <Metric label="Outstanding" value={paiseToInr(m.totalOutstandingPaise)} href={tab('billing')} tone="warn" />
        <Metric label="Collection %" value={`${m.collectionPct}%`} href={tab('dashboard')} />
        <Metric
          label="Failed invoices"
          value={String(m.failedInvoices)}
          href={tab('failures')}
          tone={m.failedInvoices > 0 ? 'warn' : 'default'}
        />
        <Metric
          label="Duplicate groups"
          value={String(m.duplicateInvoiceGroups)}
          href="/admin/electricity/duplicates"
          tone={m.duplicateInvoiceGroups > 0 ? 'warn' : 'default'}
        />
        {!compact ? (
          <>
            <Metric label="Rent waiting payment" value={String(m.rentWaitingPayment)} href={tab('rent')} />
            <Metric
              label="Electricity waiting payment"
              value={String(m.electricityWaitingPayment)}
              href={tab('electricity')}
            />
            <Metric
              label="Waiting admin review"
              value={String(m.waitingAdminReview)}
              href={tab('approvals')}
              tone={m.waitingAdminReview > 0 ? 'warn' : 'default'}
            />
            <Metric
              label="Overdue invoices"
              value={String(m.overdueInvoices)}
              href={tab('billing')}
              tone={m.overdueInvoices > 0 ? 'warn' : 'default'}
            />
          </>
        ) : null}
      </dl>

      {!compact ? (
        <details className="mt-5">
          <summary className="cursor-pointer text-sm font-medium text-apg-silver hover:text-white">
            Reconciliation checks ({reconciliation.checks.filter((c) => c.pass).length}/
            {reconciliation.checks.length} passed)
          </summary>
          <ul className="mt-3 space-y-2">
            {reconciliation.checks.map((check) => (
              <li
                key={check.id}
                className="flex items-start gap-2 rounded-lg border border-white/10 bg-[#141820] px-3 py-2 text-sm"
              >
                <span className={check.pass ? 'text-emerald-400' : 'text-rose-400'}>
                  {check.pass ? '✓' : '✗'}
                </span>
                <span>
                  <span className="font-medium text-white">{check.label}</span>
                  <span className="mt-0.5 block text-apg-silver">{check.detail}</span>
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}

function Metric({
  label,
  value,
  href,
  tone = 'default',
}: {
  label: string;
  value: string;
  href: string;
  tone?: 'default' | 'warn' | 'success';
}) {
  const valueClass =
    tone === 'warn' ? 'text-amber-300' : tone === 'success' ? 'text-emerald-300' : 'text-white';

  return (
    <Link href={href} className="rounded-xl border border-white/10 bg-[#1A1F27]/80 p-4 transition hover:border-[#FF5A1F]/40">
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-apg-silver">{label}</dt>
      <dd className={`mt-2 text-xl font-bold tabular-nums ${valueClass}`}>{value}</dd>
    </Link>
  );
}
