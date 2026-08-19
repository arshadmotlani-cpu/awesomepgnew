import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { KpiCard } from '@/src/hair/components/dashboard/KpiCard';
import { formatInrFromPaise } from '@/src/hair/lib/money';
import { salonDayBounds, salonMonthStartUtc } from '@/src/hair/lib/salonTime';
import { getStaffById } from '@/src/hair/services/staff';
import { getSalonSettings } from '@/src/hair/services/settings';
import { getTenantContextForPage } from '@/src/hair/lib/tenant/getTenantContext';
import {
  getStaffCommissionInRange,
  getStaffCommissionTotals,
  getStaffDetailPerformance,
  getStaffMonthlyTrend,
  getStaffRecentInvoices,
  getStaffTargetProgress,
  getStaffTopCatalogItems,
  getStaffWorkingDays,
} from '@/src/hair/services/staffPerformance';
import { CalendarDays, IndianRupee, Receipt, Target, Wallet } from 'lucide-react';
import { getHairSession } from '@/src/hair/lib/auth/session';
import { getEmployeeDashboard } from '@/src/workforce/brains/employeeBrain';
import { hasWorkforcePermission } from '@/src/workforce/permissions/resolve';
import { isWorkforceEngineEnabled } from '@/src/workforce/types';

type Props = { params: Promise<{ id: string }> };

