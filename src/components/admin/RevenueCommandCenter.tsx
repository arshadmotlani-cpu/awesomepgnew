import Link from 'next/link';
import { OverviewStatCard } from '@/src/components/admin/OverviewStatCard';
import { IconCard, IconChart } from '@/src/components/admin/icons';
import { paiseToInr } from '@/src/lib/format';
import type { RevenueCommandCenterData } from '@/src/services/revenueCommandCenter';

function MoneyCell({ paise }: { paise: number }) {
  if (paise === 0) return <span className="text-apg-silver">—</span>;
  return <span className="font-medium text-emerald-300">{paiseToInr(paise)}</span>;
}

export function RevenueCommandCenter({
  data,
  monthLabel,
  pgHref = (pgId) => `/admin/revenue/pg/${pgId}`,
}: {
  data: RevenueCommandCenterData;
  monthLabel: string;
  pgHref?: (pgId: string) => string;
}) {
  const { today, mtd, byPg, outstanding } = data;

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-white">Revenue Command Center</h2>
        <p className="mt-1 text-sm text-apg-silver">
          Collections today and {monthLabel} — same totals as rent, electricity, and deposit
          screens.
        </p>
      </div>

      <div>
        <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-apg-silver">
          Collected today
        </p>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <OverviewStatCard
            label="Rent collected today"
            value={paiseToInr(today.rentPaise)}
            hint="QR + rent invoices paid today"
            icon={<IconCard />}
            accent="emerald"
          />
          <OverviewStatCard
            label="Electricity collected today"
            value={paiseToInr(today.electricityPaise)}
            hint="QR + electricity invoices paid today"
            icon={<IconChart />}
            accent="sky"
          />
          <OverviewStatCard
            label="Deposits collected today"
            value={paiseToInr(today.depositPaise)}
            hint="Deposit ledger entries today"
            icon={<IconCard />}
            accent="orange"
          />
          <OverviewStatCard
            label="Total collected today"
            value={paiseToInr(today.totalPaise)}
            hint="Rent + electricity + deposits"
            icon={<IconCard />}
            accent="indigo"
          />
        </div>
      </div>

      <div>
        <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-apg-silver">
          Month to date · {monthLabel}
        </p>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <OverviewStatCard
            label="Rent revenue"
            value={paiseToInr(mtd.rentPaise)}
            hint="Matches overview rent collected"
            icon={<IconCard />}
            accent="emerald"
          />
          <OverviewStatCard
            label="Electricity revenue"
            value={paiseToInr(mtd.electricityPaise)}
            hint="Matches overview electricity collected"
            icon={<IconChart />}
            accent="sky"
          />
          <OverviewStatCard
            label="Deposit revenue"
            value={paiseToInr(mtd.depositPaise)}
            hint="Deposit ledger collected this month"
            icon={<IconCard />}
            accent="orange"
          />
          <OverviewStatCard
            label="Total revenue"
            value={paiseToInr(mtd.totalPaise)}
            hint="Rent + electricity + deposits"
            icon={<IconCard />}
            accent="indigo"
          />
        </div>
      </div>

      {byPg.length > 0 ? (
        <div className="space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-white">Revenue by PG</h3>
            <p className="text-xs text-apg-silver">Sorted by total revenue · {monthLabel}</p>
          </div>
          <div className="overflow-x-auto rounded-2xl border border-white/10 bg-[#1A1F27]">
            <table className="min-w-full text-sm">
              <thead className="text-left text-[11px] uppercase tracking-wide text-apg-silver">
                <tr className="border-b border-white/10">
                  <th className="px-4 py-3">PG name</th>
                  <th className="px-4 py-3">Occupancy</th>
                  <th className="px-4 py-3">Rent revenue</th>
                  <th className="px-4 py-3">Electricity revenue</th>
                  <th className="px-4 py-3">Deposit revenue</th>
                  <th className="px-4 py-3">Total revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-apg-silver">
                {byPg.map((row) => (
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
                      <MoneyCell paise={row.rentRevenuePaise} />
                    </td>
                    <td className="px-4 py-3">
                      <MoneyCell paise={row.electricityRevenuePaise} />
                    </td>
                    <td className="px-4 py-3">
                      <MoneyCell paise={row.depositRevenuePaise} />
                    </td>
                    <td className="px-4 py-3 font-semibold text-white">
                      {paiseToInr(row.totalRevenuePaise)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <div className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-white">Outstanding money</h3>
          <p className="text-xs text-apg-silver">
            Unpaid invoices and payment proofs awaiting approval
          </p>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <OutstandingCard
            label="Pending rent invoices"
            count={outstanding.pendingRentInvoices}
            amountPaise={outstanding.pendingRentInvoicesPaise}
            href="/admin/rent"
            linkLabel="Rent management →"
          />
          <OutstandingCard
            label="Pending electricity invoices"
            count={outstanding.pendingElectricityInvoices}
            amountPaise={outstanding.pendingElectricityInvoicesPaise}
            href="/admin/electricity"
            linkLabel="Electricity billing →"
          />
          <OutstandingCard
            label="Pending payment approvals"
            count={outstanding.pendingPaymentApprovals}
            amountPaise={outstanding.pendingPaymentApprovalsPaise}
            href="/admin/payments"
            linkLabel="Collections queue →"
          />
          <div className="rounded-xl border border-[#FF5A1F]/30 bg-[#FF5A1F]/5 p-4">
            <p className="text-[10px] font-medium uppercase tracking-wide text-orange-300">
              Total outstanding
            </p>
            <p className="mt-2 text-2xl font-semibold tracking-tight text-white">
              {paiseToInr(outstanding.totalOutstandingPaise)}
            </p>
            <p className="mt-1 text-xs text-apg-silver">
              Rent + electricity + awaiting approval
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function OutstandingCard({
  label,
  count,
  amountPaise,
  href,
  linkLabel,
}: {
  label: string;
  count: number;
  amountPaise: number;
  href: string;
  linkLabel: string;
}) {
  return (
    <div className="flex min-h-[140px] flex-col rounded-xl border border-white/10 bg-[#1A1F27] p-4">
      <p className="text-[10px] font-medium uppercase tracking-wide text-apg-silver">{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight text-white">{count}</p>
      <p className="mt-1 text-sm font-medium text-amber-300">{paiseToInr(amountPaise)}</p>
      <Link
        href={href}
        className="mt-auto pt-3 text-xs font-medium text-[#FF5A1F] hover:text-orange-300"
      >
        {linkLabel}
      </Link>
    </div>
  );
}
