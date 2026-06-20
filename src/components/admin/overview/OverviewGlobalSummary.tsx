import {
  IconBuilding,
  IconCard,
  IconChart,
  IconClipboard,
  IconDashboard,
  IconUsers,
} from '@/src/components/admin/icons';
import { ClickableOverviewCard } from '@/src/components/admin/overview/ClickableOverviewCard';
import { ADMIN_MODULES, moduleHref } from '@/src/lib/admin/navigation';
import { paiseToInr } from '@/src/lib/format';
import type { OverviewContext } from '@/src/services/overviewData';

export function OverviewGlobalSummary({ ctx }: { ctx: OverviewContext }) {
  const month = ctx.billingMonth;

  const mtdTotal = ctx.revenue.mtd.totalPaise;

  return (
    <div className="space-y-10">
      <section className="space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-white">Modules</h2>
          <p className="text-xs text-apg-silver">Each sidebar module is independent — drill via routes.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {(
            [
              ['revenue', IconCard, mtdTotal, 'Total MTD'],
              ['collections', IconClipboard, ctx.revenue.outstanding.totalOutstandingPaise, 'Outstanding'],
              ['operations', IconClipboard, ctx.unreadNotificationsCount, 'Unread actions'],
              ['analytics', IconChart, ctx.visitors.today, 'Visitors today'],
            ] as const
          ).map(([key, Icon, value, hint]) => {
            const mod = ADMIN_MODULES[key as keyof typeof ADMIN_MODULES];
            return (
              <ClickableOverviewCard
                key={key}
                href={moduleHref(key as keyof typeof ADMIN_MODULES, month)}
                label={mod.label}
                value={
                  key === 'revenue' || key === 'collections'
                    ? paiseToInr(value as number)
                    : (value as number).toLocaleString('en-IN')
                }
                hint={`${hint}`}
                icon={<Icon />}
                accent={key === 'revenue' ? 'emerald' : key === 'collections' ? 'amber' : 'sky'}
                large
              />
            );
          })}
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <ClickableOverviewCard
            href={moduleHref('analytics', month)}
            label={ADMIN_MODULES.analytics.label}
            value={ctx.visitors.today.toLocaleString('en-IN')}
            hint={`${ctx.visitors.week} visitors this week · funnel & traffic`}
            icon={<IconChart />}
            accent="violet"
            large
          />
          <ClickableOverviewCard
            href="/admin/notifications"
            label="Notifications"
            value={(ctx.unreadNotificationsCount ?? 0).toLocaleString('en-IN')}
            hint="Unread — resident requests & alerts"
            icon={<IconUsers />}
            accent="amber"
            large
          />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <ClickableOverviewCard
            href={moduleHref('system', month)}
            label={ADMIN_MODULES.system.label}
            value={ctx.systemHealth.errorsToday.toLocaleString('en-IN')}
            hint={`${ctx.systemHealth.errorsThisWeek} errors this week`}
            icon={<IconDashboard />}
            accent="rose"
            large
          />
          <ClickableOverviewCard
            href={moduleHref('pgs', month)}
            label={ADMIN_MODULES.pgs.label}
            value={ctx.pgCount.toLocaleString('en-IN')}
            hint="Manage properties"
            icon={<IconBuilding />}
            accent="indigo"
            large
          />
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-white">Financial KPIs → Revenue</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <ClickableOverviewCard
            href={moduleHref('revenue', month)}
            label="Total revenue (MTD)"
            value={paiseToInr(mtdTotal)}
            hint="Rent + electricity + deposits"
            icon={<IconCard />}
            accent="indigo"
          />
          <ClickableOverviewCard
            href={moduleHref('revenue', month)}
            label="Rent collected"
            value={paiseToInr(ctx.summary.incomeRentPaise)}
            icon={<IconCard />}
            accent="emerald"
          />
          <ClickableOverviewCard
            href={`/admin/deposits/collected?month=${month}`}
            label="Deposits collected (MTD)"
            value={paiseToInr(ctx.depositPortfolio.collectedMtdPaise)}
            hint="From deposit ledger"
            icon={<IconCard />}
            accent="orange"
          />
          <ClickableOverviewCard
            href={moduleHref('deposits', month)}
            label="Deposits held"
            value={paiseToInr(ctx.depositPortfolio.heldPaise)}
            hint="Active liability — refundable balances"
            icon={<IconCard />}
            accent="amber"
          />
          <ClickableOverviewCard
            href={moduleHref('revenue', month)}
            label="Deposits refunded (MTD)"
            value={paiseToInr(ctx.depositPortfolio.refundedMtdPaise)}
            hint="Cash returned this month"
            icon={<IconChart />}
            accent="rose"
          />
          <ClickableOverviewCard
            href={moduleHref('revenue', month)}
            label="Net inflow (MTD)"
            value={paiseToInr(ctx.revenue.mtd.netInflowPaise)}
            hint="Rent + deposits collected − refunds"
            icon={<IconChart />}
            accent="emerald"
          />
          <ClickableOverviewCard
            href={moduleHref('revenue', month)}
            label="Electricity collected"
            value={paiseToInr(ctx.summary.incomeElectricityPaise)}
            icon={<IconChart />}
            accent="sky"
          />
          <ClickableOverviewCard
            href={moduleHref('collections', month)}
            label="Outstanding dues"
            value={paiseToInr(ctx.revenue.outstanding.totalOutstandingPaise)}
            icon={<IconClipboard />}
            accent="amber"
          />
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-white">Property → Operations / Revenue</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <ClickableOverviewCard
            href={moduleHref('revenue', month)}
            label="Occupancy"
            value={`${ctx.summary.occupancyPct}%`}
            hint={`${ctx.summary.occupiedBeds}/${ctx.summary.totalBeds} beds`}
            icon={<IconUsers />}
            accent="violet"
          />
          <ClickableOverviewCard
            href={moduleHref('operations', month)}
            label="Active tenants"
            value={ctx.overviewKpis.activeTenants.toLocaleString('en-IN')}
            hint="List at PG level only"
            icon={<IconUsers />}
            accent="emerald"
          />
          <ClickableOverviewCard
            href={moduleHref('operations', month)}
            label="Active vacating"
            value={ctx.vacatingAlertsCount.toLocaleString('en-IN')}
            hint="Still active after you read notifications"
            icon={<IconUsers />}
            accent="rose"
          />
          <ClickableOverviewCard
            href={moduleHref('analytics', month)}
            label="Visitors today"
            value={ctx.visitors.today.toLocaleString('en-IN')}
            hint={`${ctx.visitors.week} this week`}
            icon={<IconChart />}
            accent="sky"
          />
        </div>
      </section>
    </div>
  );
}
