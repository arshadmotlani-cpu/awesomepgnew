import Link from 'next/link';
import { formatInrFromPaise } from '@/src/hair/lib/money';
import { salonDayBounds, salonMonthStartUtc } from '@/src/hair/lib/salonTime';
import { getSalonSettings } from '@/src/hair/services/settings';
import { getStaffTotalLeaderboard } from '@/src/hair/services/staffPerformance';

export default async function StaffPerformanceLeaderboardPage() {
  const settings = await getSalonSettings();
  const tz = settings.timezone?.trim() || 'Asia/Kolkata';
  const { end } = salonDayBounds(tz);
  const from = salonMonthStartUtc(tz);
  const rows = await getStaffTotalLeaderboard({ from, to: end }, 20);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="fyh-section-eyebrow">Team</p>
          <h1 className="fyh-display mt-1 text-3xl font-semibold">Staff performance</h1>
          <p className="mt-1 text-sm text-fyh-text-secondary">
            Leaderboard · this month · attributed net from share splits
          </p>
        </div>
        <Link
          href="/fyh/staff"
          className="text-sm text-fyh-accent underline-offset-2 hover:underline"
        >
          ← Staff list
        </Link>
      </div>

      <div className="fyh-glass overflow-hidden">
        {rows.length === 0 ? (
          <p className="px-6 py-10 text-center text-sm text-fyh-text-muted">
            No attributed sales yet. Complete checkouts with staff assigned on each line.
          </p>
        ) : (
          <ul className="divide-y divide-[color:var(--fyh-border)]">
            {rows.map((r, i) => (
              <li key={r.staffId}>
                <Link
                  href={`/fyh/staff/${r.staffId}/performance`}
                  className="flex items-center justify-between gap-4 px-4 py-3 text-sm transition hover:bg-white/5"
                >
                  <span className="flex items-center gap-3">
                    <span className="w-6 tabular-nums text-fyh-text-muted">{i + 1}</span>
                    <span className="font-medium">{r.name}</span>
                  </span>
                  <span className="tabular-nums text-fyh-accent">
                    {formatInrFromPaise(r.revenuePaise)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
