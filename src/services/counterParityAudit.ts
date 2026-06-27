/**
 * Counter parity — Overview metric cards must match destination page totals.
 */

import type { AdminSession } from '@/src/lib/auth/session';
import { resolveBillingMonth } from '@/src/lib/dateDefaults';
import { buildOverviewDashboard } from '@/src/services/overviewDashboard';
import { loadOverviewContext } from '@/src/services/overviewData';
import { loadAdminNavBadges } from '@/src/services/adminNavBadges';
import { getOperationsCenterData } from '@/src/services/operationsCenter';
import { getMoveOutPipelineSnapshot } from '@/src/services/moveOutPipelineService';
import { listOpenActionItemsByType } from '@/src/services/actionItems';
import { loadAdminVacatingPageData } from '@/src/lib/vacating/loadAdminVacatingPageData';
import { loadResidentOperationsResidentsPage } from '@/src/services/residentOperationsResidentsPage';
import { getPaymentReviewIntegrityReport } from '@/src/services/paymentReviewIntegrity';
import { listPipelineCheckoutSettlements } from '@/src/services/checkoutSettlement';
import { getOpenActionsCount } from '@/src/services/unresolvedActions';
import { isStaleZeroRefundSettlement } from '@/src/lib/residents/checkoutOpsQueueCopy';

export type CounterParityRow = {
  metric: string;
  overviewValue: number;
  destinationValue: number;
  destination: string;
  matches: boolean;
};

export type CounterParityReport = {
  rows: CounterParityRow[];
  pass: boolean;
  summary: string;
};

function findMetricCount(
  dashboard: ReturnType<typeof buildOverviewDashboard>,
  id: string,
): number | null {
  for (const section of dashboard.sections) {
    const m = section.metrics.find((x) => x.id === id && x.kind === 'count');
    if (m) return m.value;
  }
  return null;
}

