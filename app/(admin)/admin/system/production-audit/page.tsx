import Link from 'next/link';
import { Badge } from '@/src/components/admin/Badge';
import { ModuleBreadcrumbs } from '@/src/components/admin/ModuleBreadcrumbs';
import { OverviewMonthPicker } from '@/src/components/admin/OverviewMonthPicker';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { TBody, TD, TH, THead, TR, Table } from '@/src/components/admin/Table';
import { requireAdminSession } from '@/src/lib/auth/guards';
import { ADMIN_MODULES, moduleHref } from '@/src/lib/admin/navigation';
import { resolveBillingMonth } from '@/src/lib/dateDefaults';
import { runProductionAudit } from '@/src/services/productionAudit';
import { runCounterParityAudit } from '@/src/services/counterParityAudit';

export const dynamic = 'force-dynamic';
export const maxDuration = 180;

export default async function ProductionAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const sp = await searchParams;
  const billingMonth = resolveBillingMonth(sp.month);
  const session = await requireAdminSession('/admin/system/production-audit');
  const report = await runProductionAudit(session, billingMonth);
  const counterParity = await runCounterParityAudit(session, billingMonth);

  return (
    <>
      <ModuleBreadcrumbs
        items={[
          { label: 'Overview', href: moduleHref('overview', billingMonth) },
          { label: ADMIN_MODULES.system.label, href: moduleHref('system') },
          { label: 'Production audit' },
        ]}
      />
      <PageHeader
        title="Production audit"
        description="Unified deploy gate — financial, deposit, checkout, counter parity, ops badges, and notifications."
        actions={<OverviewMonthPicker billingMonth={billingMonth} />}
      />

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Badge tone={report.allPass ? 'emerald' : 'rose'}>
          {report.allPass ? 'ALL PASS — production ready' : 'FAIL — resolve before deploy'}
        </Badge>
        <span className="text-xs text-apg-silver">
          Billing month {report.billingMonth} · As of{' '}
          {new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(
            new Date(report.asOf),
          )}
        </span>
      </div>

      <div className="space-y-4">
        {report.gates.map((gate) => (
          <section
            key={gate.id}
            className="rounded-xl border border-white/10 bg-[#1A1F27] p-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-white">{gate.name}</h2>
              <Badge tone={gate.pass ? 'emerald' : 'rose'}>{gate.pass ? 'PASS' : 'FAIL'}</Badge>
            </div>
            <p className="mt-1 text-xs text-apg-silver">{gate.summary}</p>
            {gate.mismatches.length > 0 ? (
              <ul className="mt-3 space-y-1 rounded-lg border border-rose-400/20 bg-rose-500/5 p-3">
                {gate.mismatches.slice(0, 25).map((m, i) => (
                  <li key={i} className="text-xs text-rose-200">
                    {m}
                  </li>
                ))}
                {gate.mismatches.length > 25 ? (
                  <li className="text-xs text-rose-300">
                    … and {gate.mismatches.length - 25} more
                  </li>
                ) : null}
              </ul>
            ) : null}
          </section>
        ))}
      </div>

      <section className="mt-8 space-y-3">
          <h2 className="text-sm font-semibold text-white">Counter parity detail</h2>
          <div className="overflow-hidden rounded-xl border border-white/10">
            <Table>
              <THead>
                <TR>
                  <TH>Metric</TH>
                  <TH className="text-right">Overview</TH>
                  <TH className="text-right">Destination</TH>
                  <TH>Source</TH>
                  <TH>Status</TH>
                </TR>
              </THead>
              <TBody>
                {counterParity.rows.map((row) => (
                  <TR key={row.metric}>
                    <TD className="text-white">{row.metric}</TD>
                    <TD className="text-right tabular-nums">{row.overviewValue}</TD>
                    <TD className="text-right tabular-nums">{row.destinationValue}</TD>
                    <TD className="text-xs text-apg-silver">{row.destination}</TD>
                    <TD>
                      <Badge tone={row.matches ? 'emerald' : 'rose'}>
                        {row.matches ? 'OK' : 'MISMATCH'}
                      </Badge>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        </section>

      <p className="mt-6 text-xs text-apg-silver">
        Related:{' '}
        <Link href="/admin/system/health-report" className="text-[#FF5A1F] hover:underline">
          System health
        </Link>
        {' · '}
        <Link href="/admin/system/financial-audit" className="text-[#FF5A1F] hover:underline">
          Financial audit
        </Link>
        {' · '}
        <Link href="/admin/system/bed-audit" className="text-[#FF5A1F] hover:underline">
          Bed audit
        </Link>
      </p>
    </>
  );
}
