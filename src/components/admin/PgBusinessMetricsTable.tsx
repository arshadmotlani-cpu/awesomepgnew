import Link from 'next/link';
import type { BusinessMetricsSummary, PgBusinessMetrics } from '@/src/db/queries/admin';
import { paiseToInr } from '@/src/lib/format';

function Money({ paise, tone }: { paise: number; tone: 'in' | 'out' | 'profit' | 'charge' }) {
  if (paise === 0) return <span className="text-apg-silver">—</span>;
  const cls =
    tone === 'out'
      ? 'text-rose-300'
      : tone === 'profit'
        ? 'text-emerald-300'
        : tone === 'charge'
          ? 'text-amber-300'
          : 'text-white';
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
        <h2 className="text-sm font-semibold text-emerald-200">Extra income</h2>
        <p className="mt-1 text-xs text-emerald-100/70">
          Penalties and charges kept — not refunded to residents.
        </p>
        <dl className="mt-4 space-y-3">
          <div className="flex items-baseline justify-between gap-4 border-b border-emerald-500/10 pb-3">
            <dt className="text-sm text-emerald-100/90">
              5-day vacating deductions
              <span className="mt-0.5 block text-[11px] text-emerald-100/60">Pure profit from short notice</span>
            </dt>
            <dd>
              <Money paise={summary.vacatingDeductionPaise} tone="profit" />
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-4 border-b border-emerald-500/10 pb-3">
            <dt className="text-sm text-emerald-100/90">
              Other deposit charges
              <span className="mt-0.5 block text-[11px] text-emerald-100/60">Damages, unpaid dues, admin deductions</span>
            </dt>
            <dd>
              <Money paise={summary.otherDeductionPaise} tone="charge" />
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-4 border-b border-emerald-500/10 pb-3">
            <dt className="text-sm text-emerald-100/90">
              Rent late fees
              <span className="mt-0.5 block text-[11px] text-emerald-100/60">Collected on overdue rent invoices</span>
            </dt>
            <dd>
              <Money paise={summary.lateFeePaise} tone="charge" />
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-4 pt-1">
            <dt className="text-sm font-semibold text-white">Total extra income</dt>
            <dd className="text-lg font-bold text-emerald-300">{paiseToInr(summary.extraIncomePaise)}</dd>
          </div>
        </dl>
      </section>

      <section className="rounded-2xl border border-rose-500/20 bg-rose-500/5 p-5">
        <h2 className="text-sm font-semibold text-rose-200">Money out — deposit refunds</h2>
        <p className="mt-1 text-xs text-rose-100/70">
          Cash returned from your account when residents vacate or checkout.
        </p>
        <dl className="mt-4 space-y-3">
          <div className="flex items-baseline justify-between gap-4 border-b border-rose-500/10 pb-3">
            <dt className="text-sm text-rose-100/90">Residents refunded</dt>
            <dd className="text-2xl font-bold text-white">{summary.depositRefundsCount}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-4 border-b border-rose-500/10 pb-3">
            <dt className="text-sm text-rose-100/90">Total deposit refunds</dt>
            <dd>
              <Money paise={summary.depositRefundsPaise} tone="out" />
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-4 pt-1">
            <dt className="text-sm text-rose-100/90">Net after refunds</dt>
            <dd className="text-lg font-bold text-white">
              {paiseToInr(
                summary.incomeTotalPaise +
                  summary.extraIncomePaise -
                  summary.depositRefundsPaise,
              )}
            </dd>
          </div>
        </dl>
        <Link
          href="/admin/deposits"
          className="mt-4 inline-block text-xs font-medium text-rose-200 hover:text-white"
        >
          View deposit ledger →
        </Link>
      </section>
    </div>
  );
}

function CollectionCell({
  total,
  qr,
  invoice,
}: {
  total: number;
  qr: number;
  invoice: number;
}) {
  if (total === 0) return <span className="text-apg-silver">—</span>;
  return (
    <div>
      <span className="font-medium text-emerald-300">{paiseToInr(total)}</span>
      <p className="mt-0.5 text-[11px] text-apg-silver">
        QR {paiseToInr(qr)} · Inv {paiseToInr(invoice)}
      </p>
    </div>
  );
}

