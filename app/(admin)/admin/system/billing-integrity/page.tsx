import Link from 'next/link';
import { Badge } from '@/src/components/admin/Badge';
import { ModuleBreadcrumbs } from '@/src/components/admin/ModuleBreadcrumbs';
import { OverviewMonthPicker } from '@/src/components/admin/OverviewMonthPicker';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { TBody, TD, TH, THead, TR, Table } from '@/src/components/admin/Table';
import { requireAdminSession } from '@/src/lib/auth/guards';
import { ADMIN_MODULES, moduleHref } from '@/src/lib/admin/navigation';
import { resolveBillingMonth } from '@/src/lib/dateDefaults';
import { BILLING_INTEGRITY_CHECK_TYPES } from '@/src/services/billingIntegrityCheck';
import { loadBillingIntegrityReport } from './actions';
import { RepairAllBillingIssuesButton } from './RepairAllBillingIssuesButton';
import { RepairBillingIssueButton } from './RepairBillingIssueButton';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export default async function BillingIntegrityPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const sp = await searchParams;
  const billingMonth = resolveBillingMonth(sp.month);
  await requireAdminSession('/admin/system/billing-integrity');
  const report = await loadBillingIntegrityReport(billingMonth);

  const grouped = new Map<string, typeof report.issues>();
  for (const issue of report.issues) {
    const list = grouped.get(issue.checkType) ?? [];
    list.push(issue);
    grouped.set(issue.checkType, list);
  }

  return (
    <>
      <ModuleBreadcrumbs
        items={[
          { label: 'Overview', href: moduleHref('overview', billingMonth) },
          { label: ADMIN_MODULES.system.label, href: moduleHref('system') },
          { label: 'Billing integrity' },
        ]}
      />
      <PageHeader
        title="Billing integrity check"
        description="Detects payment-to-invoice drift, mirror mismatches, and room electricity allocation gaps."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <OverviewMonthPicker billingMonth={billingMonth} />
            {report.summary.autoRepairableCount > 0 ? (
              <RepairAllBillingIssuesButton billingMonth={billingMonth} />
            ) : null}
          </div>
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Badge tone={report.summary.issueCount === 0 ? 'emerald' : 'rose'}>
          {report.summary.issueCount === 0 ? 'All checks passed' : `${report.summary.issueCount} issue(s)`}
        </Badge>
        <span className="text-xs text-apg-silver">
          Month {billingMonth} · {report.summary.autoRepairableCount} auto-repairable · as of{' '}
          {new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(
            new Date(report.asOf),
          )}
        </span>
      </div>

      <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {BILLING_INTEGRITY_CHECK_TYPES.map((type) => (
          <div key={type} className="rounded-xl border border-white/10 bg-[#12161C]/80 p-4">
            <p className="text-[10px] uppercase tracking-wide text-apg-muted">
              {type.replace(/_/g, ' ')}
            </p>
            <p className="mt-1 text-2xl font-semibold text-white">
              {report.summary.byCheckType[type]}
            </p>
          </div>
        ))}
      </div>

      {report.issues.length === 0 ? (
        <p className="text-sm text-apg-silver">
          No cross-surface billing inconsistencies detected for {billingMonth}.
        </p>
      ) : (
        <div className="space-y-8">
          {[...grouped.entries()].map(([checkType, issues]) => (
            <section key={checkType}>
              <h2 className="mb-2 text-sm font-semibold text-white">
                {checkType.replace(/_/g, ' ')} ({issues.length})
              </h2>
              <div className="overflow-hidden rounded-xl border border-white/10">
                <Table>
                  <THead>
                    <TR>
                      <TH>Resident / room</TH>
                      <TH>Detail</TH>
                      <TH>Entities</TH>
                      <TH>Repair</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {issues.map((issue, i) => (
                      <TR key={`${checkType}-${i}`}>
                        <TD className="text-xs text-white">
                          {issue.customerName !== '—' ? issue.customerName : issue.roomNumber ?? '—'}
                          {issue.roomNumber && issue.customerName !== '—' ? (
                            <span className="block text-apg-silver">Room {issue.roomNumber}</span>
                          ) : null}
                        </TD>
                        <TD className="max-w-lg text-xs text-apg-silver">{issue.detail}</TD>
                        <TD className="text-[10px] text-apg-silver">
                          {issue.sourceTable ? `${issue.sourceTable}` : '—'}
                          {issue.paymentId ? ` · pay ${issue.paymentId.slice(0, 8)}` : ''}
                          {issue.unifiedInvoiceId
                            ? ` · mirror ${issue.unifiedInvoiceId.slice(0, 8)}`
                            : ''}
                        </TD>
                        <TD>
                          <RepairBillingIssueButton issue={issue} />
                          {!issue.autoRepairable ? (
                            <span className="text-[10px] text-amber-300">Manual</span>
                          ) : null}
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </div>
            </section>
          ))}
        </div>
      )}

      <p className="mt-6 text-xs text-apg-silver">
        Safe repairs sync source invoices with <code className="text-white/80">financial_invoices</code>{' '}
        mirrors. For surface totals, also run{' '}
        <Link href="/admin/system/financial-audit" className="text-[#FF5A1F] hover:underline">
          Financial audit
        </Link>
        .
      </p>
    </>
  );
}
