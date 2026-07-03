'use client';

import Link from 'next/link';
import { operationsFilterHref } from '@/src/lib/operations/operationsFilterLinks';
import { paiseToInr } from '@/src/lib/format';

export type BillingDashboardMetrics = {
  billingMonth: string;
  rentGeneratedToday: number;
  electricityGeneratedToday: number;
  pendingApprovals: number;
  paidTodayCount: number;
  overdueCount: number;
  newestInvoices: Array<{
    id: string;
    residentName: string;
    invoiceNumber: string;
    amountPaise: number;
    status: string;
    kind: 'rent' | 'electricity';
    dateLabel: string;
    href: string;
  }>;
};

function MetricCard({
  label,
  value,
  href,
  tone = 'default',
}: {
  label: string;
  value: string | number;
  href: string;
  tone?: 'default' | 'warn' | 'success';
}) {
  const border =
    tone === 'warn'
      ? 'border-amber-500/40 hover:border-amber-400/60'
      : tone === 'success'
        ? 'border-emerald-500/40 hover:border-emerald-400/60'
        : 'border-white/10 hover:border-[#FF5A1F]/40';

  return (
    <Link
      href={href}
      className={`block rounded-xl border bg-[#1A1F27] p-4 transition ${border}`}
    >
      <p className="text-xs text-apg-silver">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-white">{value}</p>
    </Link>
  );
}

export function BillingOperationsDashboard({ metrics }: { metrics: BillingDashboardMetrics }) {
  const month = metrics.billingMonth.slice(0, 7);
  const tab = (id: string) => `/admin/billing?tab=${id}&month=${month}`;

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Today's auto-generated · Rent"
          value={metrics.rentGeneratedToday}
          href={tab('generated')}
        />
        <MetricCard
          label="Today's auto-generated · Electricity"
          value={metrics.electricityGeneratedToday}
          href={tab('electricity')}
        />
        <MetricCard
          label="Pending approvals"
          value={metrics.pendingApprovals}
          href={operationsFilterHref('waiting_for_approval')}
          tone={metrics.pendingApprovals > 0 ? 'warn' : 'default'}
        />
        <MetricCard
          label="Overdue bills"
          value={metrics.overdueCount}
          href={tab('rent')}
          tone={metrics.overdueCount > 0 ? 'warn' : 'default'}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <MetricCard
          label="Paid today"
          value={metrics.paidTodayCount}
          href={tab('paid')}
          tone="success"
        />
      </div>

      <section>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-white">Newest generated invoices</h2>
          <Link href="/admin/invoices" className="text-xs font-medium text-[#FF5A1F] hover:underline">
            Full invoice history →
          </Link>
        </div>
        {metrics.newestInvoices.length === 0 ? (
          <p className="rounded-xl border border-white/10 bg-[#1A1F27] p-4 text-sm text-apg-silver">
            No invoices generated yet for this period.
          </p>
        ) : (
          <ul className="divide-y divide-white/10 rounded-xl border border-white/10 bg-[#1A1F27]">
            {metrics.newestInvoices.map((row) => (
              <li key={row.id}>
                <Link
                  href={row.href}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 hover:bg-white/[0.03]"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white">{row.residentName}</p>
                    <p className="text-xs text-apg-silver">
                      {row.invoiceNumber} · {row.kind === 'rent' ? 'Rent' : 'Electricity'} ·{' '}
                      {row.dateLabel}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold tabular-nums text-white">
                      {paiseToInr(row.amountPaise)}
                    </p>
                    <p className="text-[11px] uppercase tracking-wide text-apg-silver">
                      {row.status}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
