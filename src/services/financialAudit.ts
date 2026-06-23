/**
 * Financial health audit & emergency recalc — compares surface totals vs SSOT engine.
 */

import type { AdminSession } from '@/src/lib/auth/session';
import { resolveBillingMonth } from '@/src/lib/dateDefaults';
import {
  getGlobalFinancialAggregates,
  getPortfolioRentStats,
} from '@/src/services/residentFinancialEngine';
import { reconcileStaleFinancialInvoices } from '@/src/lib/billing/financialMetrics';
import { getRentStats } from '@/src/db/queries/admin';
import { loadOverviewContext } from '@/src/services/overviewData';
import { markOverdueDeposits } from '@/src/services/depositCollection';

export type FinancialAuditCheck = {
  name: string;
  surfaceLabel: string;
  surfaceValuePaise: number;
  engineLabel: string;
  engineValuePaise: number;
  differencePaise: number;
  source: string;
};

export type FinancialAuditReport = {
  asOf: string;
  billingMonth: string;
  checks: FinancialAuditCheck[];
  hasMismatch: boolean;
};

function check(
  name: string,
  surfaceLabel: string,
  surfaceValuePaise: number,
  engineLabel: string,
  engineValuePaise: number,
  source: string,
): FinancialAuditCheck {
  return {
    name,
    surfaceLabel,
    surfaceValuePaise,
    engineLabel,
    engineValuePaise,
    differencePaise: surfaceValuePaise - engineValuePaise,
    source,
  };
}

/** Compare Overview, Revenue, Collections, and engine totals. */
export async function runFinancialHealthAudit(
  session: AdminSession,
  billingMonthInput?: string,
): Promise<FinancialAuditReport> {
  const billingMonth = resolveBillingMonth(billingMonthInput);
  const [ctx, engine, rentStats] = await Promise.all([
    loadOverviewContext(session, billingMonth, { syncActions: false }),
    getGlobalFinancialAggregates(session),
    getRentStats(),
  ]);

  const checks: FinancialAuditCheck[] = [];

  if (ctx.ok) {
    const overviewOutstanding = ctx.data.revenue.outstanding.totalOutstandingPaise;
    const engineOutstanding = engine.totals.outstandingPaise;
    checks.push(
      check(
        'overview_total_outstanding',
        'Overview → Revenue outstanding',
        overviewOutstanding,
        'Engine → grand outstanding',
        engineOutstanding,
        'overviewData.revenue.outstanding vs getGlobalFinancialAggregates().totals',
      ),
    );

    checks.push(
      check(
        'overview_rent_outstanding',
        'Overview → rent outstanding (revenue)',
        ctx.data.revenue.outstanding.pendingRentInvoicesPaise,
        'Engine → rent.outstandingPaise',
        engine.rent.outstandingPaise,
        'revenueCommandCenter vs engine.rent',
      ),
    );

    checks.push(
      check(
        'overview_electricity_outstanding',
        'Overview → electricity outstanding',
        ctx.data.revenue.outstanding.pendingElectricityInvoicesPaise,
        'Engine → electricity.outstandingPaise',
        engine.electricity.outstandingPaise,
        'revenueCommandCenter vs engine.electricity',
      ),
    );

    checks.push(
      check(
        'overview_deposit_outstanding',
        'Overview → deposit outstanding',
        ctx.data.revenue.outstanding.pendingDepositPaise,
        'Engine → deposit.outstandingPaise',
        engine.deposit.outstandingPaise,
        'revenueCommandCenter vs engine.deposit',
      ),
    );

    const depositsPanelTotal = ctx.data.outstandingDeposits.reduce(
      (a, r) => a + r.depositDuePaise,
      0,
    );
    checks.push(
      check(
        'deposits_panel_total',
        'Outstanding deposits panel sum',
        depositsPanelTotal,
        'Engine → deposit.outstandingPaise',
        engine.deposit.outstandingPaise,
        'listOutstandingDeposits vs engine.deposit',
      ),
    );
  }

  if (rentStats.ok) {
    checks.push(
      check(
        'collections_rent_outstanding',
        'Collections → getRentStats().outstandingPaise',
        rentStats.data.outstandingPaise,
        'Engine → rent.outstandingPaise',
        engine.rent.outstandingPaise,
        'admin.getRentStats vs engine.rent',
      ),
    );
  }

  const portfolioRent = await getPortfolioRentStats();
  checks.push(
    check(
      'engine_rent_stats_consistency',
      'getPortfolioRentStats().outstandingPaise',
      portfolioRent.outstandingPaise,
      'Engine → rent.outstandingPaise',
      engine.rent.outstandingPaise,
      'getPortfolioRentStats vs getGlobalFinancialAggregates',
    ),
  );

  return {
    asOf: new Date().toISOString(),
    billingMonth,
    checks,
    hasMismatch: checks.some((c) => c.differencePaise !== 0),
  };
}

export type FinancialRecalcResult = {
  reconcile: Awaited<ReturnType<typeof reconcileStaleFinancialInvoices>>;
  depositsMarkedOverdue: number;
  engineTotals: Awaited<ReturnType<typeof getGlobalFinancialAggregates>>;
};

/** Re-export full customer integrity audit (8 checks) for scripts + cron. */
export {
  runFinancialIntegrityAudit,
  getLiveOutstandingBalance,
  getLastReconciliationRun,
  sumBreakdownLines,
  computeFinancialInvoiceOutstanding,
  depositShortfallOnOpenInvoices,
  checkInvoiceEmpty,
  checkInvoiceTotalMismatch,
  checkDuplicateInvoices,
  FINANCIAL_INTEGRITY_CHECK_TYPES,
} from '@/src/services/financialIntegrityAudit';
export type {
  FinancialIntegrityCheckType,
  FinancialIntegrityIssue,
  FinancialIntegrityAuditReport,
  FinancialIntegrityAuditSummary,
} from '@/src/services/financialIntegrityAudit';

/** Emergency rebuild — reconcile unified invoices, mark overdue deposits, refresh aggregates. */
export async function recalculateAllFinancialSummaries(opts?: {
  billingMonth?: string;
  session?: AdminSession;
}): Promise<FinancialRecalcResult> {
  const billingMonth = opts?.billingMonth ? resolveBillingMonth(opts.billingMonth) : undefined;
  const [reconcile, depositsMarkedOverdue, engineTotals] = await Promise.all([
    reconcileStaleFinancialInvoices({ billingMonth }),
    markOverdueDeposits(),
    getGlobalFinancialAggregates(opts?.session),
  ]);
  return { reconcile, depositsMarkedOverdue, engineTotals };
}