export async function runCounterParityAudit(
  session: AdminSession,
  billingMonthInput?: string,
): Promise<CounterParityReport> {
  const billingMonth = resolveBillingMonth(billingMonthInput);
  const ctx = await loadOverviewContext(session, billingMonth, { syncActions: false });
  if (!ctx.ok) {
    return {
      rows: [],
      pass: false,
      summary: `Overview context failed: ${ctx.error}`,
    };
  }

  const dashboard = buildOverviewDashboard(ctx.data);
  const [
    paymentIntegrity,
    opsCenter,
    checkoutSettlements,
    navBadges,
    opsPage,
    openCheckoutUnresolved,
    openKycUnresolved,
    moveOutPipeline,
    vacatingPage,
    vacatingActionItems,
  ] = await Promise.all([
    getPaymentReviewIntegrityReport(session),
    getOperationsCenterData(session),
    listPipelineCheckoutSettlements(session),
    loadAdminNavBadges(session),
    loadResidentOperationsResidentsPage(session, null),
    getOpenActionsCount(session, 'checkout'),
    getOpenActionsCount(session, 'kyc'),
    getMoveOutPipelineSnapshot(session),
    loadAdminVacatingPageData(session),
    listOpenActionItemsByType(session, 'vacating_alert'),
  ]);

  const checkoutRefundsDest = checkoutSettlements.filter(
    (s) => s.status === 'refund_pending' && !isStaleZeroRefundSettlement(s),
  ).length;

  const overviewPayments = findMetricCount(dashboard, 'payments_to_review') ?? 0;
  const overviewKyc = findMetricCount(dashboard, 'kyc_pending') ?? 0;
  const overviewRefunds = findMetricCount(dashboard, 'refunds_pending') ?? 0;
  const overviewVacating = findMetricCount(dashboard, 'vacating_month') ?? 0;
  const overviewBedsReleasing = findMetricCount(dashboard, 'beds_releasing') ?? 0;

  const vacatingModuleCount = vacatingPage.data?.activeItems.length ?? 0;
  const pipelineCount = moveOutPipeline.counts.moveOutNotices;
  const vacatingBadgeCount = vacatingActionItems.length;
  const operationsMoveOutCount = opsPage.commandCards.find((c) => c.id === 'move_out')?.count ?? 0;

  const rows: CounterParityRow[] = [
    {
      metric: 'Pending payment reviews',
      overviewValue: overviewPayments,
      destinationValue: paymentIntegrity.queueCount,
      destination: 'listPendingPaymentReviews',
      matches: overviewPayments === paymentIntegrity.queueCount,
    },
    {
      metric: 'Payment sidebar badge',
      overviewValue: paymentIntegrity.queueCount,
      destinationValue: paymentIntegrity.badgeCount,
      destination: "getOpenActionsCount('payments')",
      matches: paymentIntegrity.matches,
    },
    {
      metric: 'KYC pending (overview vs ops center)',
      overviewValue: overviewKyc,
      destinationValue: opsCenter.pendingKyc.count,
      destination: 'getOperationsCenterData.pendingKyc (PG-scoped)',
      matches: overviewKyc === opsCenter.pendingKyc.count,
    },
    {
      metric: 'KYC sidebar badge',
      overviewValue: opsCenter.pendingKyc.count,
      destinationValue: openKycUnresolved,
      destination: "getOpenActionsCount('kyc')",
      matches: opsCenter.pendingKyc.count === openKycUnresolved,
    },
    {
      metric: 'Refunds pending (checkout pipeline)',
      overviewValue: overviewRefunds,
      destinationValue: checkoutRefundsDest,
      destination: 'checkoutSettlements refund_pending',
      matches: overviewRefunds === checkoutRefundsDest,
    },
    {
      metric: 'Checkout sidebar badge',
      overviewValue: checkoutRefundsDest,
      destinationValue: openCheckoutUnresolved,
      destination: "getOpenActionsCount('checkout')",
      matches: checkoutRefundsDest === openCheckoutUnresolved,
    },
    {
      metric: 'Move-out notices',
      overviewValue: overviewVacating,
      destinationValue: pipelineCount,
      destination: 'getMoveOutPipelineSnapshot.counts.moveOutNotices',
      matches: overviewVacating === pipelineCount,
    },
    {
      metric: 'Move-out notices (Operations center)',
      overviewValue: pipelineCount,
      destinationValue: opsCenter.leavingSoon.count,
      destination: 'getOperationsCenterData.leavingSoon',
      matches: pipelineCount === opsCenter.leavingSoon.count,
    },
    {
      metric: 'Move-out notices (Vacating module)',
      overviewValue: pipelineCount,
      destinationValue: vacatingModuleCount,
      destination: 'loadAdminVacatingPageData.activeItems',
      matches: pipelineCount === vacatingModuleCount,
    },
    {
      metric: 'Move-out notices (Operations queue)',
      overviewValue: pipelineCount,
      destinationValue: operationsMoveOutCount,
      destination: 'residentOperationsDashboard move_out bucket',
      matches: pipelineCount === operationsMoveOutCount,
    },
    {
      metric: 'Move-out notices (vacating_alert action items)',
      overviewValue: pipelineCount,
      destinationValue: vacatingBadgeCount,
      destination: 'listOpenActionItemsByType(vacating_alert)',
      matches: pipelineCount === vacatingBadgeCount,
    },
    {
      metric: 'Beds releasing (30d)',
      overviewValue: overviewBedsReleasing,
      destinationValue: moveOutPipeline.counts.bedsReleasing30Days,
      destination: 'getMoveOutPipelineSnapshot.counts.bedsReleasing30Days',
      matches: overviewBedsReleasing === moveOutPipeline.counts.bedsReleasing30Days,
    },
    {
      metric: 'Beds releasing (30d) Operations center',
      overviewValue: moveOutPipeline.counts.bedsReleasing30Days,
      destinationValue: opsCenter.bedsReleasingSoon.count,
      destination: 'getOperationsCenterData.bedsReleasingSoon',
      matches: moveOutPipeline.counts.bedsReleasing30Days === opsCenter.bedsReleasingSoon.count,
    },
    {
      metric: 'Operations queue',
      overviewValue: navBadges.operations ?? 0,
      destinationValue: opsPage.allQueueCount,
      destination: 'loadResidentOperationsResidentsPage.allQueueCount',
      matches: (navBadges.operations ?? 0) === opsPage.allQueueCount,
    },
    {
      metric: 'Overview badge total',
      overviewValue: navBadges.overview ?? 0,
      destinationValue:
        (navBadges.operations ?? 0) +
        (navBadges.payments ?? 0) +
        (navBadges.kyc ?? 0) +
        (navBadges.checkoutSettlements ?? 0),
      destination: 'sum sidebar module badges',
      matches:
        (navBadges.overview ?? 0) ===
        (navBadges.operations ?? 0) +
          (navBadges.payments ?? 0) +
          (navBadges.kyc ?? 0) +
          (navBadges.checkoutSettlements ?? 0),
    },
  ];

  const pass = rows.every((r) => r.matches);
  const mismatches = rows.filter((r) => !r.matches);

  return {
    rows,
    pass,
    summary: pass
      ? 'All overview counters match destination totals.'
      : `${mismatches.length} counter mismatch(es): ${mismatches.map((m) => m.metric).join(', ')}.`,
  };
}
