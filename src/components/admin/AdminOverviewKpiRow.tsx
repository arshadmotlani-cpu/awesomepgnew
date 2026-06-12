import { OverviewStatCard } from '@/src/components/admin/OverviewStatCard';
import {
  IconBuilding,
  IconCard,
  IconChart,
  IconUsers,
} from '@/src/components/admin/icons';
import { paiseToInr } from '@/src/lib/format';
import type { AdminOverviewKpis, VisitorCountSummary } from '@/src/services/visitorAnalytics';

export function AdminOverviewKpiRow({
  kpis,
  visitors,
}: {
  kpis: AdminOverviewKpis;
  visitors: VisitorCountSummary;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
      <OverviewStatCard
        label="Total visitors"
        value={kpis.totalVisitorsAllTime.toLocaleString('en-IN')}
        hint={`${visitors.today} today · ${visitors.week} this week`}
        icon={<IconUsers />}
        accent="sky"
      />
      <OverviewStatCard
        label="Active tenants"
        value={kpis.activeTenants.toLocaleString('en-IN')}
        hint="Monthly / open-ended stays"
        icon={<IconUsers />}
        accent="emerald"
      />
      <OverviewStatCard
        label="Beds occupied"
        value={kpis.bedsOccupied.toLocaleString('en-IN')}
        hint="Active reservations today"
        icon={<IconBuilding />}
        accent="violet"
      />
      <OverviewStatCard
        label="Beds available"
        value={kpis.bedsAvailable.toLocaleString('en-IN')}
        hint="Ready to book now"
        icon={<IconBuilding />}
        accent="indigo"
      />
      <OverviewStatCard
        label="Pending KYC"
        value={kpis.pendingKyc.toLocaleString('en-IN')}
        hint="Awaiting admin review"
        icon={<IconUsers />}
        accent="amber"
      />
      <OverviewStatCard
        label="Pending payments"
        value={kpis.pendingPayments.toLocaleString('en-IN')}
        hint="Bookings awaiting checkout"
        icon={<IconCard />}
        accent="rose"
      />
      <OverviewStatCard
        label="Today's revenue"
        value={paiseToInr(kpis.todayRevenuePaise)}
        hint="Succeeded payments today"
        icon={<IconCard />}
        accent="orange"
      />
      <OverviewStatCard
        label="Monthly revenue"
        value={paiseToInr(kpis.monthlyRevenuePaise)}
        hint="Billing month to date"
        icon={<IconChart />}
        accent="emerald"
      />
    </div>
  );
}
