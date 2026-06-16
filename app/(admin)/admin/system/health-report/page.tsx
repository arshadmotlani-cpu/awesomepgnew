import Link from 'next/link';
import { Badge } from '@/src/components/admin/Badge';
import { ModuleBreadcrumbs } from '@/src/components/admin/ModuleBreadcrumbs';
import { OverviewMonthPicker } from '@/src/components/admin/OverviewMonthPicker';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { TBody, TD, TH, THead, TR, Table } from '@/src/components/admin/Table';
import { requireAdminSession } from '@/src/lib/auth/guards';
import { ADMIN_MODULES, moduleHref } from '@/src/lib/admin/navigation';
import { resolveBillingMonth } from '@/src/lib/dateDefaults';
import { runSystemHealthAudit } from '@/src/services/systemHealthAudit';

export const dynamic = 'force-dynamic';
export const maxDuration = 180;

export default async function SystemHealthReportPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const sp = await searchParams;
  const billingMonth = resolveBillingMonth(sp.month);
  const session = await requireAdminSession('/admin/system/health-report');
  const report = await runSystemHealthAudit(session, billingMonth);

  return (
    <>
      <ModuleBreadcrumbs
        items={[
          { label: 'Overview', href: moduleHref('overview', billingMonth) },
          { label: ADMIN_MODULES.system.label, href: moduleHref('system') },
          { label: 'System health report' },
        ]}
      />
      <PageHeader
        title="Final system health report"
        description="Financial, invoice, occupancy, notification, vacating, and SSOT integrity — deploy only when all sections PASS."
        actions={<OverviewMonthPicker billingMonth={billingMonth} />}
      />

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Badge tone={report.allPass ? 'emerald' : 'rose'}>
          {report.allPass ? 'ALL PASS — safe to deploy' : 'FAIL — do not deploy'}
        </Badge>
        <span className="text-xs text-apg-silver">
          Billing month {report.billingMonth} · As of{' '}
          {new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(
            new Date(report.asOf),
          )}
        </span>
      </div>

      <div className="space-y-4">
        {report.sections.map((section) => (
          <section
            key={section.name}
            className="rounded-xl border border-white/10 bg-[#1A1F27] p-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-white">{section.name}</h2>
              <Badge tone={section.pass ? 'emerald' : 'rose'}>
                {section.pass ? 'PASS' : 'FAIL'}
              </Badge>
            </div>
            <p className="mt-1 text-xs text-apg-silver">{section.summary}</p>
            {section.mismatches.length > 0 ? (
              <ul className="mt-3 space-y-1 rounded-lg border border-rose-400/20 bg-rose-500/5 p-3">
                {section.mismatches.map((m, i) => (
                  <li key={i} className="text-xs text-rose-200">
                    {m}
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        ))}
      </div>

      <p className="mt-6 text-xs text-apg-silver">
        Run individual audits:{' '}
        <Link href="/admin/system/financial-audit" className="text-[#FF5A1F] hover:underline">
          Financial
        </Link>
        {' · '}
        <Link href="/admin/system/bed-audit" className="text-[#FF5A1F] hover:underline">
          Bed
        </Link>
        {' · '}
        <Link href="/admin/notifications" className="text-[#FF5A1F] hover:underline">
          Notifications
        </Link>
      </p>
    </>
  );
}
