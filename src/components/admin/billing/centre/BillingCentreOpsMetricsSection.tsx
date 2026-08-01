'use client';

import Link from 'next/link';
import type { BillingOperationsSnapshot } from '@/src/lib/admin/billingOperationsPresentation';
import { paiseToInr } from '@/src/lib/format';

function Metric({
  label,
  value,
  sub,
  href,
  tone = 'default',
}: {
  label: string;
  value: string;
  sub?: string;
  href?: string;
  tone?: 'default' | 'warn' | 'success';
}) {
  const valueClass =
    tone === 'warn' ? 'text-rose-300' : tone === 'success' ? 'text-emerald-300' : 'text-white';
  const content = (
    <div className="min-w-0 rounded-lg border border-white/10 bg-[#12161C]/80 px-3 py-2">
      <p className="truncate text-[10px] font-semibold uppercase tracking-wide text-apg-silver">
        {label}
      </p>
      <p className={`mt-1 text-lg font-bold tabular-nums ${valueClass}`}>{value}</p>
      {sub ? <p className="truncate text-[10px] text-apg-silver">{sub}</p> : null}
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block transition hover:opacity-90">
        {content}
      </Link>
    );
  }
  return content;
}

export function BillingCentreOpsMetricsSection({
  kpis,
}: {
  kpis: BillingOperationsSnapshot['kpis'];
}) {
  return (
    <section id="ops-metrics">
      <header className="mb-3">
        <h2 className="text-sm font-semibold text-white">Operations metrics</h2>
        <p className="mt-0.5 text-xs text-apg-silver">Billing cycle KPIs from today&apos;s run.</p>
      </header>
      <dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Metric label="Bills today" value={String(kpis.billsGeneratingToday)} />
        <Metric label="Bills this week" value={String(kpis.billsGeneratingThisWeek)} />
        <Metric
          label="Pending"
          value={paiseToInr(kpis.pendingCollectionsPaise)}
          sub={`${kpis.pendingCollectionsCount} invoices`}
          tone={kpis.pendingCollectionsCount > 0 ? 'warn' : 'default'}
          href="/admin/billing?tab=billing"
        />
        <Metric
          label="Overdue"
          value={paiseToInr(kpis.overdueCollectionsPaise)}
          sub={`${kpis.overdueCollectionsCount} invoices`}
          tone={kpis.overdueCollectionsCount > 0 ? 'warn' : 'default'}
          href="/admin/billing?tab=rent"
        />
        <Metric
          label="Collected today"
          value={paiseToInr(kpis.collectedTodayPaise)}
          sub={`${kpis.collectedTodayCount} payments`}
          tone="success"
        />
        <Metric
          label="Collected this month"
          value={paiseToInr(kpis.collectedThisMonthPaise)}
          sub={`${kpis.collectedThisMonthCount} payments`}
          tone="success"
        />
      </dl>
    </section>
  );
}
