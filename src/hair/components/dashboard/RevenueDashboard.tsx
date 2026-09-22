'use client';

import { Info } from 'lucide-react';
import { DashboardShell } from '@/src/hair/components/dashboard/DashboardShell';
import { RevenueDashboardFilters } from '@/src/hair/components/dashboard/RevenueDashboardFilters';
import { InvoicesDayWiseChart } from '@/src/hair/components/dashboard/RevenueCharts';
import { formatInrFromPaise } from '@/src/hair/lib/money';
import type { TenantLocationOption } from '@/src/hair/actions/tenant';
import type { RevenueDashboardReport, TenderBreakdown } from '@/src/hair/services/revenueDashboardReportTypes';

const sectionCard = 'fyh-dashboard-card px-4 py-3 sm:p-4';
const sectionTitle = 'text-sm font-semibold text-fyh-text sm:fyh-card-title';
const helperText = 'text-[0.6875rem] leading-snug text-fyh-text-muted sm:text-xs';
const tableHeadCell = 'py-1.5 pr-2 text-[0.6875rem] sm:py-2 sm:text-xs';
const tableBodyCell = 'py-1.5 pr-2 text-xs sm:py-2 sm:text-sm';

function RevenueMetricRow({
  label,
  labelNote,
  value,
  emphasize,
}: {
  label: string;
  labelNote?: string;
  value: string;
  emphasize?: boolean;
}) {
  return (
    <div
      className={`flex items-baseline justify-between gap-2 border-b border-[color:var(--fyh-border)] py-1.5 last:border-0 sm:py-2 ${
        emphasize ? 'border-t border-[color:var(--fyh-border)] pt-2 font-semibold' : ''
      }`}
    >
      <span className="min-w-0 truncate text-sm text-fyh-text-secondary">
        {label}
        {labelNote ? (
          <span className="ml-1 text-[0.625rem] font-normal text-fyh-text-muted">{labelNote}</span>
        ) : null}
      </span>
      <span className="shrink-0 tabular-nums text-sm font-semibold text-fyh-text">{value}</span>
    </div>
  );
}

function SectionHeader({
  title,
  deltaPaise,
  subtitle,
}: {
  title: string;
  deltaPaise?: number | null;
  subtitle?: string;
}) {
  return (
    <>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <h2 className={sectionTitle}>{title}</h2>
        <RevenueDeltaBadge deltaPaise={deltaPaise} />
      </div>
      {subtitle ? <p className={`mt-1 ${helperText}`}>{subtitle}</p> : null}
    </>
  );
}

function RevenueDeltaBadge({ deltaPaise }: { deltaPaise: number | null | undefined }) {
  if (deltaPaise == null) return null;
  if (deltaPaise === 0) {
    return <span className="text-[0.6875rem] leading-tight text-fyh-text-muted">vs prev: —</span>;
  }
  const sign = deltaPaise > 0 ? '+' : '';
  return (
    <span
      className={`text-[0.6875rem] leading-tight ${deltaPaise > 0 ? 'text-fyh-forest' : 'text-fyh-accent'}`}
    >
      vs prev: {sign}
      {formatInrFromPaise(deltaPaise)}
    </span>
  );
}

function TenderRows({ data, title }: { data: TenderBreakdown; title?: string }) {
  return (
    <div className={sectionCard}>
      {title ? <h3 className={`${sectionTitle} text-base`}>{title}</h3> : null}
      <div className={title ? 'mt-2 sm:mt-3' : ''}>
        <RevenueMetricRow label="Cash" value={formatInrFromPaise(data.cashPaise)} />
        <RevenueMetricRow label="Card" value={formatInrFromPaise(data.cardPaise)} />
        <RevenueMetricRow label="UPI / Online" value={formatInrFromPaise(data.upiPaise)} />
        <RevenueMetricRow label="Other" value={formatInrFromPaise(data.otherPaise)} />
        <RevenueMetricRow label="Total" value={formatInrFromPaise(data.totalPaise)} emphasize />
      </div>
    </div>
  );
}

