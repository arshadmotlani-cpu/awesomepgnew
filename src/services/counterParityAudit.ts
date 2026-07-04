/**
 * Counter parity — Overview metric cards must match destination page totals.
 */

import { OPS_QUEUE_FILTERS, type OpsQueueFilter } from '@/src/lib/operations/operationsFilterLinks';
import type { AdminSession } from '@/src/lib/auth/session';
import { resolveBillingMonth } from '@/src/lib/dateDefaults';
import { buildOverviewDashboard, findOverviewMetricValue } from '@/src/services/overviewDashboard';
import { loadOverviewContext } from '@/src/services/overviewData';
import { loadAdminNavBadges } from '@/src/services/adminNavBadges';
import { loadApprovalCounts } from '@/src/services/approvalService';
import { loadBillingCommandCenterSnapshot } from '@/src/services/billingCommandCenter';
import { getMoveOutPipelineSnapshot } from '@/src/services/moveOutPipelineService';
import { loadUnifiedOperationsQueue } from '@/src/services/unifiedOperationsQueue';

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

const OPS_CARD_IDS: Record<OpsQueueFilter, string> = {
  rent_due: 'rent_due',
  electricity_due: 'electricity_due',
  deposit_due: 'deposit_due',
  refund_due: 'refund_due',
  waiting_for_approval: 'waiting_for_approval',
  vacating_requests: 'vacating_requests',
  booking_approval: 'booking_approval',
  kyc_review: 'kyc_review',
};

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
  const [navBadges, moveOutPipeline, unifiedOpsAll, approvalCounts, billingSnapshot] =
    await Promise.all([
    loadAdminNavBadges(session),
    getMoveOutPipelineSnapshot(session),
    loadUnifiedOperationsQueue(session, null),
    loadApprovalCounts(session),
    loadBillingCommandCenterSnapshot(session, billingMonth),
  ]);

  const unifiedCounts = Object.fromEntries(
    unifiedOpsAll.filterCounts.map((c) => [c.id, c.count]),
  ) as Record<OpsQueueFilter, number>;

  const rows: CounterParityRow[] = OPS_QUEUE_FILTERS.map((filter) => {
    const overviewValue = findOverviewMetricValue(dashboard, OPS_CARD_IDS[filter]) ?? 0;
    const destinationValue = unifiedCounts[filter] ?? 0;
    return {
      metric: `Operations → ${filter}`,
      overviewValue,
      destinationValue,
      destination: 'loadUnifiedOperationsQueue.filterCounts',
      matches: overviewValue === destinationValue,
    };
  });

  const overviewBedsReleasing = findOverviewMetricValue(dashboard, 'beds_releasing') ?? 0;
  rows.push({
    metric: 'Beds releasing (30d)',
    overviewValue: overviewBedsReleasing,
    destinationValue: moveOutPipeline.counts.bedsReleasing30Days,
    destination: 'getMoveOutPipelineSnapshot.counts.bedsReleasing30Days',
    matches: overviewBedsReleasing === moveOutPipeline.counts.bedsReleasing30Days,
  });

  rows.push({
    metric: 'Operations queue total',
    overviewValue: navBadges.operations ?? 0,
    destinationValue: unifiedOpsAll.totalCount,
    destination: 'loadUnifiedOperationsQueue.totalCount',
    matches: (navBadges.operations ?? 0) === unifiedOpsAll.totalCount,
  });

  rows.push({
    metric: 'Payments nav badge',
    overviewValue: navBadges.payments ?? 0,
    destinationValue: approvalCounts.waitingForApprovalVisible,
    destination: 'approvalService.waitingForApprovalVisible',
    matches: (navBadges.payments ?? 0) === approvalCounts.waitingForApprovalVisible,
  });

  rows.push({
    metric: 'Billing payment review count',
    overviewValue: billingSnapshot.paymentReviewCount,
    destinationValue: approvalCounts.waitingForApprovalVisible,
    destination: 'approvalService.waitingForApprovalVisible',
    matches: billingSnapshot.paymentReviewCount === approvalCounts.waitingForApprovalVisible,
  });

  rows.push({
    metric: 'Billing move-out count',
    overviewValue: billingSnapshot.moveOutCount,
    destinationValue: unifiedCounts.vacating_requests ?? 0,
    destination: 'loadUnifiedOperationsQueue.filterCounts.vacating_requests',
    matches: billingSnapshot.moveOutCount === (unifiedCounts.vacating_requests ?? 0),
  });

  rows.push({
    metric: 'Billing KYC review count',
    overviewValue: billingSnapshot.kycReviewCount,
    destinationValue: unifiedCounts.kyc_review ?? 0,
    destination: 'loadUnifiedOperationsQueue.filterCounts.kyc_review',
    matches: billingSnapshot.kycReviewCount === (unifiedCounts.kyc_review ?? 0),
  });

  rows.push({
    metric: 'KYC nav badge',
    overviewValue: navBadges.kyc ?? 0,
    destinationValue: unifiedCounts.kyc_review ?? 0,
    destination: 'loadUnifiedOperationsQueue.filterCounts.kyc_review',
    matches: (navBadges.kyc ?? 0) === (unifiedCounts.kyc_review ?? 0),
  });

  rows.push({
    metric: 'Checkout settlements nav badge',
    overviewValue: navBadges.checkoutSettlements ?? 0,
    destinationValue: unifiedCounts.refund_due ?? 0,
    destination: 'loadUnifiedOperationsQueue.filterCounts.refund_due',
    matches: (navBadges.checkoutSettlements ?? 0) === (unifiedCounts.refund_due ?? 0),
  });

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
