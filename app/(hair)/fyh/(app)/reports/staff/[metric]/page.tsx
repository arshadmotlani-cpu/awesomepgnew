import { notFound } from 'next/navigation';
import { getStaffPerformanceLeaderboard } from '@/src/hair/services/staffPerformance';
import { getSalonSettings } from '@/src/hair/services/settings';
import { salonDayBounds, salonMonthStartUtc } from '@/src/hair/lib/salonTime';
import { formatInrFromPaise } from '@/src/hair/lib/money';
import type { FyhRevenueMetric } from '@/src/hair/db/schema';

const METRICS: Record<string, { metric: FyhRevenueMetric; title: string }> = {
  service: { metric: 'service', title: 'Staff · Service revenue' },
  product: { metric: 'product', title: 'Staff · Product revenue' },
  package: { metric: 'package', title: 'Staff · Package revenue' },
  membership: { metric: 'membership', title: 'Staff · Membership revenue' },
};

type Props = { params: Promise<{ metric: string }> };

export default async function StaffPerformanceReportPage({ params }: Props) {
  const { metric: key } = await params;
  const cfg = METRICS[key];
  if (!cfg) notFound();

  const settings = await getSalonSettings();
  const tz = settings.timezone?.trim() || 'Asia/Kolkata';
  const { end } = salonDayBounds(tz);
  const from = salonMonthStartUtc(tz);
  const rows = await getStaffPerformanceLeaderboard(cfg.metric, { from, to: end }, 20);

  return (
    <div className="space-y-6">
      <div>
        <p className="fyh-section-eyebrow">Reports</p>
        <h1 className="fyh-display mt-1 text-3xl font-semibold">{cfg.title}</h1>
        <p className="mt-1 text-sm text-fyh-text-secondary">This month · attributed net (before tax)</p>
      </div>
      <div className="fyh-glass overflow-hidden">
        {rows.length === 0 ? (
          <p className="px-6 py-10 text-center text-sm text-fyh-text-muted">
            No attributed sales yet. Complete Quick Sale or appointment checkouts with staff assigned.
          </p>
        ) : (
          <ul className="divide-y divide-[color:var(--fyh-border)]">
            {rows.map((r) => (
              <li key={r.staffId} className="flex justify-between gap-4 px-4 py-3 text-sm">
                <span className="font-medium">{r.name}</span>
                <span className="tabular-nums text-fyh-accent">{formatInrFromPaise(r.revenuePaise)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
