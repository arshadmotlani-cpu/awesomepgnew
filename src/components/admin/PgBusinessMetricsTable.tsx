import Link from 'next/link';
import type { BusinessMetricsSummary, PgBusinessMetrics } from '@/src/db/queries/admin';
import { paiseToInr } from '@/src/lib/format';
import type { RevenueByPgRow } from '@/src/services/revenueCommandCenter';

function Money({ paise, tone }: { paise: number; tone: 'in' | 'out' | 'charge' }) {
  if (paise === 0) return <span className="text-apg-silver">—</span>;
  const cls =
    tone === 'out' ? 'text-rose-300' : tone === 'charge' ? 'text-amber-300' : 'text-white';
  return <span className={`font-semibold ${cls}`}>{paiseToInr(paise)}</span>;
}

export function OverviewFinancialPanels({
  summary,
}: {
  summary: BusinessMetricsSummary;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-5">
        <h2 className="text-sm font-semibold text-emerald-200">Invoice revenue</h2>
        <p className="mt-1 text-xs text-emerald-100/70">
          Counts only paid rent and electricity invoices — no projections or QR logs.
        </p>
        <dl className="mt-4 space-y-3">
          <div className="flex items-baseline justify-between gap-4 border-b border-emerald-500/10 pb-3">
            <dt className="text-sm text-emerald-100/90">Rent collected</dt>
            <dd>
              <Money paise={summary.incomeRentPaise} tone="in" />
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-4 border-b border-emerald-500/10 pb-3">
            <dt className="text-sm text-emerald-100/90">Electricity collected</dt>
            <dd>
              <Money paise={summary.incomeElectricityPaise} tone="in" />
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-4 border-b border-emerald-500/10 pb-3">
            <dt className="text-sm text-emerald-100/90">
              Rent late fees
              <span className="mt-0.5 block text-[11px] text-emerald-100/60">On paid rent invoices</span>
            </dt>
            <dd>
              <Money paise={summary.lateFeePaise} tone="charge" />
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-4 pt-1">
            <dt className="text-sm font-semibold text-white">Total invoice revenue</dt>
            <dd className="text-lg font-bold text-emerald-300">
              {paiseToInr(summary.incomeTotalPaise + summary.extraIncomePaise)}
            </dd>
          </div>
        </dl>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
        <h2 className="text-sm font-semibold text-white">Deposit wallet</h2>
        <p className="mt-1 text-xs text-apg-silver">
          Deposits, refunds, and deductions appear here only after you record them in the deposit
          module.
        </p>
        <dl className="mt-4 space-y-3">
          <div className="flex items-baseline justify-between gap-4 border-b border-white/10 pb-3">
            <dt className="text-sm text-apg-silver">Deposit refunds (MTD)</dt>
            <dd>
              <Money paise={summary.depositRefundsPaise} tone="out" />
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-4 pt-1">
            <dt className="text-sm text-apg-silver">Residents refunded</dt>
            <dd className="text-lg font-bold text-white">{summary.depositRefundsCount}</dd>
          </div>
        </dl>
        <Link
          href="/admin/deposits"
          className="mt-4 inline-block text-xs font-medium text-apg-silver hover:text-white"
        >
          Manage deposits →
        </Link>
      </section>
    </div>
  );
}

function InvoiceCell({ paise }: { paise: number }) {
  if (paise === 0) return <span className="text-apg-silver">—</span>;
  return <span className="font-medium text-emerald-300">{paiseToInr(paise)}</span>;
}

export function PgBusinessMetricsTable({
  rows,
  totals,
  pgHref = (pgId) => `/admin/revenue/pg/${pgId}`,
  revenueByPg,
  billingMonth,
}: {
  rows: PgBusinessMetrics[];
  totals?: BusinessMetricsSummary;
  pgHref?: (pgId: string) => string;
  revenueByPg?: RevenueByPgRow[];
  billingMonth?: string;
}) {
  const depositMap = new Map(revenueByPg?.map((r) => [r.pgId, r]) ?? []);
  if (rows.length === 0) {
    return <p className="text-sm text-apg-silver">No PG listings yet.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-white/10 bg-[#1A1F27]">
      <table className="min-w-full text-sm">
        <thead className="text-left text-[11px] uppercase tracking-wide text-apg-silver">
          <tr className="border-b border-white/10">
            <th className="px-4 py-3">PG</th>
            <th className="px-4 py-3">Occupancy</th>
            <th className="px-4 py-3">Rent (invoices)</th>
            <th className="px-4 py-3">Electricity (invoices)</th>
            <th className="px-4 py-3">Deposit revenue</th>
            <th className="px-4 py-3">Late fees</th>
            <th className="px-4 py-3">Total revenue</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5 text-apg-silver">
          {rows.map((row) => {
            const dep = depositMap.get(row.pgId);
            const depositPaise = dep?.depositRevenuePaise ?? 0;
            const grandTotal =
              row.incomeRentPaise + row.incomeElectricityPaise + depositPaise + row.lateFeePaise;
            const monthQs = billingMonth ? `?month=${billingMonth.slice(0, 7)}` : '';
            return (
            <tr key={row.pgId} className="hover:bg-white/[0.02]">
              <td className="px-4 py-3">
                <Link
                  href={pgHref(row.pgId)}
                  className="font-medium text-white hover:text-[#FF5A1F]"
                >
                  {row.pgName}
                </Link>
              </td>
              <td className="px-4 py-3 text-xs">
                {row.occupancyPct}% · {row.occupiedBeds}/{row.totalBeds} beds
              </td>
              <td className="px-4 py-3">
                <InvoiceCell paise={row.incomeRentPaise} />
              </td>
              <td className="px-4 py-3">
                <InvoiceCell paise={row.incomeElectricityPaise} />
              </td>
              <td className="px-4 py-3">
                {depositPaise > 0 ? (
                  <Link
                    href={`/admin/deposits/collected?pgId=${row.pgId}${monthQs}`}
                    className="font-medium text-emerald-300 hover:text-emerald-200"
                  >
                    {paiseToInr(depositPaise)}
                  </Link>
                ) : (
                  <span className="text-apg-silver">—</span>
                )}
              </td>
              <td className="px-4 py-3">
                <Money paise={row.lateFeePaise} tone="charge" />
              </td>
              <td className="px-4 py-3 font-semibold text-white">
                {paiseToInr(grandTotal)}
              </td>
            </tr>
          );})}
        </tbody>
        {totals ? (
          <tfoot className="border-t border-white/10 bg-white/[0.03] text-sm font-semibold text-white">
            <tr>
              <td className="px-4 py-3" colSpan={2}>
                All PGs
              </td>
              <td className="px-4 py-3">
                <InvoiceCell paise={totals.incomeRentPaise} />
              </td>
              <td className="px-4 py-3">
                <InvoiceCell paise={totals.incomeElectricityPaise} />
              </td>
              <td className="px-4 py-3">
                <InvoiceCell
                  paise={revenueByPg?.reduce((a, r) => a + r.depositRevenuePaise, 0) ?? 0}
                />
              </td>
              <td className="px-4 py-3">
                <Money paise={totals.lateFeePaise} tone="charge" />
              </td>
              <td className="px-4 py-3">
                {paiseToInr(
                  totals.incomeRentPaise +
                    totals.incomeElectricityPaise +
                    totals.lateFeePaise +
                    (revenueByPg?.reduce((a, r) => a + r.depositRevenuePaise, 0) ?? 0),
                )}
              </td>
            </tr>
          </tfoot>
        ) : null}
      </table>
    </div>
  );
}
