import Link from 'next/link';
import { ModuleBreadcrumbs } from '@/src/components/admin/ModuleBreadcrumbs';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { requireAdminSession } from '@/src/lib/auth/guards';
import { adminHasPermission } from '@/src/lib/auth/roles';
import { isCollectionsV1Enabled } from '@/src/lib/collections/featureFlag';
import { paiseToInr } from '@/src/lib/format';
import { loadCollectionsReport } from '@/src/services/collectionsReports';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/** Phase 3.4 reports — KPIs from RFE projections via collectionsReports. */
export default async function CollectionsReportsPage() {
  if (!isCollectionsV1Enabled()) redirect('/admin/billing');
  const session = await requireAdminSession('/admin/collections/reports');
  if (!adminHasPermission(session.role, 'collections:read')) {
    redirect('/admin/overview');
  }

  const report = await loadCollectionsReport({
    session: { role: session.role, pgScope: session.pgScope },
  });

  const cards = [
    { label: 'Expected', value: paiseToInr(report.expectedPaise) },
    { label: 'Collected (today)', value: paiseToInr(report.collectedPaise) },
    { label: 'Outstanding', value: paiseToInr(report.outstandingPaise) },
    { label: 'Overdue', value: paiseToInr(report.overduePaise) },
    {
      label: 'Efficiency',
      value: report.efficiencyPct == null ? '—' : `${report.efficiencyPct}%`,
    },
  ];

  return (
    <>
      <ModuleBreadcrumbs
        items={[
          { label: 'Admin', href: '/admin/overview' },
          { label: 'Collections', href: '/admin/collections' },
          { label: 'Reports' },
        ]}
      />
      <PageHeader
        title="Collection reports"
        description={`Window: ${report.windowLabel} · as of ${report.asOf}. Totals from RFE-projected rows only.`}
        actions={
          <Link
            href="/admin/collections"
            className="inline-flex min-h-[36px] items-center rounded-lg border border-white/15 px-3 text-xs font-medium text-white hover:bg-white/5"
          >
            Back to Collections
          </Link>
        }
      />
      <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {cards.map((c) => (
          <div
            key={c.label}
            className="rounded-xl border border-white/10 bg-[#1A1F27] px-4 py-3"
          >
            <div className="text-[11px] uppercase tracking-wide text-apg-silver">{c.label}</div>
            <div className="mt-1 text-lg font-semibold text-white">{c.value}</div>
          </div>
        ))}
      </div>
    </>
  );
}
