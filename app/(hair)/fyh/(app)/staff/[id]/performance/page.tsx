import Link from 'next/link';
import { notFound } from 'next/navigation';
import { KpiCard } from '@/src/hair/components/dashboard/KpiCard';
import { formatInrFromPaise } from '@/src/hair/lib/money';
import { salonDayBounds, salonMonthStartUtc } from '@/src/hair/lib/salonTime';
import { getStaffById } from '@/src/hair/services/staff';
import { getSalonSettings } from '@/src/hair/services/settings';
import {
  getStaffCommissionTotals,
  getStaffDetailPerformance,
  getStaffMonthlyTrend,
  getStaffTargetProgress,
} from '@/src/hair/services/staffPerformance';
import { IndianRupee, Receipt, Target, Wallet } from 'lucide-react';

type Props = { params: Promise<{ id: string }> };

export default async function StaffPerformancePage({ params }: Props) {
  const { id } = await params;
  const staff = await getStaffById(id);
  if (!staff) notFound();

  const settings = await getSalonSettings();
  const tz = settings.timezone?.trim() || 'Asia/Kolkata';
  const { end } = salonDayBounds(tz);
  const from = salonMonthStartUtc(tz);
  const range = { from, to: end };

  const [detail, trend, target, commissions] = await Promise.all([
    getStaffDetailPerformance(id, range),
    getStaffMonthlyTrend(id, 6, tz),
    getStaffTargetProgress(id, range),
    getStaffCommissionTotals(id),
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
        <Link
          href="/fyh/staff"
          className="text-sm text-fyh-accent underline-offset-2 hover:underline"
        >
          ← All staff
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
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
          label="Commission"
          value={formatInrFromPaise(commissions.pendingPaise)}
          icon={Target}
          hint={`Pending · paid ${formatInrFromPaise(commissions.paidPaise)}`}
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
          Monthly trend · 6 months
        </h2>
        {trend.every((t) => t.revenuePaise === 0) ? (
          <p className="text-sm text-fyh-text-muted">No attributed revenue in this window yet.</p>
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
                    style={{ height: `${heightPct}%`, minHeight: point.revenuePaise > 0 ? '0.5rem' : '2px' }}
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
    </div>
  );
}
