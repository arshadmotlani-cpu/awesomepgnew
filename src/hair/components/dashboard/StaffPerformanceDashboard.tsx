'use client';

import Link from 'next/link';
import { Award, IndianRupee, Package, Scissors, TrendingUp, Users } from 'lucide-react';
import {
  ChartPanel,
  DashboardShell,
  HeroKpi,
  Sparkline,
} from '@/src/hair/components/dashboard/DashboardShell';
import { RevenueByStaffChart } from '@/src/hair/components/dashboard/RevenueCharts';
import { formatInrFromPaise } from '@/src/hair/lib/money';
import type { StaffPerformanceDashboardSnapshot } from '@/src/hair/services/staffPerformanceDashboard';

function StaffCard({
  card,
}: {
  card: StaffPerformanceDashboardSnapshot['staffCards'][0];
}) {
  const badgeLabel =
    card.badge === 'top' ? 'Top performer' : card.badge === 'rising' ? 'Rising' : null;

  return (
    <Link
      href={`/staff/${card.staffId}/performance`}
      className="fyh-dashboard-card block p-5 transition hover:border-fyh-forest/40"
    >
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-fyh-elevated text-sm font-semibold text-fyh-accent">
          {card.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={card.photoUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            card.name?.slice(0, 1).toUpperCase() || '?'
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="truncate font-semibold text-fyh-text">{card.name}</h3>
            {badgeLabel ? (
              <span className="shrink-0 rounded-full bg-fyh-forest/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-fyh-forest">
                {badgeLabel}
              </span>
            ) : null}
          </div>
          <p className="mt-1 fyh-metric-xl text-fyh-forest">{formatInrFromPaise(card.revenuePaise)}</p>
          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-fyh-text-muted">
            <span>Services {formatInrFromPaise(card.servicesSoldPaise)}</span>
            <span>Products {formatInrFromPaise(card.productsSoldPaise)}</span>
            <span>{card.appointments} appointments</span>
            <span>Avg {formatInrFromPaise(card.averageBillPaise)}</span>
            <span>Commission {formatInrFromPaise(card.commissionPaise)}</span>
          </div>
          <div className="mt-3">
            <Sparkline values={card.sparkline} />
          </div>
        </div>
      </div>
    </Link>
  );
}

export function StaffPerformanceDashboard({ data }: { data: StaffPerformanceDashboardSnapshot }) {
  const leaderboard = data.leaderboard ?? [];
  const staffCards = data.staffCards ?? [];
  const revenueByStaff = data.revenueByStaff ?? [];

  return (
    <DashboardShell
      eyebrow="Team analytics"
      title="Staff Performance"
      subtitle="Leaderboards, commissions, and individual performance · MTD"
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <HeroKpi
          label="Highest Revenue"
          value={formatInrFromPaise(data.highestRevenuePaise)}
          icon={IndianRupee}
          accent
        />
        <HeroKpi label="Top Performer" value={data.topPerformerName} icon={Award} />
        <HeroKpi label="Highest Services" value={formatInrFromPaise(data.highestServicesPaise)} icon={Scissors} />
        <HeroKpi label="Highest Products" value={formatInrFromPaise(data.highestProductsPaise)} icon={Package} />
        <HeroKpi label="Highest Avg Bill" value={formatInrFromPaise(data.highestAverageBillPaise)} icon={TrendingUp} />
        <HeroKpi label="Commission Earned" value={formatInrFromPaise(data.commissionEarnedPaise)} icon={IndianRupee} />
        <HeroKpi label="Appointments Done" value={String(data.appointmentsCompleted)} icon={Users} />
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <ChartPanel title="Revenue by staff" subtitle="MTD leaderboard">
          <RevenueByStaffChart
            data={revenueByStaff.map((r) => ({
              id: r.staffId,
              name: r.name,
              revenuePaise: r.revenuePaise,
            }))}
          />
        </ChartPanel>

        <section className="fyh-dashboard-card p-5">
          <h2 className="fyh-card-title">Leaderboard</h2>
          <ul className="mt-4 divide-y divide-[color:var(--fyh-border)]">
            {leaderboard.length === 0 ? (
              <li className="py-6 text-center text-sm text-fyh-text-muted">No staff revenue this month</li>
            ) : (
              leaderboard.map((row, i) => (
              <li key={row.staffId} className="flex items-center justify-between gap-3 py-3 text-sm">
                <span className="flex items-center gap-3">
                  <span className="w-5 tabular-nums text-fyh-text-muted">{i + 1}</span>
                  <span className="font-medium">{row.name}</span>
                </span>
                <span className="tabular-nums font-semibold text-fyh-forest">
                  {formatInrFromPaise(row.revenuePaise)}
                </span>
              </li>
              ))
            )}
          </ul>
        </section>
      </div>

      <section className="space-y-4">
        <h2 className="fyh-card-title">Staff cards</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          {staffCards.length === 0 ? (
            <p className="text-sm text-fyh-text-muted">No active staff with performance data</p>
          ) : (
            staffCards.map((card) => (
            <StaffCard key={card.staffId} card={card} />
            ))
          )}
        </div>
      </section>
    </DashboardShell>
  );
}
