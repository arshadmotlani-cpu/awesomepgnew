import {
  CalendarDays,
  Clock3,
  IndianRupee,
  PackageMinus,
  Receipt,
  UserCheck,
  Users,
  Wallet,
} from 'lucide-react';
import { KpiCard } from '@/src/hair/components/dashboard/KpiCard';
import { formatInrFromPaise } from '@/src/hair/lib/money';
import type { DashboardSnapshot } from '@/src/hair/services/dashboard';

function EmptyPanel({ message }: { message: string }) {
  return (
    <div className="flex min-h-[8rem] items-center justify-center rounded-xl border border-dashed border-[color:var(--fyh-border)] bg-black/10 px-4 text-center text-sm text-fyh-text-muted">
      {message}
    </div>
  );
}

export function SalonDashboard({ snapshot }: { snapshot: DashboardSnapshot }) {
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-fyh-accent">
            Command center
          </p>
          <h1 className="fyh-display mt-1 text-3xl font-semibold tracking-tight text-fyh-text">
            Dashboard
          </h1>
          <p className="mt-1 text-sm text-fyh-text-secondary">
            Today at a glance · {snapshot.totalCustomers} active customer
            {snapshot.totalCustomers === 1 ? '' : 's'}
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <KpiCard
          label="Today's Revenue"
          value={formatInrFromPaise(snapshot.todayRevenuePaise)}
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
          label="Pending Payments"
          value={String(snapshot.pendingPayments)}
          icon={Wallet}
          hint="Open bills"
        />
        <KpiCard
          label="Staff on schedule"
          value={String(snapshot.staffWorking)}
          icon={UserCheck}
          hint="Active stylists with appointments today (excl. leave)"
        />
        <KpiCard
          label="Low Stock Products"
          value={String(snapshot.lowStockProducts)}
          icon={PackageMinus}
          hint="Inventory alerts"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <section className="fyh-glass space-y-4 p-4 xl:col-span-1">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="fyh-display text-lg font-semibold">Today&apos;s Schedule</h2>
              <p className="text-xs text-fyh-text-muted">Live chair timeline</p>
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
                    <p className="text-fyh-text-muted">
                      {item.serviceLabel} · {item.staffName}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="tabular-nums text-fyh-accent">{item.timeLabel}</p>
                    <p className="text-xs text-fyh-text-muted">{item.status}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="fyh-glass space-y-4 p-4 xl:col-span-1">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="fyh-display text-lg font-semibold">Upcoming Appointments</h2>
              <p className="text-xs text-fyh-text-muted">Next on the book</p>
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
                  <p className="text-fyh-text-muted">{item.serviceLabel}</p>
                  <p className="mt-1 text-xs text-fyh-accent">{item.whenLabel}</p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="fyh-glass space-y-4 p-4 xl:col-span-1">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="fyh-display text-lg font-semibold">Recent Bills</h2>
              <p className="text-xs text-fyh-text-muted">Latest checkout activity</p>
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
                    <p className="text-xs text-fyh-text-muted">{bill.createdAtLabel}</p>
                  </div>
                  <div className="text-right">
                    <p className="tabular-nums font-medium text-fyh-accent">
                      {formatInrFromPaise(bill.amountPaise)}
                    </p>
                    <p className="text-xs text-fyh-text-muted">{bill.status}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
