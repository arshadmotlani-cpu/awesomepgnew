'use client';

import type { BillingCollectionDateFilter } from '@/src/lib/admin/billingCollectionsFilter';
import type { BillingCentreDashboardFilters, BillingCentreDashboardView } from '@/src/lib/admin/billingCentreDashboardPresentation';
import { BillingUpcomingGenerationSection } from '@/src/components/admin/billing/BillingUpcomingGenerationSection';
import {
  BillingCentreAutoRefresh,
  BillingCentreStickyFilters,
} from '@/src/components/admin/billing/BillingCentreStickyFilters';
import { BillingCentreGeneratedTodaySection } from '@/src/components/admin/billing/centre/BillingCentreGeneratedTodaySection';
import { BillingCentreOpsMetricsSection } from '@/src/components/admin/billing/centre/BillingCentreOpsMetricsSection';
import { BillingCentrePendingApprovalsSection } from '@/src/components/admin/billing/centre/BillingCentrePendingApprovalsSection';
import { BillingCentrePendingCollectionsSection } from '@/src/components/admin/billing/centre/BillingCentrePendingCollectionsSection';
import { BillingCentreRecentlyPaidSection } from '@/src/components/admin/billing/centre/BillingCentreRecentlyPaidSection';
import { BillingCentreSummarySection } from '@/src/components/admin/billing/centre/BillingCentreSummarySection';

const PAID_PERIOD_LABEL: Record<BillingCollectionDateFilter, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  week: 'Last 7 days',
  month: 'This month',
};

export function BillingCentreCommandDashboard({
  view,
  filters,
  canMarkCash,
  canGenerateRent,
  adminName,
}: {
  view: BillingCentreDashboardView;
  filters: BillingCentreDashboardFilters;
  canMarkCash: boolean;
  canGenerateRent: boolean;
  adminName: string;
}) {
  const paidPeriodLabel = PAID_PERIOD_LABEL[filters.paidPeriod ?? 'today'] ?? 'Today';

  return (
    <div className="max-w-full space-y-8">
      <BillingCentreAutoRefresh enabled />
      <BillingCentreStickyFilters pgs={view.pgs} filters={filters} />

      <BillingCentreSummarySection summary={view.summary} commandCards={view.commandCards} />

      <div id="upcoming">
        <header className="mb-3">
          <h2 className="text-sm font-semibold text-white">Upcoming bill generation</h2>
          <p className="mt-0.5 text-xs text-apg-silver">Next 7 days — rent anniversary schedule</p>
        </header>
        <BillingUpcomingGenerationSection
          rows={view.upcomingGeneration}
          todayIso={view.todayIso}
          canGenerate={canGenerateRent}
        />
      </div>

      <BillingCentreGeneratedTodaySection
        rows={view.generatedToday}
        totalPaise={view.generatedTodayTotalPaise}
        todayIso={view.todayIso}
      />

      <BillingCentrePendingCollectionsSection
        rows={view.pendingCollections}
        canMarkCash={canMarkCash}
        adminName={adminName}
      />

      <BillingCentreRecentlyPaidSection rows={view.recentlyPaid} paidPeriodLabel={paidPeriodLabel} />

      <BillingCentrePendingApprovalsSection rows={view.pendingApprovals} />

      <BillingCentreOpsMetricsSection kpis={view.opsKpis} />
    </div>
  );
}
