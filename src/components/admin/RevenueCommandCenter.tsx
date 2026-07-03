import Link from 'next/link';
import { OverviewStatCard } from '@/src/components/admin/OverviewStatCard';
import { IconCard, IconChart } from '@/src/components/admin/icons';
import { paiseToInr } from '@/src/lib/format';
import type { RevenueCommandCenterData } from '@/src/services/revenueCommandCenter';

function MoneyCell({ paise, tone }: { paise: number; tone?: 'charge' }) {
  if (paise === 0) return <span className="text-apg-silver">—</span>;
  const cls = tone === 'charge' ? 'text-amber-300' : 'text-emerald-300';
  return <span className={`font-medium ${cls}`}>{paiseToInr(paise)}</span>;
}

function DepositRevenueCell({
  paise,
  paidCount,
  pendingCount,
  missingCount,
  href,
}: {
  paise: number;
  paidCount: number;
  pendingCount: number;
  missingCount: number;
  href: string;
}) {
  if (paise === 0 && paidCount === 0 && pendingCount === 0 && missingCount === 0) {
    return <span className="text-apg-silver">—</span>;
  }
  return (
    <Link href={href} className="group block rounded-lg px-1 py-0.5 hover:bg-white/5">
      <span className="font-medium text-emerald-300 group-hover:text-emerald-200">
        {paiseToInr(paise)}
      </span>
      <span className="mt-0.5 block text-[10px] text-apg-silver group-hover:text-white">
        {paidCount} paid · {pendingCount} pending
        {missingCount > 0 ? ` · ${missingCount} missing req.` : ''}
      </span>
    </Link>
  );
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
  const { today, mtd, byPg, outstanding, depositPortfolio, billingMetrics, collectionsByMode } =
    data;
  const totalDepositPaid = byPg.reduce((a, r) => a + r.depositPaidCount, 0);
  const totalDepositPending = byPg.reduce((a, r) => a + r.depositPendingCount, 0);

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-white">Revenue Command Center</h2>
        <p className="mt-1 text-sm text-apg-silver">
          Read-only view — all totals come from the financial engine for {monthLabel}.
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
            label="Deposits collected"
            value={paiseToInr(mtd.depositPaise)}
            hint={`${totalDepositPaid} paid · ${totalDepositPending} pending · cash flow, not revenue`}
            icon={<IconCard />}
            accent="orange"
            href={`/admin/deposits/collected?month=${data.billingMonth}`}
          />
          <OverviewStatCard
            label="Operating revenue"
            value={paiseToInr(mtd.totalPaise)}
            hint="Rent + late fees + electricity + other income"
            icon={<IconCard />}
            accent="indigo"
          />
        </div>
      </div>

      <div>
        <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-apg-silver">
          Collections by payment mode · {monthLabel}
        </p>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <OverviewStatCard
            label="UPI"
            value={paiseToInr(collectionsByMode.upiPaise)}
            hint="QR, Razorpay, manual UPI"
            icon={<IconCard />}
            accent="sky"
          />
          <OverviewStatCard
            label="Cash"
            value={paiseToInr(collectionsByMode.cashPaise)}
            hint="Reception cash collections"
            icon={<IconCard />}
            accent="emerald"
          />
          <OverviewStatCard
            label="Bank transfer"
            value={paiseToInr(collectionsByMode.bankTransferPaise)}
            hint="NEFT / IMPS / bank"
            icon={<IconCard />}
            accent="indigo"
          />
          <OverviewStatCard
            label="Other"
            value={paiseToInr(collectionsByMode.otherPaise)}
            hint="Mock / legacy adapters"
            icon={<IconCard />}
            accent="orange"
          />
          <OverviewStatCard
            label="All modes"
            value={paiseToInr(collectionsByMode.totalPaise)}
            hint="Payment ledger MTD"
            icon={<IconChart />}
            accent="emerald"
          />
        </div>
      </div>

      <div>
        <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-apg-silver">
          Billing cycle · {monthLabel}
        </p>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <OverviewStatCard
            label="Rent generated"
            value={paiseToInr(billingMetrics.rent.generatedPaise)}
            hint="Invoices issued this month"
            icon={<IconCard />}
            accent="amber"
          />
          <OverviewStatCard
            label="Rent collected"
            value={paiseToInr(billingMetrics.rent.collectedPaise)}
            hint="Matches MTD rent revenue"
            icon={<IconCard />}
            accent="emerald"
          />
          <OverviewStatCard
            label="Rent pending"
            value={paiseToInr(billingMetrics.rent.pendingPaise)}
            hint={`${outstanding.pendingRentInvoices} open invoices`}
            icon={<IconChart />}
            accent="orange"
            href="/admin/billing?tab=billing"
          />
          <OverviewStatCard
            label="Rent overdue"
            value={paiseToInr(billingMetrics.rent.overduePaise)}
            hint="Past due date"
            icon={<IconChart />}
            accent="rose"
            href="/admin/billing?tab=billing"
          />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <OverviewStatCard
            label="Electricity generated"
            value={paiseToInr(billingMetrics.electricity.generatedPaise)}
            hint="Bills issued this month"
            icon={<IconChart />}
            accent="amber"
          />
          <OverviewStatCard
            label="Electricity collected"
            value={paiseToInr(billingMetrics.electricity.collectedPaise)}
            hint="Matches MTD electricity revenue"
            icon={<IconChart />}
            accent="emerald"
          />
          <OverviewStatCard
            label="Electricity pending"
            value={paiseToInr(billingMetrics.electricity.pendingPaise)}
            hint={`${outstanding.pendingElectricityInvoices} open invoices`}
            icon={<IconCard />}
            accent="orange"
            href="/admin/billing?tab=electricity"
          />
          <OverviewStatCard
            label="Expected vs collected"
            value={paiseToInr(billingMetrics.collectedRevenuePaise)}
            hint={`of ${paiseToInr(billingMetrics.expectedRevenuePaise)} generated rent + electricity`}
            icon={<IconCard />}
            accent="indigo"
          />
        </div>
      </div>

      <div>
        <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-apg-silver">
          Deposit ledger · {monthLabel}
        </p>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <OverviewStatCard
            label="Deposits collected (MTD)"
            value={paiseToInr(mtd.depositPaise)}
            hint="Ledger collected entries this month"
            icon={<IconCard />}
            accent="orange"
            href={`/admin/deposits/collected?month=${data.billingMonth}`}
          />
          <OverviewStatCard
            label="Deposits refunded (MTD)"
            value={paiseToInr(mtd.depositRefundedPaise)}
            hint="Ledger refund entries this month"
            icon={<IconChart />}
            accent="rose"
          />
          <OverviewStatCard
            label="Deposits held (liability)"
            value={paiseToInr(depositPortfolio.heldPaise)}
            hint="Current refundable balances"
            icon={<IconCard />}
            accent="amber"
            href="/admin/deposits"
          />
          <OverviewStatCard
            label="Net inflow (MTD)"
            value={paiseToInr(mtd.netInflowPaise)}
            hint="Rent + deposits collected − refunds"
            icon={<IconChart />}
            accent="emerald"
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
                  <th className="px-4 py-3">PG</th>
                  <th className="px-4 py-3">Occupancy</th>
                  <th className="px-4 py-3">Rent revenue</th>
                  <th className="px-4 py-3">Electricity revenue</th>
                  <th className="px-4 py-3">Deposits collected</th>
                  <th className="px-4 py-3">Late fees</th>
                  <th className="px-4 py-3">Operating revenue</th>
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
                      <DepositRevenueCell
                        paise={row.depositCollectedPaise}
                        paidCount={row.depositPaidCount}
                        pendingCount={row.depositPendingCount}
                        missingCount={row.depositRequirementMissingCount}
                        href={`/admin/deposits/collected?pgId=${row.pgId}&month=${data.billingMonth}`}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <MoneyCell paise={row.lateFeePaise} tone="charge" />
                    </td>
                    <td className="px-4 py-3 font-semibold text-white">
                      {paiseToInr(row.totalRevenuePaise)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-white/10 bg-white/[0.03] text-sm font-semibold text-white">
                <tr>
                  <td className="px-4 py-3" colSpan={2}>
                    All PGs
                  </td>
                  <td className="px-4 py-3">
                    <MoneyCell paise={mtd.rentPaise} />
                  </td>
                  <td className="px-4 py-3">
                    <MoneyCell paise={mtd.electricityPaise} />
                  </td>
                  <td className="px-4 py-3">
                    <MoneyCell paise={mtd.depositPaise} />
                  </td>
                  <td className="px-4 py-3">
                    <MoneyCell paise={mtd.lateFeePaise} tone="charge" />
                  </td>
                  <td className="px-4 py-3">{paiseToInr(mtd.totalPaise)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      ) : null}

      <div className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-white">Outstanding money</h3>
          <p className="text-xs text-apg-silver">
            Unpaid invoices — screenshot review is under Operations → Payment reviews
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
            href="/admin/electricity/dashboard"
            linkLabel="Electricity billing →"
          />
          <OutstandingCard
            label="Pending payment approvals"
            count={outstanding.pendingPaymentApprovals}
            amountPaise={outstanding.pendingPaymentApprovalsPaise}
            href="/admin/operations?filter=waiting_for_approval"
            linkLabel="Operations payment reviews →"
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
