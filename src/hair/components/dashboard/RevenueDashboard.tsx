'use client';

import { Info } from 'lucide-react';
import { DashboardShell } from '@/src/hair/components/dashboard/DashboardShell';
import { RevenueDashboardFilters } from '@/src/hair/components/dashboard/RevenueDashboardFilters';
import { InvoicesDayWiseChart } from '@/src/hair/components/dashboard/RevenueCharts';
import { formatInrFromPaise } from '@/src/hair/lib/money';
import type { TenantLocationOption } from '@/src/hair/actions/tenant';
import type { RevenueDashboardReport, TenderBreakdown } from '@/src/hair/services/revenueDashboardReportTypes';

function MetricRow({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[color:var(--fyh-border)] py-2.5 text-sm last:border-0">
      <span className="text-fyh-text-secondary">{label}</span>
      <span className="text-right">
        <span className="tabular-nums font-semibold text-fyh-text">{value}</span>
        {sub ? <span className="mt-0.5 block text-xs font-normal text-fyh-text-muted">{sub}</span> : null}
      </span>
    </div>
  );
}

function TenderRows({ data, title }: { data: TenderBreakdown; title?: string }) {
  return (
    <div className="fyh-dashboard-card p-4">
      {title ? <h3 className="fyh-card-title text-base">{title}</h3> : null}
      <div className={title ? 'mt-3' : ''}>
        <MetricRow label="Cash" value={formatInrFromPaise(data.cashPaise)} />
        <MetricRow label="Card" value={formatInrFromPaise(data.cardPaise)} />
        <MetricRow label="UPI / Online" value={formatInrFromPaise(data.upiPaise)} />
        <MetricRow label="Other" value={formatInrFromPaise(data.otherPaise)} />
        <MetricRow label="Total" value={formatInrFromPaise(data.totalPaise)} />
      </div>
    </div>
  );
}

function DeltaBadge({ deltaPaise }: { deltaPaise: number | null | undefined }) {
  if (deltaPaise == null) return null;
  if (deltaPaise === 0) return <span className="text-xs text-fyh-text-muted">vs prev period: —</span>;
  const sign = deltaPaise > 0 ? '+' : '';
  return (
    <span className={`text-xs ${deltaPaise > 0 ? 'text-fyh-forest' : 'text-fyh-accent'}`}>
      vs prev period: {sign}
      {formatInrFromPaise(deltaPaise)}
    </span>
  );
}

type Props = {
  report: RevenueDashboardReport;
  locationOptions: TenantLocationOption[];
  fromDayKey: string;
  toDayKey: string;
  locationsParam: string;
};