export function PgBusinessMetricsTable({
  rows,
  totals,
  pgHref = (pgId) => `/admin/revenue/pg/${pgId}`,
}: {
  rows: PgBusinessMetrics[];
  totals?: BusinessMetricsSummary;
  pgHref?: (pgId: string) => string;
}) {
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
            <th className="px-4 py-3">Rent collected</th>
            <th className="px-4 py-3">Electricity</th>
            <th className="px-4 py-3">Total in</th>
            <th className="px-4 py-3">Vacating profit</th>
            <th className="px-4 py-3">Other charges</th>
            <th className="px-4 py-3">Deposits refunded</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5 text-apg-silver">
          {rows.map((row) => (
            <tr key={row.pgId} className="hover:bg-white/[0.02]">
              <td className="px-4 py-3">
                <Link
                  href={pgHref(row.pgId)}
                  className="font-medium text-white hover:text-[#FF5A1F]"
                >
                  {row.pgName}
                </Link>
                <p className="text-[11px] text-apg-silver">
                  {row.occupancyPct}% · {row.occupiedBeds}/{row.totalBeds} beds
                </p>
              </td>
              <td className="px-4 py-3 text-xs">
                Exp {paiseToInr(row.expectedMonthlyRentPaise)}/mo
              </td>
              <td className="px-4 py-3">
                <CollectionCell
                  total={row.incomeRentPaise}
                  qr={row.incomeRentQrPaise}
                  invoice={row.incomeRentInvoicePaise}
                />
              </td>
              <td className="px-4 py-3">
                <CollectionCell
                  total={row.incomeElectricityPaise}
                  qr={row.incomeElectricityQrPaise}
                  invoice={row.incomeElectricityInvoicePaise}
                />
              </td>
              <td className="px-4 py-3 font-semibold text-white">
                {paiseToInr(row.incomeTotalPaise)}
              </td>
              <td className="px-4 py-3">
                <Money paise={row.vacatingDeductionPaise} tone="profit" />
              </td>
              <td className="px-4 py-3">
                <Money paise={row.otherDeductionPaise + row.lateFeePaise} tone="charge" />
              </td>
              <td className="px-4 py-3">
                {row.depositRefundsCount > 0 ? (
                  <div>
                    <Money paise={row.depositRefundsPaise} tone="out" />
                    <p className="text-[11px] text-apg-silver">
                      {row.depositRefundsCount} resident{row.depositRefundsCount === 1 ? '' : 's'}
                    </p>
                  </div>
                ) : (
                  <span className="text-apg-silver">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
        {totals ? (
          <tfoot className="border-t border-white/10 bg-white/[0.03] text-sm font-semibold text-white">
            <tr>
              <td className="px-4 py-3" colSpan={2}>
                All PGs
              </td>
              <td className="px-4 py-3">
                <CollectionCell
                  total={totals.incomeRentPaise}
                  qr={totals.incomeRentQrPaise}
                  invoice={totals.incomeRentInvoicePaise}
                />
              </td>
              <td className="px-4 py-3">
                <CollectionCell
                  total={totals.incomeElectricityPaise}
                  qr={totals.incomeElectricityQrPaise}
                  invoice={totals.incomeElectricityInvoicePaise}
                />
              </td>
              <td className="px-4 py-3">{paiseToInr(totals.incomeTotalPaise)}</td>
              <td className="px-4 py-3">
                <Money paise={totals.vacatingDeductionPaise} tone="profit" />
              </td>
              <td className="px-4 py-3">
                <Money paise={totals.otherDeductionPaise + totals.lateFeePaise} tone="charge" />
              </td>
              <td className="px-4 py-3">
                <Money paise={totals.depositRefundsPaise} tone="out" />
                <p className="text-[11px] font-normal text-apg-silver">
                  {totals.depositRefundsCount} refunds
                </p>
              </td>
            </tr>
          </tfoot>
        ) : null}
      </table>
    </div>
  );
}
