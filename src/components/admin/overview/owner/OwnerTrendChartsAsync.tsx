import { OwnerDashboard } from '@/src/components/admin/overview/owner/OwnerDashboard';
import { buildOwnerDashboard, type OwnerDashboardData } from '@/src/services/ownerDashboard';
import { loadOwnerDashboardTrends } from '@/src/services/ownerDashboardTrends';
import type { OverviewReportingSnapshot } from '@/src/services/overviewReportingService';
import type { ExecutiveMetrics } from '@/src/services/executiveMetrics';

export async function OwnerDashboardWithTrends({
  ctx,
  executive,
  baseData,
}: {
  ctx: OverviewReportingSnapshot;
  executive: ExecutiveMetrics | null;
  baseData: OwnerDashboardData;
}) {
  const trends = await loadOwnerDashboardTrends(ctx.billingMonth, baseData.pgIds);
  const data = buildOwnerDashboard(ctx, executive, trends);
  return <OwnerDashboard data={data} trends={trends} />;
}