export function RevenueDashboard({ report, locationOptions, fromDayKey, toDayKey, locationsParam }: Props) {
  const { sales, netContribution, comparison } = report;

  return (
    <DashboardShell
      eyebrow="Finance"
      title="Revenue Dashboard"
      subtitle="Sales, collection, and contribution from live billing data"
    >
      <RevenueDashboardFilters
        fromDayKey={fromDayKey}
        toDayKey={toDayKey}
        locationsParam={locationsParam}
        locationOptions={locationOptions}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="fyh-dashboard-card p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="fyh-card-title">Sales</h2>
            <DeltaBadge deltaPaise={comparison?.salesTotalDeltaPaise} />
          </div>
          <p className="mt-1 text-xs text-fyh-text-muted">Gross sales by category (excludes customer advances)</p>
          <div className="mt-3">
            <MetricRow label="Net Service" value={formatInrFromPaise(sales.netServicePaise)} />
            <MetricRow label="Package" value={formatInrFromPaise(sales.packagePaise)} />
            <MetricRow label="Product" value={formatInrFromPaise(sales.productPaise)} />
            <MetricRow label="Membership" value={formatInrFromPaise(sales.membershipPaise)} />
            <MetricRow
              label="Gift card"
              value={formatInrFromPaise(sales.giftCardPaise)}
              sub={sales.giftCardPaise === 0 ? 'Not tracked separately in billing' : undefined}
            />
            <MetricRow label="Total" value={formatInrFromPaise(sales.totalPaise)} />
          </div>
        </section>

        <section className="fyh-dashboard-card p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="fyh-card-title">Net Collection / Contribution</h2>
            <DeltaBadge deltaPaise={comparison?.netContributionDeltaPaise} />
          </div>
          <p className="mt-1 flex items-start gap-1.5 text-xs text-fyh-text-muted">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            Direct product/service cost only. Salary, rent, and other expenses are not deducted here — see Expenses
            below. Costs use current catalog prices; historical contribution may shift if costs change later.
          </p>
          <div className="mt-3">
            <MetricRow label="Gross sales" value={formatInrFromPaise(netContribution.grossSalesPaise)} />
            <MetricRow label="Direct cost" value={formatInrFromPaise(netContribution.directCostPaise)} />
            <MetricRow
              label="Net collection"
              value={formatInrFromPaise(netContribution.netCollectionContributionPaise)}
            />
          </div>
        </section>
      </div>

      <section className="fyh-dashboard-card p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="fyh-card-title">Actual Collection</h2>
          <DeltaBadge deltaPaise={comparison?.actualCollectionDeltaPaise} />
        </div>
        <p className="mt-1 text-xs text-fyh-text-muted">Money received by tender (checkout only; excludes advances)</p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {(
            [
              ['Cash', report.actualCollection.cashPaise],
              ['Card', report.actualCollection.cardPaise],
              ['UPI / Online', report.actualCollection.upiPaise],
              ['Other', report.actualCollection.otherPaise],
              ['Total', report.actualCollection.totalPaise],
            ] as const
          ).map(([label, paise]) => (
            <div key={label} className="rounded-lg border border-[color:var(--fyh-border)] p-3">
              <p className="text-xs text-fyh-text-muted">{label}</p>
              <p className="fyh-display mt-1 text-lg font-semibold tabular-nums">{formatInrFromPaise(paise)}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <TenderRows data={report.advances} title="Advances" />
        <div className="fyh-dashboard-card p-4">
          <h3 className="fyh-card-title text-base">Refunds</h3>
          <p className="mt-1 text-xs text-fyh-text-muted">Credit notes in period (by method when available)</p>
          <div className="mt-3">
            <MetricRow label="Total" value={formatInrFromPaise(report.refunds.totalPaise)} />
          </div>
        </div>
        <div className="fyh-dashboard-card p-4">
          <h3 className="fyh-card-title text-base">Tip</h3>
          <p className="mt-3 fyh-display text-xl font-semibold tabular-nums">
            {formatInrFromPaise(report.tipsTotalPaise)}
          </p>
        </div>
        <div className="fyh-dashboard-card p-4">
          <h3 className="fyh-card-title text-base">Dues</h3>
          <p className="mt-1 text-xs text-fyh-text-muted">Current outstanding (live; not filtered by date above)</p>
          <p className="mt-3 fyh-display text-xl font-semibold tabular-nums">
            {formatInrFromPaise(report.duesCurrentOutstandingPaise)}
          </p>
        </div>
      </div>

      <section className="fyh-dashboard-card p-4">
        <h2 className="fyh-card-title">Redemption</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-3">
          <MetricRow label="Net service" value={formatInrFromPaise(report.redemption.netServicePaise)} />
          <MetricRow label="Discount" value={formatInrFromPaise(report.redemption.discountPaise)} />
          <MetricRow label="Total" value={formatInrFromPaise(report.redemption.totalPaise)} />
        </div>
      </section>

      <section className="fyh-dashboard-card p-4">
        <h2 className="fyh-card-title">Invoices — Day wise</h2>
        <p className="mt-1 text-xs text-fyh-text-muted">Paid invoices in selected range (salon timezone)</p>
        <div className="mt-4 overflow-x-auto">
          <InvoicesDayWiseChart data={report.invoicesDayWise} />
        </div>
        {report.invoicesDayWise.length > 0 ? (
          <table className="mt-4 w-full min-w-[28rem] text-left text-sm">
            <thead>
              <tr className="border-b border-[color:var(--fyh-border)] text-xs text-fyh-text-muted">
                <th className="py-2 pr-4">Day</th>
                <th className="py-2 pr-4 text-right">Invoice amt.</th>
                <th className="py-2 pr-4 text-right">Discount</th>
                <th className="py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {report.invoicesDayWise.map((row) => (
                <tr key={row.dayKey} className="border-b border-[color:var(--fyh-border)] last:border-0">
                  <td className="py-2 pr-4">{row.label}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{formatInrFromPaise(row.invoiceAmountPaise)}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{formatInrFromPaise(row.discountPaise)}</td>
                  <td className="py-2 text-right tabular-nums">{formatInrFromPaise(row.totalPaise)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="fyh-dashboard-card p-4">
          <h2 className="fyh-card-title">Staff pay</h2>
          {report.staffPay.payrollPeriodLabel ? (
            <p className="mt-1 text-xs text-fyh-text-muted">Payroll period: {report.staffPay.payrollPeriodLabel}</p>
          ) : null}
          {report.staffPay.rows.length === 0 ? (
            <p className="mt-4 text-sm text-fyh-text-muted">No payroll data for this period.</p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[20rem] text-left text-sm">
                <thead>
                  <tr className="border-b border-[color:var(--fyh-border)] text-xs text-fyh-text-muted">
                    <th className="py-2 pr-2">Staff</th>
                    <th className="py-2 pr-2 text-right">Advance salary</th>
                    <th className="py-2 pr-2 text-right">Incentive</th>
                    <th className="py-2 text-right">Salary</th>
                  </tr>
                </thead>
                <tbody>
                  {report.staffPay.rows.map((row) => (
                    <tr key={row.staffName} className="border-b border-[color:var(--fyh-border)] last:border-0">
                      <td className="py-2 pr-2">{row.staffName}</td>
                      <td className="py-2 pr-2 text-right tabular-nums text-fyh-text-muted">—</td>
                      <td className="py-2 pr-2 text-right tabular-nums">
                        {formatInrFromPaise(row.incentivePaise)}
                      </td>
                      <td className="py-2 text-right tabular-nums">{formatInrFromPaise(row.salaryPaise)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="fyh-dashboard-card p-4">
          <h2 className="fyh-card-title">Expense</h2>
          <p className="mt-1 text-xs text-fyh-text-muted">
            Total {formatInrFromPaise(report.expensesTotalPaise)} in selected range
          </p>
          {report.expenses.length === 0 ? (
            <p className="mt-4 text-sm text-fyh-text-muted">No expenses in this range.</p>
          ) : (
            <div className="mt-3">
              {report.expenses.map((row) => (
                <MetricRow key={row.category} label={row.label} value={formatInrFromPaise(row.amountPaise)} />
              ))}
            </div>
          )}
        </section>
      </div>
    </DashboardShell>
  );
}