function ActualCollectionSection({
  data,
  deltaPaise,
}: {
  data: RevenueDashboardReport['actualCollection'];
  deltaPaise?: number | null;
}) {
  const rows = [
    ['Cash', data.cashPaise],
    ['Card', data.cardPaise],
    ['UPI / Online', data.upiPaise],
    ['Other', data.otherPaise],
    ['Total', data.totalPaise],
  ] as const;

  return (
    <section className={sectionCard}>
      <SectionHeader
        title="Actual Collection"
        deltaPaise={deltaPaise}
        subtitle="Money received by tender (checkout only; excludes advances)"
      />
      <div className="mt-2 sm:hidden">
        {rows.map(([label, paise]) => (
          <RevenueMetricRow
            key={label}
            label={label}
            value={formatInrFromPaise(paise)}
            emphasize={label === 'Total'}
          />
        ))}
      </div>
      <div className="mt-2 hidden gap-3 sm:grid sm:grid-cols-2 lg:grid-cols-5">
        {rows.map(([label, paise]) => (
          <div key={label} className="rounded-lg border border-[color:var(--fyh-border)] p-2.5 sm:p-3">
            <p className="text-[0.6875rem] text-fyh-text-muted sm:text-xs">{label}</p>
            <p className="mt-0.5 text-base font-semibold tabular-nums sm:fyh-display sm:text-lg">
              {formatInrFromPaise(paise)}
            </p>
          </div>
        ))}
      </div>
    </section>
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
      headerDensity="compact"
      rootClassName="fyh-revenue-dashboard min-w-0"
    >
      <RevenueDashboardFilters
        fromDayKey={fromDayKey}
        toDayKey={toDayKey}
        locationsParam={locationsParam}
        locationOptions={locationOptions}
      />

      <div className="grid gap-3 sm:gap-4 lg:grid-cols-2">
        <section className={sectionCard}>
          <SectionHeader
            title="Sales"
            deltaPaise={comparison?.salesTotalDeltaPaise}
            subtitle="Gross sales by category (excludes customer advances)"
          />
          <div className="mt-2 sm:mt-3">
            <RevenueMetricRow label="Net Service" value={formatInrFromPaise(sales.netServicePaise)} />
            <RevenueMetricRow label="Package" value={formatInrFromPaise(sales.packagePaise)} />
            <RevenueMetricRow label="Product" value={formatInrFromPaise(sales.productPaise)} />
            <RevenueMetricRow label="Membership" value={formatInrFromPaise(sales.membershipPaise)} />
            <RevenueMetricRow
              label="Gift card"
              labelNote={sales.giftCardPaise === 0 ? 'Not separately tracked' : undefined}
              value={formatInrFromPaise(sales.giftCardPaise)}
            />
            <RevenueMetricRow label="Total" value={formatInrFromPaise(sales.totalPaise)} emphasize />
          </div>
        </section>

        <section className={sectionCard}>
          <SectionHeader title="Net Collection / Contribution" deltaPaise={comparison?.netContributionDeltaPaise} />
          <p className={`mt-1 flex items-start gap-1 ${helperText}`}>
            <Info className="mt-0.5 h-3 w-3 shrink-0 sm:h-3.5 sm:w-3.5" aria-hidden />
            Direct product/service cost only. Salary, rent, and other expenses are not deducted here — see Expenses
            below. Costs use current catalog prices; historical contribution may shift if costs change later.
          </p>
          <div className="mt-2 sm:mt-3">
            <RevenueMetricRow label="Gross sales" value={formatInrFromPaise(netContribution.grossSalesPaise)} />
            <RevenueMetricRow label="Direct cost" value={formatInrFromPaise(netContribution.directCostPaise)} />
            <RevenueMetricRow
              label="Net collection"
              value={formatInrFromPaise(netContribution.netCollectionContributionPaise)}
              emphasize
            />
          </div>
        </section>
      </div>

      <ActualCollectionSection data={report.actualCollection} deltaPaise={comparison?.actualCollectionDeltaPaise} />

      <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4">
        <TenderRows data={report.advances} title="Advances" />
        <div className={sectionCard}>
          <h3 className={sectionTitle}>Refunds</h3>
          <p className={`mt-1 ${helperText}`}>Credit notes in period (by method when available)</p>
          <div className="mt-2 sm:mt-3">
            <RevenueMetricRow label="Total" value={formatInrFromPaise(report.refunds.totalPaise)} emphasize />
          </div>
        </div>
        <div className={sectionCard}>
          <h3 className={sectionTitle}>Tip</h3>
          <p className="mt-2 text-base font-semibold tabular-nums sm:mt-3 sm:text-lg">
            {formatInrFromPaise(report.tipsTotalPaise)}
          </p>
        </div>
        <div className={sectionCard}>
          <h3 className={sectionTitle}>Dues</h3>
          <p className={`mt-1 ${helperText}`}>Current outstanding (live; not filtered by date above)</p>
          <p className="mt-2 text-base font-semibold tabular-nums sm:mt-3 sm:text-lg">
            {formatInrFromPaise(report.duesCurrentOutstandingPaise)}
          </p>
        </div>
      </div>

      <section className={sectionCard}>
        <h2 className={sectionTitle}>Redemption</h2>
        <div className="mt-2 space-y-0 sm:mt-3 sm:grid sm:grid-cols-3 sm:gap-4">
          <RevenueMetricRow label="Net service" value={formatInrFromPaise(report.redemption.netServicePaise)} />
          <RevenueMetricRow label="Discount" value={formatInrFromPaise(report.redemption.discountPaise)} />
          <RevenueMetricRow label="Total" value={formatInrFromPaise(report.redemption.totalPaise)} emphasize />
        </div>
      </section>

      <section className={sectionCard}>
        <h2 className={sectionTitle}>Invoices — Day wise</h2>
        <p className={`mt-1 ${helperText}`}>Paid invoices in selected range (salon timezone)</p>
        <div className="mt-2 overflow-x-auto sm:mt-3">
          <InvoicesDayWiseChart data={report.invoicesDayWise} compact />
        </div>
        {report.invoicesDayWise.length > 0 ? (
          <div className="mt-2 overflow-x-auto sm:mt-3">
            <table className="w-full min-w-[28rem] text-left">
              <thead className="sticky top-0 bg-[color:var(--fyh-bg-surface)]">
                <tr className="border-b border-[color:var(--fyh-border)] text-fyh-text-muted">
                  <th className={tableHeadCell}>Day</th>
                  <th className={`${tableHeadCell} text-right`}>Invoice amt.</th>
                  <th className={`${tableHeadCell} text-right`}>Discount</th>
                  <th className={`${tableHeadCell} text-right`}>Total</th>
                </tr>
              </thead>
              <tbody>
                {report.invoicesDayWise.map((row) => (
                  <tr key={row.dayKey} className="border-b border-[color:var(--fyh-border)] last:border-0">
                    <td className={tableBodyCell}>{row.label}</td>
                    <td className={`${tableBodyCell} text-right tabular-nums`}>
                      {formatInrFromPaise(row.invoiceAmountPaise)}
                    </td>
                    <td className={`${tableBodyCell} text-right tabular-nums`}>
                      {formatInrFromPaise(row.discountPaise)}
                    </td>
                    <td className={`${tableBodyCell} text-right tabular-nums`}>
                      {formatInrFromPaise(row.totalPaise)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      <div className="grid gap-3 sm:gap-4 lg:grid-cols-2">
        <section className={sectionCard}>
          <h2 className={sectionTitle}>Staff pay</h2>
          {report.staffPay.payrollPeriodLabel ? (
            <p className={`mt-1 ${helperText}`}>Payroll period: {report.staffPay.payrollPeriodLabel}</p>
          ) : null}
          {report.staffPay.rows.length === 0 ? (
            <p className="mt-3 text-sm text-fyh-text-muted">No payroll data for this period.</p>
          ) : (
            <div className="mt-2 max-h-64 overflow-x-auto overflow-y-auto sm:mt-3">
              <table className="w-full min-w-[20rem] text-left">
                <thead className="sticky top-0 bg-[color:var(--fyh-bg-surface)]">
                  <tr className="border-b border-[color:var(--fyh-border)] text-fyh-text-muted">
                    <th className={tableHeadCell}>Staff</th>
                    <th className={`${tableHeadCell} text-right`}>Advance salary</th>
                    <th className={`${tableHeadCell} text-right`}>Incentive</th>
                    <th className={`${tableHeadCell} text-right`}>Salary</th>
                  </tr>
                </thead>
                <tbody>
                  {report.staffPay.rows.map((row) => (
                    <tr key={row.staffName} className="border-b border-[color:var(--fyh-border)] last:border-0">
                      <td className={tableBodyCell}>{row.staffName}</td>
                      <td className={`${tableBodyCell} text-right tabular-nums text-fyh-text-muted`}>—</td>
                      <td className={`${tableBodyCell} text-right tabular-nums`}>
                        {formatInrFromPaise(row.incentivePaise)}
                      </td>
                      <td className={`${tableBodyCell} text-right tabular-nums`}>
                        {formatInrFromPaise(row.salaryPaise)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className={sectionCard}>
          <h2 className={sectionTitle}>Expense</h2>
          <p className={`mt-1 ${helperText}`}>
            Total {formatInrFromPaise(report.expensesTotalPaise)} in selected range
          </p>
          {report.expenses.length === 0 ? (
            <p className="mt-3 text-sm text-fyh-text-muted">No expenses in this range.</p>
          ) : (
            <div className="mt-2 sm:mt-3">
              {report.expenses.map((row) => (
                <RevenueMetricRow key={row.category} label={row.label} value={formatInrFromPaise(row.amountPaise)} />
              ))}
            </div>
          )}
        </section>
      </div>
    </DashboardShell>
  );
}
