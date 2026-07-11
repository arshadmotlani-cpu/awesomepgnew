import type { Metadata } from 'next';
import { OverviewDashboard } from '@/src/capital/components/OverviewDashboard';
import { getOverviewBundle, resolveDashboardRange } from '@/src/capital/services/overview';
import { getSettings } from '@/src/capital/services/settings';

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
  const [bundle, settings] = await Promise.all([getOverviewBundle(range), getSettings()]);
  const defaultPartnerPct =
    settings?.profitShareDenominator && settings.profitShareDenominator > 0
      ? Math.round((settings.profitShareNumerator * 100) / settings.profitShareDenominator)
      : 50;

  return (
    <OverviewDashboard
      bundle={bundle}
      customFrom={params.from}
      customTo={params.to}
      defaultPartnerPct={defaultPartnerPct}
    />
  );
}
