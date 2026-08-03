'use client';

import {
  Banknote,
  CalendarDays,
  CreditCard,
  IndianRupee,
  Receipt,
  Smartphone,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react';
import {
  CategoryBarChart,
  HourlyRevenueChart,
  PaymentMethodDonut,
  RevenueByStaffChart,
  RevenueTrend12Chart,
  RevenueTrend30Chart,
} from '@/src/hair/components/dashboard/RevenueCharts';
import {
  ChartPanel,
  DashboardShell,
  HeroKpi,
  SegmentCardUi,
} from '@/src/hair/components/dashboard/DashboardShell';
import { formatInrFromPaise } from '@/src/hair/lib/money';
import type { RevenueDashboardSnapshot } from '@/src/hair/services/revenueDashboard';

function BreakdownRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[color:var(--fyh-border)] py-3 text-sm last:border-0">
      <span className="text-fyh-text-secondary">{label}</span>
      <span className="tabular-nums font-semibold text-fyh-text">{value}</span>
    </div>
  );
}

export function RevenueDashboard({ data }: { data: RevenueDashboardSnapshot }) {
  return (
    <DashboardShell
      eyebrow="Live intelligence"
      title="Revenue Dashboard"
      subtitle="CEO view · business health, collections, and revenue analytics"
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5">
        <HeroKpi label="Today's Revenue" value={formatInrFromPaise(data.todayRevenuePaise)} icon={IndianRupee} accent />
        <HeroKpi label="MTD Revenue" value={formatInrFromPaise(data.mtdRevenuePaise)} icon={TrendingUp} />
        <HeroKpi label="Outstanding Receivables" value={formatInrFromPaise(data.outstandingDuePaise)} icon={Wallet} />
        <HeroKpi label="Advance Liability" value={formatInrFromPaise(data.advanceLiabilityPaise)} icon={Wallet} />
        <HeroKpi label="Cash Collected" value={formatInrFromPaise(data.cashCollectedPaise)} icon={Banknote} />
        <HeroKpi label="UPI Collected" value={formatInrFromPaise(data.upiCollectedPaise)} icon={Smartphone} />
        <HeroKpi label="Card Collected" value={formatInrFromPaise(data.cardCollectedPaise)} icon={CreditCard} />
        <HeroKpi label="Wallet Balance" value={formatInrFromPaise(data.walletBalancePaise)} icon={Wallet} />
        <HeroKpi label="Average Bill" value={formatInrFromPaise(data.averageBillTodayPaise)} icon={Receipt} />
        <HeroKpi label="Invoices Today" value={String(data.invoicesToday)} icon={Receipt} />
        <HeroKpi label="Appointments Today" value={String(data.appointmentsToday)} icon={CalendarDays} />
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <ChartPanel title="Revenue trend · 30 days" subtitle="Paid invoice revenue">
          <RevenueTrend30Chart data={data.trend30Days} />
        </ChartPanel>
        <ChartPanel title="Revenue trend · 12 months" subtitle="Monthly rollup">
          <RevenueTrend12Chart data={data.trend12Months} />
        </ChartPanel>
        <ChartPanel title="Revenue by staff" subtitle="MTD attributed net">
          <RevenueByStaffChart data={data.revenueByStaff} />
        </ChartPanel>
        <ChartPanel title="Revenue by category" subtitle="Service categories">
          <CategoryBarChart data={data.revenueByCategory} />
        </ChartPanel>
        <ChartPanel title="Payment method breakdown" subtitle="MTD collections">
          <PaymentMethodDonut data={data.paymentMethodBreakdown} />
        </ChartPanel>
        <ChartPanel title="Hourly revenue" subtitle="Today by hour">
          <HourlyRevenueChart data={data.hourlyRevenueToday} />
        </ChartPanel>
      </div>

      <section className="space-y-4">
        <h2 className="fyh-card-title">Business health</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          <HeroKpi label="Customers Today" value={String(data.customersToday)} icon={Users} />
          <HeroKpi label="Repeat Customers" value={String(data.repeatCustomersToday)} />
          <HeroKpi label="New Customers" value={String(data.newCustomersToday)} />
          <HeroKpi label="Conversion" value={`${data.appointmentConversionPct}%`} />
          <HeroKpi label="Cancellation Rate" value={`${data.cancellationRatePct}%`} />
          <HeroKpi label="No-show Rate" value={`${data.noShowRatePct}%`} />
          <HeroKpi label="Avg Customer Spend" value={formatInrFromPaise(data.averageCustomerSpendPaise)} />
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-2">
        <section className="fyh-dashboard-card p-5">
          <h2 className="fyh-card-title">Revenue breakdown</h2>
          <div className="mt-4">
            <BreakdownRow label="Services" value={formatInrFromPaise(data.servicesRevenuePaise)} />
            <BreakdownRow label="Products" value={formatInrFromPaise(data.productsRevenuePaise)} />
            <BreakdownRow label="Membership" value={formatInrFromPaise(data.membershipRevenuePaise)} />
            <BreakdownRow label="Packages" value={formatInrFromPaise(data.packagesRevenuePaise)} />
            <BreakdownRow label="Gift cards" value={formatInrFromPaise(data.giftCardsRevenuePaise)} />
            <BreakdownRow label="Refunds" value={formatInrFromPaise(data.refundsPaise)} />
            <BreakdownRow label="Discounts" value={formatInrFromPaise(data.discountsPaise)} />
            <BreakdownRow label="Net revenue" value={formatInrFromPaise(data.netRevenuePaise)} />
            <BreakdownRow label="Gross revenue" value={formatInrFromPaise(data.grossRevenuePaise)} />
          </div>
        </section>

        <section className="fyh-dashboard-card p-5">
          <h2 className="fyh-card-title">Top services & products</h2>
          <div className="mt-4 grid gap-6 sm:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-fyh-text-muted">Services</p>
              <ul className="mt-2 space-y-2 text-sm">
                {(data.topServices ?? []).slice(0, 5).map((s) => (
                  <li key={s.id} className="flex justify-between gap-2">
                    <span className="truncate text-fyh-text-secondary">{s.name}</span>
                    <span className="tabular-nums text-fyh-forest">{formatInrFromPaise(s.revenuePaise)}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-fyh-text-muted">Products</p>
              <ul className="mt-2 space-y-2 text-sm">
                {(data.topProducts ?? []).slice(0, 5).map((p) => (
                  <li key={p.id} className="flex justify-between gap-2">
                    <span className="truncate text-fyh-text-secondary">{p.name}</span>
                    <span className="tabular-nums text-fyh-forest">{formatInrFromPaise(p.revenuePaise)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      </div>

      {(data.segmentCards ?? []).length > 0 ? (
        <section className="space-y-4">
          <h2 className="fyh-card-title">Category performance</h2>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {(data.segmentCards ?? []).map((card) => (
              <SegmentCardUi
                key={card.category}
                title={card.category}
                revenue={formatInrFromPaise(card.revenuePaise)}
                growth={card.growthPct != null ? `${card.growthPct > 0 ? '+' : ''}${card.growthPct}%` : null}
                sparkline={card.sparkline}
              />
            ))}
          </div>
        </section>
      ) : null}
    </DashboardShell>
  );
}
