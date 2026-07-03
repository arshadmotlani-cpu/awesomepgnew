/**
 * Financial health audit — compares every financial surface vs Resident Financial Account SSOT.
 */

import type { AdminSession } from '@/src/lib/auth/session';
import { resolveBillingMonth } from '@/src/lib/dateDefaults';
import {
  computeOutstandingMoneyFromInvoices,
  loadInvoiceOutstandingSnapshot,
} from '@/src/services/financialSummaryService';
import { loadBillingCommandCenterSnapshot } from '@/src/services/billingCommandCenter';
import { reconcileStaleFinancialInvoices } from '@/src/lib/billing/financialMetrics';
import { getRentStats } from '@/src/db/queries/admin';
import { loadOverviewContext } from '@/src/services/overviewData';
import { markOverdueDeposits } from '@/src/services/depositCollection';
import { getGlobalFinancialAggregates } from '@/src/services/residentFinancialEngine';
import { listOutstandingDeposits } from '@/src/services/depositCollection';
import { getPgRevenueResidentRows } from '@/src/services/pgRevenueResidents';
import { listPgs } from '@/src/db/queries/admin';

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

/** Compare Overview, Revenue, Collections, PG residents, and engine totals. */
export async function runFinancialHealthAudit(
  session: AdminSession,
  billingMonthInput?: string,
): Promise<FinancialAuditReport> {
  const billingMonth = resolveBillingMonth(billingMonthInput);
  const [ctx, invoiceSnapshot, billingCenter, rentStats, pgs] = await Promise.all([
    loadOverviewContext(session, billingMonth, { syncActions: false }),
    loadInvoiceOutstandingSnapshot(session),
    loadBillingCommandCenterSnapshot(session, billingMonth),
    getRentStats(),
    listPgs(),
  ]);

  const invoiceOutstanding = computeOutstandingMoneyFromInvoices(invoiceSnapshot);
  const checks: FinancialAuditCheck[] = [];

  if (ctx.ok) {
    const overviewOutstanding = ctx.data.revenue.outstanding.totalOutstandingPaise;
    checks.push(
      check(
        'overview_total_outstanding',
        'Overview → Revenue outstanding',
        overviewOutstanding,
        'Invoice SSOT → total outstanding',
        invoiceOutstanding.totalOutstandingPaise,
        'overviewData.revenue.outstanding vs financialSummaryService',
      ),
    );

    checks.push(
      check(
        'revenue_command_center_total_outstanding',
        'Revenue Command Center → total outstanding',
        ctx.data.revenue.outstanding.totalOutstandingPaise,
        'Invoice SSOT → total outstanding',
        invoiceOutstanding.totalOutstandingPaise,
        'revenueCommandCenter.outstanding vs financialSummaryService',
      ),
    );

    checks.push(
      check(
        'billing_center_total_outstanding',
        'Billing Center → total outstanding',
        billingCenter.totalOutstandingPaise,
        'Invoice SSOT → total outstanding',
        invoiceOutstanding.totalOutstandingPaise,
        'billingCommandCenter vs financialSummaryService',
      ),
    );

    checks.push(
      check(
        'overview_rent_outstanding',
        'Overview → rent outstanding (revenue)',
        ctx.data.revenue.outstanding.pendingRentInvoicesPaise,
        'Invoice SSOT → rent outstanding',
        invoiceOutstanding.pendingRentInvoicesPaise,
        'revenueCommandCenter vs financialSummaryService.rent',
      ),
    );

    checks.push(
      check(
        'overview_electricity_outstanding',
        'Overview → electricity outstanding',
        ctx.data.revenue.outstanding.pendingElectricityInvoicesPaise,
        'Invoice SSOT → electricity outstanding',
        invoiceOutstanding.pendingElectricityInvoicesPaise,
        'revenueCommandCenter vs financialSummaryService.electricity',
      ),
    );

    checks.push(
      check(
        'operations_electricity_due_count',
        'Operations → electricity due count',
        ctx.data.operations?.electricityPending.count ?? 0,
        'Invoice SSOT → electricity due count',
        invoiceOutstanding.pendingElectricityInvoices,
        'operationsCenter vs financialSummaryService',
      ),
    );

    checks.push(
      check(
        'billing_electricity_waiting_count',
        'Billing Center → electricity waiting count',
        billingCenter.electricityWaitingCount,
        'Invoice SSOT → electricity due count',
        invoiceOutstanding.pendingElectricityInvoices,
        'billingCommandCenter vs financialSummaryService',
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
        'Revenue → pendingDepositPaise',
        ctx.data.revenue.outstanding.pendingDepositPaise,
        'listOutstandingDeposits vs revenue.pendingDeposit',
      ),
    );

    const depositListTotal = (await listOutstandingDeposits()).reduce(
      (a, r) => a + r.depositDuePaise,
      0,
    );
    checks.push(
      check(
        'deposit_collection_list_total',
        'depositCollection.listOutstandingDeposits sum',
        depositListTotal,
        'Revenue → pendingDepositPaise',
        ctx.data.revenue.outstanding.pendingDepositPaise,
        'depositCollection vs revenue.pendingDeposit',
      ),
    );

    if (pgs.ok && pgs.data.length > 0) {
      const samplePg = pgs.data[0]!;
      const pgRows = await getPgRevenueResidentRows(samplePg.id, billingMonth);
      const pgResidentsTotal = pgRows.reduce((a, r) => a + r.totalOutstandingPaise, 0);
      checks.push(
        check(
          'pg_revenue_residents_sample',
          `PG revenue residents total (${samplePg.name}, n=${pgRows.length})`,
          pgResidentsTotal,
          'Invoice SSOT total (portfolio subset informational)',
          invoiceOutstanding.totalOutstandingPaise,
          'pgRevenueResidents SSOT rows — informational; may differ when PG≠all',
        ),
      );
    }
  }

  if (rentStats.ok) {
    checks.push(
      check(
        'collections_rent_outstanding',
        'Collections → getRentStats().outstandingPaise',
        rentStats.data.outstandingPaise,
        'Invoice SSOT → rent outstanding',
        invoiceOutstanding.pendingRentInvoicesPaise,
        'admin.getRentStats vs financialSummaryService',
      ),
    );
  }

  const { db } = await import('@/src/db/client');
  const { checkoutSettlements } = await import('@/src/db/schema');
  const { inArray, sql } = await import('drizzle-orm');
  const [openCheckout] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(checkoutSettlements)
    .where(
      inArray(checkoutSettlements.status, [
        'awaiting_resident_details',
        'awaiting_admin_review',
        'approved',
        'refund_pending',
      ]),
    );
  checks.push(
    check(
      'checkout_open_settlements_snapshot',
      'Open checkout settlements (informational)',
      Number(openCheckout?.n ?? 0),
      'Same query (consistency probe)',
      Number(openCheckout?.n ?? 0),
      'checkout_settlements open rows — informational',
    ),
  );

  const materialChecks = checks.filter(
    (c) => c.name !== 'pg_revenue_residents_sample',
  );

  return {
    asOf: new Date().toISOString(),
    billingMonth,
    checks,
    hasMismatch: materialChecks.some((c) => c.differencePaise !== 0),
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
