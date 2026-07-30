import {
  Banknote,
  CalendarDays,
  Clock3,
  CreditCard,
  IndianRupee,
  PackageMinus,
  Receipt,
  Smartphone,
  TrendingUp,
  UserCheck,
  Users,
  Wallet,
} from 'lucide-react';
import { DailyClosingPanel } from '@/src/hair/components/dashboard/DailyClosingPanel';
import { KpiCard } from '@/src/hair/components/dashboard/KpiCard';
import { formatInrFromPaise } from '@/src/hair/lib/money';
import type { DashboardSnapshot } from '@/src/hair/services/dashboard';
import type {
  DailyClosingSnapshot,
  FinancialDashboardSnapshot,
  TopRevenueItem,
} from '@/src/hair/services/financialDashboard';

function EmptyPanel({ message }: { message: string }) {
  return (
    <div className="flex min-h-[8rem] items-center justify-center rounded-xl border border-dashed border-[color:var(--fyh-border)] bg-black/10 px-4 text-center text-sm text-fyh-text-secondary">
      {message}
    </div>
  );
}

function TopList({ title, items, emptyMessage }: { title: string; items: TopRevenueItem[]; emptyMessage: string }) {
  return (
    <div className="space-y-3">
      <h3 className="fyh-card-title">{title}</h3>
      {items.length === 0 ? (
        <p className="text-sm text-fyh-text-muted">{emptyMessage}</p>
      ) : (
        <ul className="divide-y divide-[color:var(--fyh-border)]">
          {items.map((item, idx) => (
            <li key={item.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <span className="text-fyh-text-secondary tabular-nums w-5">{idx + 1}.</span>
              <span className="flex-1 truncate font-medium text-fyh-text">{item.name}</span>
              <span className="tabular-nums font-semibold text-fyh-accent">{formatInrFromPaise(item.revenuePaise)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function MonthlyTrendChart({ points }: { points: FinancialDashboardSnapshot['monthlyTrend'] }) {
  const max = Math.max(1, ...points.map((p) => p.revenuePaise));

  return (
    <div className="space-y-3">
      <div className="flex items-end gap-[2px] h-24">
        {points.map((p) => {
          const heightPct = Math.max(2, Math.round((p.revenuePaise / max) * 100));
          return (
            <div
              key={p.dayKey}
              className="group relative flex-1 min-w-0"
              title={`${p.dayKey}: ${formatInrFromPaise(p.revenuePaise)}`}
            >
              <div
                className="mx-auto w-full max-w-[10px] rounded-t bg-fyh-accent transition-colors group-hover:bg-fyh-accent-soft"
                style={{ height: `${heightPct}%` }}
              />
            </div>
          );
        })}
      </div>
      <div className="flex justify-between text-xs text-fyh-text-muted">
        <span>{points[0]?.dayKey.slice(5)}</span>
        <span>Last 30 days revenue</span>
        <span>{points[points.length - 1]?.dayKey.slice(5)}</span>
      </div>
    </div>
  );
}

export function SalonDashboard({
  snapshot,
  financial,
  dailyClosing,
}: {
  snapshot: DashboardSnapshot;
  financial: FinancialDashboardSnapshot;
  dailyClosing: DailyClosingSnapshot;
}) {
  const { collectionsVsSales, todayCollectionsByMethod } = financial;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="fyh-section-eyebrow">Command center</p>
          <h1 className="fyh-display mt-2 text-3xl font-semibold tracking-tight text-fyh-text">
            Dashboard
          </h1>
          <p className="mt-2 text-base text-fyh-text-secondary">
            Today at a glance · {snapshot.totalCustomers} active customer
            {snapshot.totalCustomers === 1 ? '' : 's'} · {financial.todaySalesCount} sale
            {financial.todaySalesCount === 1 ? '' : 's'} today
          </p>
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <KpiCard
          label="Today's Revenue"
          value={formatInrFromPaise(financial.todayRevenuePaise)}
          icon={IndianRupee}
          accent
          hint="Paid invoices today"
        />
        <KpiCard
          label="Today's Appointments"
          value={String(snapshot.todayAppointments)}
          icon={CalendarDays}
          hint="Booked for today"
        />
        <KpiCard
          label="Customers in Salon"
          value={String(snapshot.customersInSalon)}
          icon={Users}
          hint="Checked in now"
        />
        <KpiCard
          label="Outstanding Due"
          value={formatInrFromPaise(financial.outstandingDuePaise)}
          icon={Wallet}
          hint="Open receivables"
        />
        <KpiCard
          label="Advance Liability"
          value={formatInrFromPaise(financial.advanceLiabilityPaise)}
          icon={TrendingUp}
          hint="Wallet credits outstanding"
        />
        <KpiCard
          label="Low Stock Products"
          value={String(snapshot.lowStockProducts)}
          icon={PackageMinus}
          hint="Inventory alerts"
        />
      </div>

      <div className="grid gap-5 sm:grid-cols-3">
        <KpiCard
          label="Cash Collected"
          value={formatInrFromPaise(todayCollectionsByMethod.cash)}
          icon={Banknote}
          hint="Ledger payments today"
        />
        <KpiCard
          label="UPI Collected"
          value={formatInrFromPaise(todayCollectionsByMethod.upi)}
          icon={Smartphone}
          hint="Ledger payments today"
        />
        <KpiCard
          label="Card Collected"
          value={formatInrFromPaise(todayCollectionsByMethod.card)}
          icon={CreditCard}
          hint="Ledger payments today"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <section className="fyh-glass space-y-5 p-5 xl:col-span-2">
          <div>
            <h2 className="fyh-card-title">Collections vs Sales</h2>
            <p className="mt-1 text-sm text-fyh-text-muted">
              Tender received today compared to invoice revenue booked today
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-[color:var(--fyh-border)] bg-black/10 p-4">
              <p className="fyh-kpi-label">Collections</p>
              <p className="fyh-metric-value mt-2 text-fyh-accent">
                {formatInrFromPaise(collectionsVsSales.collectionsTodayPaise)}
              </p>
            </div>
            <div className="rounded-xl border border-[color:var(--fyh-border)] bg-black/10 p-4">
              <p className="fyh-kpi-label">Sales</p>
              <p className="fyh-metric-value mt-2">
                {formatInrFromPaise(collectionsVsSales.salesTodayPaise)}
              </p>
            </div>
            <div className="rounded-xl border border-[color:var(--fyh-border)] bg-black/10 p-4">
              <p className="fyh-kpi-label">Variance</p>
              <p className="fyh-metric-value mt-2">
                {formatInrFromPaise(collectionsVsSales.variancePaise)}
              </p>
            </div>
          </div>
          <MonthlyTrendChart points={financial.monthlyTrend} />
        </section>

        <section className="fyh-glass space-y-5 p-5">
          <div>
            <h2 className="fyh-card-title">Top Performers Today</h2>
            <p className="mt-1 text-sm text-fyh-text-muted">Attributed net revenue</p>
          </div>
          <TopList title="Services" items={financial.topServicesToday} emptyMessage="No service sales yet today." />
          <TopList title="Products" items={financial.topProductsToday} emptyMessage="No product sales yet today." />
          <TopList title="Staff" items={financial.topStaffToday} emptyMessage="No staff attribution yet today." />
        </section>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <section className="fyh-glass space-y-5 p-5 xl:col-span-1">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="fyh-card-title">Today&apos;s Schedule</h2>
              <p className="mt-1 text-sm text-fyh-text-muted">Live chair timeline</p>
            </div>
            <Clock3 className="h-4 w-4 text-fyh-accent" />
          </div>
          {snapshot.todaysSchedule.length === 0 ? (
            <EmptyPanel message="No appointments scheduled for today yet." />
          ) : (
            <ul className="divide-y divide-[color:var(--fyh-border)]">
              {snapshot.todaysSchedule.map((item) => (
                <li key={item.id} className="flex items-start justify-between gap-3 py-3 text-sm">
                  <div>
                    <p className="font-medium text-fyh-text">{item.customerName}</p>
                    <p className="text-sm text-fyh-text-secondary">
                      {item.serviceLabel} · {item.staffName}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="tabular-nums font-semibold text-fyh-accent">{item.timeLabel}</p>
                    <p className="text-sm text-fyh-text-muted">{item.status}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="fyh-glass space-y-5 p-5 xl:col-span-1">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="fyh-card-title">Upcoming Appointments</h2>
              <p className="mt-1 text-sm text-fyh-text-muted">Next on the book</p>
            </div>
            <CalendarDays className="h-4 w-4 text-fyh-accent" />
          </div>
          {snapshot.upcomingAppointments.length === 0 ? (
            <EmptyPanel message="Upcoming bookings will appear here." />
          ) : (
            <ul className="divide-y divide-[color:var(--fyh-border)]">
              {snapshot.upcomingAppointments.map((item) => (
                <li key={item.id} className="py-3 text-sm">
                  <p className="font-medium text-fyh-text">{item.customerName}</p>
                  <p className="text-sm text-fyh-text-secondary">{item.serviceLabel}</p>
                  <p className="mt-1 text-sm font-medium text-fyh-accent">{item.whenLabel}</p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="fyh-glass space-y-5 p-5 xl:col-span-1">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="fyh-card-title">Recent Bills</h2>
              <p className="mt-1 text-sm text-fyh-text-muted">Latest checkout activity</p>
            </div>
            <Receipt className="h-4 w-4 text-fyh-accent" />
          </div>
          {snapshot.recentBills.length === 0 ? (
            <EmptyPanel message="No bills yet." />
          ) : (
            <ul className="divide-y divide-[color:var(--fyh-border)]">
              {snapshot.recentBills.map((bill) => (
                <li key={bill.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                  <div>
                    <p className="font-medium text-fyh-text">{bill.customerName}</p>
                    <p className="text-sm text-fyh-text-muted">{bill.createdAtLabel}</p>
                  </div>
                  <div className="text-right">
                    <p className="tabular-nums font-semibold text-fyh-accent">
                      {formatInrFromPaise(bill.amountPaise)}
                    </p>
                    <p className="text-sm text-fyh-text-muted">{bill.status}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <DailyClosingPanel closing={dailyClosing} />
        <section className="fyh-glass space-y-5 p-5">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="fyh-card-title">Operations</h2>
              <p className="mt-1 text-sm text-fyh-text-muted">Salon floor snapshot</p>
            </div>
            <UserCheck className="h-4 w-4 text-fyh-accent" />
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <KpiCard
              label="Pending Payments"
              value={String(snapshot.pendingPayments)}
              icon={Wallet}
              hint="Open bills"
            />
            <KpiCard
              label="Staff on schedule"
              value={String(snapshot.staffWorking)}
              icon={UserCheck}
              hint="Active stylists with appointments today"
            />
          </div>
        </section>
      </div>
    </div>
  );
}
