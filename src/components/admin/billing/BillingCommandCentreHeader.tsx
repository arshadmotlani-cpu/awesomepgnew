import Link from 'next/link';
import { paiseToInr } from '@/src/lib/format';
import type { BillingHealthSnapshot } from '@/src/services/billingHealth';

const TILE =
  'rounded-xl border border-white/10 bg-[#12161C] px-4 py-3 min-w-[120px] flex-1';

function toneClass(tone: 'default' | 'warn' | 'urgent'): string {
  if (tone === 'urgent') return 'border-rose-500/40 bg-rose-500/10';
  if (tone === 'warn') return 'border-amber-500/40 bg-amber-500/10';
  return '';
}

function HealthTile({
  label,
  value,
  href,
  tone = 'default',
}: {
  label: string;
  value: string | number;
  href?: string;
  tone?: 'default' | 'warn' | 'urgent';
}) {
  const inner = (
    <>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-apg-silver">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-white">{value}</p>
    </>
  );
  const className = `${TILE} ${toneClass(tone)}`;
  if (href) {
    return (
      <Link href={href} className={`${className} block transition hover:border-[#FF5A1F]/40`}>
        {inner}
      </Link>
    );
  }
  return <div className={className}>{inner}</div>;
}

export function BillingCommandCentreHeader({
  health,
  roomsMissingElectricity,
  checkoutPendingCount,
}: {
  health: BillingHealthSnapshot;
  roomsMissingElectricity: number;
  checkoutPendingCount: number;
}) {
  const gradeColor =
    health.healthGrade === 'excellent' || health.healthGrade === 'good'
      ? 'text-emerald-300'
      : health.healthGrade === 'fair'
        ? 'text-amber-300'
        : 'text-rose-300';

  return (
    <section className="mb-8 rounded-2xl border border-white/10 bg-[#1A1F27] p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-white">Billing Command Centre</h2>
          <p className="mt-1 text-sm text-apg-silver">
            Rent generates automatically on each resident&apos;s billing anniversary. Act on
            exceptions only — meter entry, collections, and checkout approvals.
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-apg-silver">
            Billing health
          </p>
          <p className={`text-3xl font-bold tabular-nums ${gradeColor}`}>{health.healthScore}</p>
          <p className={`text-xs capitalize ${gradeColor}`}>{health.healthGrade}</p>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <HealthTile
          label="Overdue rent"
          value={health.overdueRentInvoices}
          href="/admin/billing?tab=rent"
          tone={health.overdueRentInvoices > 0 ? 'urgent' : 'default'}
        />
        <HealthTile
          label="Due in 7 days"
          value={health.dueInSevenDays}
          href="/admin/billing?tab=rent"
          tone={health.dueInSevenDays > 5 ? 'warn' : 'default'}
        />
        <HealthTile
          label="Failed generations"
          value={health.unresolvedFailures}
          href="/admin/billing?tab=failures"
          tone={health.unresolvedFailures > 0 ? 'urgent' : 'default'}
        />
        <HealthTile
          label="Rooms awaiting meter"
          value={roomsMissingElectricity}
          href="/admin/billing?tab=electricity"
          tone={roomsMissingElectricity > 0 ? 'warn' : 'default'}
        />
        <HealthTile
          label="Checkout pending"
          value={checkoutPendingCount}
          href="/admin/operations?filter=vacating_requests"
          tone={checkoutPendingCount > 0 ? 'warn' : 'default'}
        />
        <HealthTile
          label="Proof approvals"
          value={health.pendingApprovals}
          href="/admin/operations?filter=waiting_for_approval"
          tone={health.pendingApprovals > 0 ? 'urgent' : 'default'}
        />
      </div>

      {health.healthIssues.length > 0 ? (
        <ul className="mt-4 space-y-1 text-xs text-apg-silver">
          {health.healthIssues.map((issue) => (
            <li key={issue}>• {issue}</li>
          ))}
        </ul>
      ) : null}

      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href="/admin/electricity/dashboard"
          className="rounded-lg border border-sky-500/40 bg-sky-500/10 px-4 py-2 text-sm font-semibold text-sky-100 hover:bg-sky-500/20"
        >
          Electricity room dashboard →
        </Link>
        <Link
          href="/admin/billing?tab=diagnostics"
          className="rounded-lg border border-white/10 px-4 py-2 text-sm font-medium text-apg-silver hover:text-white"
        >
          Diagnostics
        </Link>
      </div>
    </section>
  );
}

export function BillingUpcomingRentSchedule({
  schedule,
}: {
  schedule: {
    fromDate: string;
    throughDate: string;
    days: Array<{
      issueDate: string;
      residentCount: number;
      totalExpectedPaise: number;
      scheduledCount: number;
      alreadyIssuedCount: number;
    }>;
    totalScheduledResidents: number;
    totalExpectedPaise: number;
  };
}) {
  if (schedule.days.length === 0) {
    return (
      <section className="rounded-xl border border-white/10 bg-[#1A1F27] p-5">
        <h3 className="text-sm font-semibold text-white">Upcoming rent schedule</h3>
        <p className="mt-2 text-sm text-apg-silver">No anniversary bill issuances in the next 14 days.</p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-white/10 bg-[#1A1F27] p-5">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-white">Upcoming rent schedule</h3>
          <p className="mt-1 text-xs text-apg-silver">
            Next 14 days · {schedule.totalScheduledResidents} scheduled ·{' '}
            {paiseToInr(schedule.totalExpectedPaise)} expected
          </p>
        </div>
      </header>
      <div className="overflow-hidden rounded-lg border border-white/10">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-left text-xs text-apg-silver">
              <th className="px-4 py-2 font-medium">Issue date</th>
              <th className="px-4 py-2 font-medium text-right">Residents</th>
              <th className="px-4 py-2 font-medium text-right">Expected total</th>
              <th className="px-4 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {schedule.days.map((day) => (
              <tr key={day.issueDate} className="border-b border-white/5 hover:bg-white/[0.02]">
                <td className="px-4 py-3 text-white">{day.issueDate}</td>
                <td className="px-4 py-3 text-right tabular-nums text-white">{day.residentCount}</td>
                <td className="px-4 py-3 text-right tabular-nums text-white">
                  {paiseToInr(day.totalExpectedPaise)}
                </td>
                <td className="px-4 py-3 text-xs text-apg-silver">
                  {day.scheduledCount > 0 ? (
                    <span className="text-emerald-300">{day.scheduledCount} scheduled</span>
                  ) : null}
                  {day.alreadyIssuedCount > 0 ? (
                    <span className="text-zinc-400">
                      {day.scheduledCount > 0 ? ' · ' : ''}
                      {day.alreadyIssuedCount} already issued
                    </span>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
