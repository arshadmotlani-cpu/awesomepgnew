import { paiseToInr } from '@/src/lib/format';
import { formatBillingMonthLabel } from '@/src/lib/billing/monthNavigation';
import type { BusinessMetricsSummary } from '@/src/db/queries/admin';
import type { RevenueCommandCenterData } from '@/src/services/revenueCommandCenter';

export function RevenueMonthSummary({
  billingMonth,
  summary,
  revenue,
}: {
  billingMonth: string;
  summary: BusinessMetricsSummary;
  revenue: RevenueCommandCenterData;
}) {
  const { mtd } = revenue;
  const netRevenuePaise = mtd.netInflowPaise;

  return (
    <section className="rounded-2xl border border-white/10 bg-[#1A1F27] p-5">
      <h2 className="text-lg font-semibold text-white">{formatBillingMonthLabel(billingMonth)}</h2>
      <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Metric label="Rent revenue" value={paiseToInr(mtd.rentPaise)} />
        <Metric label="Electricity revenue" value={paiseToInr(mtd.electricityPaise)} />
        <Metric label="Deposit revenue" value={paiseToInr(mtd.depositPaise)} accent="orange" />
        <Metric label="Refunds" value={paiseToInr(mtd.depositRefundedPaise)} accent="rose" />
        <Metric label="Net revenue" value={paiseToInr(netRevenuePaise)} accent="emerald" strong />
        <Metric
          label="Occupancy"
          value={`${summary.occupiedBeds} / ${summary.totalBeds} beds`}
          hint={`${summary.occupancyPct}%`}
        />
      </dl>
    </section>
  );
}

function Metric({
  label,
  value,
  hint,
  accent,
  strong,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: 'emerald' | 'orange' | 'rose';
  strong?: boolean;
}) {
  const valueCls =
    accent === 'emerald'
      ? 'text-emerald-300'
      : accent === 'orange'
        ? 'text-orange-300'
        : accent === 'rose'
          ? 'text-rose-300'
          : 'text-white';

  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2.5">
      <dt className="text-[10px] font-medium uppercase tracking-wide text-apg-silver">{label}</dt>
      <dd className={`mt-1 ${strong ? 'text-xl font-bold' : 'text-base font-semibold'} ${valueCls}`}>
        {value}
      </dd>
      {hint ? <p className="mt-0.5 text-[11px] text-apg-muted">{hint}</p> : null}
    </div>
  );
}
