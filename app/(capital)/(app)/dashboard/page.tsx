import type { Metadata } from 'next';
import { OverviewDashboard } from '@/src/capital/components/OverviewDashboard';
import { getOverviewBundle, resolveDashboardRange } from '@/src/capital/services/overview';

export const metadata: Metadata = { title: 'Overview' };

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string; month?: string }>;
}) {
  const params = await searchParams;
  // Default: current month
  const range = resolveDashboardRange(
    params.range ?? 'month',
    params.from,
    params.to,
    params.month,
  );
  const bundle = await getOverviewBundle(range);

  return (
    <OverviewDashboard
      bundle={bundle}
      customFrom={params.from}
      customTo={params.to}
    />
  );
}
