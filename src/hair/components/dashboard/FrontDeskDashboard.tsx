import Link from 'next/link';
import type { DashboardSnapshot } from '@/src/hair/services/dashboard';
import { formatInrFromPaise } from '@/src/hair/lib/money';

export function FrontDeskDashboard({ data }: { data: DashboardSnapshot }) {
  return (
    <div className="space-y-6">
      <div>
        <p className="fyh-section-eyebrow">Front desk</p>
        <h1 className="fyh-display mt-1 text-3xl font-semibold">Today</h1>
        <p className="mt-1 text-sm text-fyh-text-secondary">
          Appointments, collections, and quick links for reception.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Today's collections" value={formatInrFromPaise(data.todayRevenuePaise)} />
        <StatCard label="Appointments today" value={String(data.todayAppointments)} />
        <StatCard label="Customers in salon" value={String(data.customersInSalon)} />
        <StatCard label="Pending payments" value={String(data.pendingPayments)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="fyh-glass p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-fyh-text">Today&apos;s schedule</h2>
            <Link href="/appointments" className="text-sm text-fyh-accent hover:underline">
              View all
            </Link>
          </div>
          {data.todaysSchedule.length === 0 ? (
            <p className="mt-4 text-sm text-fyh-text-muted">No appointments scheduled today.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {data.todaysSchedule.slice(0, 8).map((item) => (
                <li key={item.id} className="flex items-start justify-between gap-3 text-sm">
                  <div>
                    <p className="font-medium text-fyh-text">{item.customerName}</p>
                    <p className="text-fyh-text-secondary">
                      {item.serviceLabel} · {item.staffName}
                    </p>
                  </div>
                  <span className="shrink-0 text-fyh-text-muted">{item.timeLabel}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="fyh-glass p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-fyh-text">Recent bills</h2>
            <Link href="/billing/invoices" className="text-sm text-fyh-accent hover:underline">
              Invoices
            </Link>
          </div>
          {data.recentBills.length === 0 ? (
            <p className="mt-4 text-sm text-fyh-text-muted">No bills recorded today yet.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {data.recentBills.slice(0, 8).map((bill) => (
                <li key={bill.id} className="flex items-start justify-between gap-3 text-sm">
                  <div>
                    <p className="font-medium text-fyh-text">{bill.customerName}</p>
                    <p className="text-fyh-text-secondary">{bill.createdAtLabel}</p>
                  </div>
                  <span className="shrink-0 font-medium text-fyh-text">
                    {formatInrFromPaise(bill.amountPaise)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="flex flex-wrap gap-3">
        <QuickLink href="/customers/new" label="New customer" />
        <QuickLink href="/appointments" label="Book appointment" />
        <QuickLink href="/billing/invoices" label="Invoices" />
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="fyh-glass p-4">
      <p className="text-xs uppercase tracking-wide text-fyh-text-muted">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-fyh-text">{value}</p>
    </div>
  );
}

function QuickLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="rounded-lg border border-[color:var(--fyh-border)] px-4 py-2 text-sm font-medium text-fyh-text hover:bg-[color:var(--fyh-surface-muted)]"
    >
      {label}
    </Link>
  );
}