export default async function StaffPerformancePage({ params }: Props) {
  const { id } = await params;
  const ctx = await getTenantContextForPage();

  // Staff may only open their own performance page under Workforce.
  if (isWorkforceEngineEnabled()) {
    const session = await getHairSession();
    if (session?.workforceEmployeeId) {
      const dash = await getEmployeeDashboard(session.workforceEmployeeId, 'fyh_salon');
      const grants = dash?.grants;
      if (
        grants &&
        !hasWorkforcePermission(grants, 'staff.view') &&
        !hasWorkforcePermission(grants, 'dashboard.view_staff') &&
        session.workforceEmployeeId !== id
      ) {
        redirect(`/staff/${session.workforceEmployeeId}/performance`);
      }
    }
  }

  const staff = await getStaffById(id);
  if (!staff) notFound();

  const settings = await getSalonSettings(ctx);
  const tz = settings.timezone?.trim() || 'Asia/Kolkata';
  const { end } = salonDayBounds(tz);
  const from = salonMonthStartUtc(tz);
  const range = { from, to: end };

  const [detail, trend, target, commissions, rangedCommission, topServices, topProducts, workingDays, recent] =
    await Promise.all([
      getStaffDetailPerformance(id, range),
      getStaffMonthlyTrend(id, 6, tz),
      getStaffTargetProgress(id, range),
      getStaffCommissionTotals(id),
      getStaffCommissionInRange(id, range),
      getStaffTopCatalogItems(id, range, 'service', 8),
      getStaffTopCatalogItems(id, range, 'product', 8),
      getStaffWorkingDays(id, range),
      getStaffRecentInvoices(id, range, 12),
    ]);

  const maxTrend = Math.max(...trend.map((t) => t.revenuePaise), 1);
  const targetPct = (target.progressBps / 100).toFixed(0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="fyh-section-eyebrow">Team</p>
          <h1 className="fyh-display mt-1 text-3xl font-semibold">{staff.fullName}</h1>
          <p className="mt-1 text-sm text-fyh-text-secondary">
            Performance this month · attributed net (before tax)
          </p>
        </div>
        <div className="flex flex-wrap gap-3 text-sm">
          <Link
            href="/dashboard/staff-performance"
            className="text-fyh-accent underline-offset-2 hover:underline"
          >
            Command center
          </Link>
          <Link href="/staff" className="text-fyh-accent underline-offset-2 hover:underline">
            ← All staff
          </Link>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard
          label="Total revenue"
          value={formatInrFromPaise(detail.totalRevenuePaise)}
          icon={IndianRupee}
          accent
          hint="All attributed categories"
        />
        <KpiCard
          label="Invoices"
          value={String(detail.invoiceCount)}
          icon={Receipt}
          hint="Distinct paid bills"
        />
        <KpiCard
          label="Avg ticket"
          value={formatInrFromPaise(detail.avgTicketPaise)}
          icon={Wallet}
          hint="Revenue ÷ invoice count"
        />
        <KpiCard
          label="Working days"
          value={String(workingDays)}
          icon={CalendarDays}
          hint="Distinct paid days this month"
        />
        <KpiCard
          label="Commission (MTD)"
          value={formatInrFromPaise(rangedCommission.totalPaise)}
          icon={Target}
          hint={`Pending ${formatInrFromPaise(rangedCommission.pendingPaise)} · all-time paid ${formatInrFromPaise(commissions.paidPaise)}`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="fyh-glass space-y-4 p-5">
          <h2 className="text-sm font-medium uppercase tracking-wide text-fyh-text-muted">
            Revenue breakdown
          </h2>
          <ul className="space-y-2 text-sm">
            {(
              [
                ['Services', detail.summary.serviceRevenuePaise],
                ['Products', detail.summary.productRevenuePaise],
                ['Packages', detail.summary.packageRevenuePaise],
                ['Memberships', detail.summary.membershipRevenuePaise],
              ] as const
            ).map(([label, paise]) => (
              <li key={label} className="flex justify-between gap-4">
                <span className="text-fyh-text-secondary">{label}</span>
                <span className="tabular-nums font-medium">{formatInrFromPaise(paise)}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="fyh-glass space-y-4 p-5">
          <h2 className="text-sm font-medium uppercase tracking-wide text-fyh-text-muted">
            Target progress
          </h2>
          {target.targetPaise > 0 ? (
            <>
              <div className="flex justify-between text-sm">
                <span className="text-fyh-text-secondary">
                  {formatInrFromPaise(target.actualPaise)} of{' '}
                  {formatInrFromPaise(target.targetPaise)}
                </span>
                <span className="font-medium tabular-nums text-fyh-accent">{targetPct}%</span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-black/30">
                <div
                  className="h-full rounded-full bg-fyh-accent transition-all"
                  style={{ width: `${Math.min(100, Number(targetPct))}%` }}
                />
              </div>
            </>
          ) : (
            <p className="text-sm text-fyh-text-muted">
              No monthly target set. Add performanceTargetPaise on the staff record.
            </p>
          )}
        </div>
      </div>

      <div className="fyh-glass space-y-4 p-5">
        <h2 className="text-sm font-medium uppercase tracking-wide text-fyh-text-muted">
          Revenue timeline · 6 months
        </h2>
        {trend.every((t) => t.revenuePaise === 0) ? (
          <p className="text-sm text-fyh-text-muted">No data available</p>
        ) : (
          <div className="flex items-end justify-between gap-2 pt-2" style={{ minHeight: '10rem' }}>
            {trend.map((point) => {
              const heightPct = Math.max(4, Math.round((point.revenuePaise / maxTrend) * 100));
              return (
                <div key={point.monthKey} className="flex flex-1 flex-col items-center gap-2">
                  <span className="text-xs tabular-nums text-fyh-text-muted">
                    {point.revenuePaise > 0
                      ? formatInrFromPaise(point.revenuePaise).replace('₹', '')
                      : '—'}
                  </span>
                  <div
                    className="w-full max-w-[3rem] rounded-t-md bg-fyh-accent/80"
                    style={{
                      height: `${heightPct}%`,
                      minHeight: point.revenuePaise > 0 ? '0.5rem' : '2px',
                    }}
                    title={`${point.label}: ${formatInrFromPaise(point.revenuePaise)}`}
                  />
                  <span className="text-xs uppercase tracking-wide text-fyh-text-muted">
                    {point.label}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="fyh-glass space-y-3 p-5">
          <h2 className="text-sm font-medium uppercase tracking-wide text-fyh-text-muted">
            Top services
          </h2>
          {topServices.length === 0 ? (
            <p className="text-sm text-fyh-text-muted">No data available</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {topServices.map((item) => (
                <li key={item.name} className="flex justify-between gap-3">
                  <span className="min-w-0 truncate text-fyh-text-secondary">
                    {item.name}
                    <span className="ml-2 text-xs text-fyh-text-muted">×{item.quantity}</span>
                  </span>
                  <span className="shrink-0 tabular-nums">
                    {formatInrFromPaise(item.revenuePaise)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="fyh-glass space-y-3 p-5">
          <h2 className="text-sm font-medium uppercase tracking-wide text-fyh-text-muted">
            Top products
          </h2>
          {topProducts.length === 0 ? (
            <p className="text-sm text-fyh-text-muted">No data available</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {topProducts.map((item) => (
                <li key={item.name} className="flex justify-between gap-3">
                  <span className="min-w-0 truncate text-fyh-text-secondary">
                    {item.name}
                    <span className="ml-2 text-xs text-fyh-text-muted">×{item.quantity}</span>
                  </span>
                  <span className="shrink-0 tabular-nums">
                    {formatInrFromPaise(item.revenuePaise)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="fyh-glass space-y-3 p-5">
        <h2 className="text-sm font-medium uppercase tracking-wide text-fyh-text-muted">
          Recent invoices
        </h2>
        {recent.length === 0 ? (
          <p className="text-sm text-fyh-text-muted">No data available</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-[10px] uppercase tracking-wide text-fyh-text-muted">
                  <th className="py-2 pr-3 font-medium">Invoice</th>
                  <th className="py-2 pr-3 font-medium">Customer</th>
                  <th className="py-2 pr-3 font-medium">Paid</th>
                  <th className="py-2 font-medium">Attributed</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((inv) => (
                  <tr key={inv.invoiceId} className="border-b border-white/5">
                    <td className="py-2.5 pr-3">
                      <Link
                        href={`/billing/invoices/${inv.invoiceId}`}
                        className="text-fyh-accent hover:underline"
                      >
                        {inv.invoiceNumber}
                      </Link>
                    </td>
                    <td className="py-2.5 pr-3 text-fyh-text-secondary">
                      {inv.customerName ?? '—'}
                    </td>
                    <td className="py-2.5 pr-3 tabular-nums text-fyh-text-muted">
                      {inv.paidAt ? inv.paidAt.toISOString().slice(0, 10) : '—'}
                    </td>
                    <td className="py-2.5 tabular-nums">
                      {formatInrFromPaise(inv.attributedPaise)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
