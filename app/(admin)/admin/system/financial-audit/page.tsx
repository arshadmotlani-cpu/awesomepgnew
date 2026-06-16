import Link from 'next/link';
import { Badge } from '@/src/components/admin/Badge';
import { ModuleBreadcrumbs } from '@/src/components/admin/ModuleBreadcrumbs';
import { OverviewMonthPicker } from '@/src/components/admin/OverviewMonthPicker';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { TBody, TD, TH, THead, TR, Table } from '@/src/components/admin/Table';
import { requireAdminSession } from '@/src/lib/auth/guards';
import { ADMIN_MODULES, moduleHref } from '@/src/lib/admin/navigation';
import { resolveBillingMonth } from '@/src/lib/dateDefaults';
import { paiseToInr } from '@/src/lib/format';
import { runFinancialHealthAudit } from '@/src/services/financialAudit';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export default async function FinancialAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const sp = await searchParams;
  const billingMonth = resolveBillingMonth(sp.month);
  const session = await requireAdminSession('/admin/system/financial-audit');
  const report = await runFinancialHealthAudit(session, billingMonth);

  return (
    <>
      <ModuleBreadcrumbs
        items={[
          { label: 'Overview', href: moduleHref('overview', billingMonth) },
          { label: ADMIN_MODULES.system.label, href: moduleHref('system') },
          { label: 'Financial audit' },
        ]}
      />
      <PageHeader
        title="Financial audit"
        description="Compares Overview, Revenue, Collections, and Resident Financial Engine totals."
        actions={<OverviewMonthPicker billingMonth={billingMonth} />}
      />

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Badge tone={report.hasMismatch ? 'rose' : 'emerald'}>
          {report.hasMismatch ? 'Mismatch detected' : 'All checks passed'}
        </Badge>
        <span className="text-xs text-apg-silver">
          As of {new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(report.asOf))}
        </span>
      </div>

      <div className="overflow-hidden rounded-xl border border-white/10">
        <Table>
          <THead>
            <TR>
              <TH>Check</TH>
              <TH>Surface</TH>
              <TH className="text-right">Surface ₹</TH>
              <TH>Engine</TH>
              <TH className="text-right">Engine ₹</TH>
              <TH className="text-right">Difference</TH>
              <TH>Source</TH>
            </TR>
          </THead>
          <TBody>
            {report.checks.map((c) => (
              <TR key={c.name}>
                <TD className="text-xs font-medium text-white">{c.name}</TD>
                <TD className="text-xs text-apg-silver">{c.surfaceLabel}</TD>
                <TD className="text-right tabular-nums text-xs">{paiseToInr(c.surfaceValuePaise)}</TD>
                <TD className="text-xs text-apg-silver">{c.engineLabel}</TD>
                <TD className="text-right tabular-nums text-xs">{paiseToInr(c.engineValuePaise)}</TD>
                <TD
                  className={
                    'text-right tabular-nums text-xs font-semibold ' +
                    (c.differencePaise === 0 ? 'text-emerald-300' : 'text-rose-300')
                  }
                >
                  {c.differencePaise === 0 ? '—' : paiseToInr(Math.abs(c.differencePaise))}
                  {c.differencePaise !== 0 ? (c.differencePaise > 0 ? ' (+)' : ' (−)') : ''}
                </TD>
                <TD className="max-w-[200px] text-[10px] text-apg-silver">{c.source}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </div>

      <p className="mt-6 text-xs text-apg-silver">
        Overview outstanding includes pending payment approvals; engine totals are resident dues only.
        A small difference there may be expected. Rent, electricity, and deposit lines should match exactly.
        If mismatched, run{' '}
        <Link href="/admin/system/recalculate-financial" className="text-[#FF5A1F] hover:underline">
          Recalculate financial data
        </Link>
        .
      </p>
    </>
  );
}
