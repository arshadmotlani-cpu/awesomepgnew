/**
 * In-app billing cycle reconciliation — the product certifies generation success.
 * Read-only verification after optional auto-sync; no terminal scripts required.
 */

import { cache } from 'react';
import { and, count, eq, inArray, isNull, ne, sql, sum } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  billingGenerationFailures,
  billingGenerationRuns,
  bookings,
  customers,
  electricityBillGenerationJobs,
  electricityInvoices,
  paymentLinks,
  rentInvoices,
} from '@/src/db/schema';
import { adminRequestScopeKey } from '@/src/lib/admin/adminRequestCache';
import { resolveBillingMonth } from '@/src/lib/dateDefaults';
import { collectibleResidentFilters } from '@/src/lib/billing/productionDataFilter';
import {
  countDriftedFinancialInvoices,
  sumPaidElectricityForBillingMonth,
  sumPaidRentForBillingMonth,
} from '@/src/lib/billing/financialMetrics';
import { countActiveElectricityInvoiceDuplicatesForMonth } from '@/src/services/electricityInvoiceDuplicates';
import { getJuneElectricityOpsCompletion } from '@/src/lib/admin/juneElectricityOpsAudit';
import { operationsFilterHref } from '@/src/lib/operations/operationsFilterLinks';
import { listPendingPaymentReviews } from '@/src/services/paymentProofQueue';
import type { AdminSession } from '@/src/lib/auth/session';

/** Certification checks that require admin action on the current billing cycle. */
export const ACTIONABLE_RECONCILIATION_CHECK_IDS = [
  'no_failures',
  'no_duplicates',
  'registry_sync',
  'payment_reviews',
] as const;

export type ActionableReconciliationCheckId = (typeof ACTIONABLE_RECONCILIATION_CHECK_IDS)[number];

export function isActionableReconciliationCheck(id: string): boolean {
  return (ACTIONABLE_RECONCILIATION_CHECK_IDS as readonly string[]).includes(id);
}

export function reconcileActionableReviewHref(
  checks: BillingReconciliationCheck[],
  billingMonth: string,
): string {
  const month = billingMonth.slice(0, 7);
  const failing = checks.find((c) => !c.pass && isActionableReconciliationCheck(c.id));
  if (!failing) return `/admin/billing?tab=dashboard&month=${month}`;
  switch (failing.id) {
    case 'no_failures':
      return `/admin/billing?tab=failures&month=${month}`;
    case 'no_duplicates':
      return '/admin/electricity/duplicates';
    case 'registry_sync':
      return `/admin/billing?tab=dashboard&month=${month}`;
    case 'payment_reviews':
      return operationsFilterHref('waiting_for_approval');
    default:
      return `/admin/billing?tab=dashboard&month=${month}`;
  }
}

export function deriveActionableReconciliation(
  checks: BillingReconciliationCheck[],
  billingMonth: string,
): {
  actionableIssueCount: number;
  actionableFailures: string[];
  actionableHeadline: string;
  actionableStatus: 'success' | 'failed';
  actionableReviewHref: string;
} {
  const actionableChecks = checks.filter((c) => isActionableReconciliationCheck(c.id));
  const failing = actionableChecks.filter((c) => !c.pass);
  const actionableIssueCount = failing.length;
  const actionableFailures = failing.map((c) => `${c.label}: ${c.detail}`);
  const actionableStatus = actionableIssueCount === 0 ? 'success' : 'failed';
  const actionableHeadline =
    actionableStatus === 'success'
      ? 'Billing reconciled'
      : `${actionableIssueCount} billing issue${actionableIssueCount === 1 ? '' : 's'} need attention`;
  const actionableReviewHref = reconcileActionableReviewHref(checks, billingMonth);
  return {
    actionableIssueCount,
    actionableFailures,
    actionableHeadline,
    actionableStatus,
    actionableReviewHref,
  };
}

export type BillingReconciliationCheck = {
  id: string;
  label: string;
  pass: boolean;
  detail: string;
};

export type BillingCycleReconciliation = {
  billingMonth: string;
  monthLabel: string;
  status: 'success' | 'failed';
  headline: string;
  metrics: {
    rentResidentsBilled: number;
    electricityResidentsBilled: number;
    residentsSkipped: number;
    rentInvoicesGenerated: number;
    electricityInvoicesGenerated: number;
    totalBilledPaise: number;
    totalCollectedPaise: number;
    totalOutstandingPaise: number;
    collectionPct: number;
    failedInvoices: number;
    duplicateInvoiceGroups: number;
    rentWaitingPayment: number;
    electricityWaitingPayment: number;
    waitingAdminReview: number;
    overdueInvoices: number;
  };
  checks: BillingReconciliationCheck[];
  failures: string[];
  actionableIssueCount: number;
  actionableFailures: string[];
  actionableHeadline: string;
  actionableStatus: 'success' | 'failed';
  actionableReviewHref: string;
};

function monthLabel(billingMonth: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${billingMonth}T00:00:00.000Z`));
}

async function countRentSkippedForMonth(billingMonth: string): Promise<number> {
  const rows = await db
    .select({
      skippedCount: billingGenerationRuns.skippedCount,
      summary: billingGenerationRuns.summary,
    })
    .from(billingGenerationRuns)
    .where(
      sql`${billingGenerationRuns.summary}->>'billingMonth' = ${billingMonth.slice(0, 10)}`,
    );
  return rows.reduce((acc, r) => acc + (r.skippedCount ?? 0), 0);
}

async function countElectricitySkippedForMonth(billingMonth: string): Promise<number> {
  const rows = await db.execute<{ skipped: number }>(sql`
    SELECT coalesce(sum(greatest(0, eb.monthly_occupant_count - coalesce(inv.cnt, 0))), 0)::int AS skipped
    FROM electricity_bills eb
    LEFT JOIN (
      SELECT electricity_bill_id, count(*)::int AS cnt
      FROM electricity_invoices
      WHERE status != 'cancelled'
      GROUP BY electricity_bill_id
    ) inv ON inv.electricity_bill_id = eb.id
    WHERE eb.billing_month = ${billingMonth}::date
  `);
  return Number(Array.from(rows)[0]?.skipped ?? 0);
}

async function countOrphanRentInvoices(billingMonth: string): Promise<number> {
  const rows = await db.execute<{ cnt: number }>(sql`
    SELECT count(*)::int AS cnt
    FROM rent_invoices ri
    LEFT JOIN financial_invoices fi ON fi.source_table = 'rent_invoices' AND fi.source_id = ri.id
    INNER JOIN bookings b ON b.id = ri.booking_id
    INNER JOIN customers c ON c.id = ri.customer_id
    WHERE fi.id IS NULL
      AND ri.billing_month = ${billingMonth}::date
      AND ri.is_adhoc = false
      AND ri.status IN ('pending', 'overdue', 'payment_in_progress')
  `);
  return Number(Array.from(rows)[0]?.cnt ?? 0);
}

async function countOrphanElectricityInvoices(billingMonth: string): Promise<number> {
  const rows = await db.execute<{ cnt: number }>(sql`
    SELECT count(*)::int AS cnt
    FROM electricity_invoices ei
    LEFT JOIN financial_invoices fi ON fi.source_table = 'electricity_invoices' AND fi.source_id = ei.id
    INNER JOIN bookings b ON b.id = ei.booking_id
    INNER JOIN customers c ON c.id = ei.customer_id
    WHERE fi.id IS NULL
      AND ei.billing_month = ${billingMonth}::date
      AND ei.status = 'pending'
  `);
  return Number(Array.from(rows)[0]?.cnt ?? 0);
}

async function countMissingPaymentReviewProofs(
  session: AdminSession,
  billingMonth: string,
): Promise<{
  missing: number;
  detail: string;
}> {
  const [rentProofRows, elecProofRows, depositProofRows, reviews] = await Promise.all([
    db
      .select({ id: rentInvoices.id })
      .from(rentInvoices)
      .innerJoin(bookings, eq(bookings.id, rentInvoices.bookingId))
      .innerJoin(customers, eq(customers.id, rentInvoices.customerId))
      .where(
        and(
          collectibleResidentFilters(),
          eq(rentInvoices.isAdhoc, false),
          eq(rentInvoices.billingMonth, billingMonth),
          sql`${rentInvoices.paymentProofUrl} IS NOT NULL`,
          inArray(rentInvoices.status, ['pending', 'overdue', 'payment_in_progress']),
        ),
      ),
    db
      .select({ id: electricityInvoices.id })
      .from(electricityInvoices)
      .innerJoin(bookings, eq(bookings.id, electricityInvoices.bookingId))
      .innerJoin(customers, eq(customers.id, electricityInvoices.customerId))
      .where(
        and(
          collectibleResidentFilters(),
          eq(electricityInvoices.billingMonth, billingMonth),
          eq(electricityInvoices.status, 'pending'),
          sql`${electricityInvoices.paymentProofUrl} IS NOT NULL`,
        ),
      ),
    db
      .select({ id: paymentLinks.id })
      .from(paymentLinks)
      .where(
        and(
          eq(paymentLinks.status, 'active'),
          sql`${paymentLinks.paymentProofUrl} IS NOT NULL`,
        ),
      ),
    listPendingPaymentReviews(session),
  ]);

  const reviewKeys = new Set(reviews.map((r) => r.key));
  const missingIds: string[] = [];
  for (const r of rentProofRows) {
    if (!reviewKeys.has(`rent-${r.id}`)) missingIds.push(`rent:${r.id}`);
  }
  for (const e of elecProofRows) {
    if (!reviewKeys.has(`elec-${e.id}`)) missingIds.push(`elec:${e.id}`);
  }
  for (const d of depositProofRows) {
    if (!reviewKeys.has(`deposit-link-${d.id}`)) missingIds.push(`deposit-link:${d.id}`);
  }

  return {
    missing: missingIds.length,
    detail:
      missingIds.length === 0
        ? 'Every uploaded proof appears in Payment Reviews'
        : `${missingIds.length} proof(s) missing from Payment Reviews queue`,
  };
}

export async function evaluateBillingCycleReconciliation(
  session: AdminSession,
  billingMonthInput?: string,
): Promise<BillingCycleReconciliation> {
  const billingMonth = resolveBillingMonth(billingMonthInput);
  const label = monthLabel(billingMonth);

  const [
    rentResidentsRow,
    elecResidentsRow,
    rentInvoicesRow,
    elecInvoicesRow,
    rentBilledRow,
    elecBilledRow,
    paidRent,
    paidElec,
    rentOutstandingRow,
    elecOutstandingRow,
    rentWaitingRow,
    elecWaitingRow,
    rentReviewRow,
    elecReviewRow,
    overdueRentRow,
    overdueElecRow,
    failedRent,
    failedElecJobs,
    duplicateGroups,
    driftCount,
    orphanRent,
    orphanElec,
    rentSkipped,
    elecSkipped,
    proofCheck,
    juneOps,
  ] = await Promise.all([
    db
      .select({ count: sql<number>`count(distinct ${rentInvoices.customerId})::int` })
      .from(rentInvoices)
      .innerJoin(bookings, eq(bookings.id, rentInvoices.bookingId))
      .innerJoin(customers, eq(customers.id, rentInvoices.customerId))
      .where(
        and(
          collectibleResidentFilters(),
          eq(rentInvoices.billingMonth, billingMonth),
          eq(rentInvoices.isAdhoc, false),
          ne(rentInvoices.status, 'cancelled'),
        ),
      )
      .then((r) => r[0]?.count ?? 0),
    db
      .select({ count: sql<number>`count(distinct ${electricityInvoices.customerId})::int` })
      .from(electricityInvoices)
      .innerJoin(bookings, eq(bookings.id, electricityInvoices.bookingId))
      .innerJoin(customers, eq(customers.id, electricityInvoices.customerId))
      .where(
        and(
          collectibleResidentFilters(),
          eq(electricityInvoices.billingMonth, billingMonth),
          ne(electricityInvoices.status, 'cancelled'),
        ),
      )
      .then((r) => r[0]?.count ?? 0),
    db
      .select({ count: count() })
      .from(rentInvoices)
      .where(
        and(
          eq(rentInvoices.billingMonth, billingMonth),
          eq(rentInvoices.isAdhoc, false),
          ne(rentInvoices.status, 'cancelled'),
        ),
      )
      .then((r) => r[0]?.count ?? 0),
    db
      .select({ count: count() })
      .from(electricityInvoices)
      .where(
        and(eq(electricityInvoices.billingMonth, billingMonth), ne(electricityInvoices.status, 'cancelled')),
      )
      .then((r) => r[0]?.count ?? 0),
    db
      .select({
        total: sql<number>`coalesce(sum(${rentInvoices.rentPaise} - ${rentInvoices.discountPaise} + coalesce(${rentInvoices.lateFeeLockedPaise}, ${rentInvoices.paidLateFeePaise}, 0)), 0)::bigint::int`,
      })
      .from(rentInvoices)
      .where(
        and(
          eq(rentInvoices.billingMonth, billingMonth),
          eq(rentInvoices.isAdhoc, false),
          ne(rentInvoices.status, 'cancelled'),
        ),
      )
      .then((r) => Number(r[0]?.total ?? 0)),
    db
      .select({
        total: sql<number>`coalesce(sum(${electricityInvoices.amountPaise} + coalesce(${electricityInvoices.lateFeeLockedPaise}, 0)), 0)::bigint::int`,
      })
      .from(electricityInvoices)
      .where(
        and(eq(electricityInvoices.billingMonth, billingMonth), ne(electricityInvoices.status, 'cancelled')),
      )
      .then((r) => Number(r[0]?.total ?? 0)),
    sumPaidRentForBillingMonth(billingMonth),
    sumPaidElectricityForBillingMonth(billingMonth),
    db
      .select({
        total: sql<number>`coalesce(sum((${rentInvoices.rentPaise} - ${rentInvoices.discountPaise} + coalesce(${rentInvoices.lateFeeLockedPaise}, ${rentInvoices.paidLateFeePaise}, 0)) - ${rentInvoices.paidPrincipalPaise} - ${rentInvoices.paidLateFeePaise}), 0)::bigint::int`,
      })
      .from(rentInvoices)
      .innerJoin(bookings, eq(bookings.id, rentInvoices.bookingId))
      .innerJoin(customers, eq(customers.id, rentInvoices.customerId))
      .where(
        and(
          collectibleResidentFilters(),
          eq(rentInvoices.billingMonth, billingMonth),
          inArray(rentInvoices.status, ['pending', 'overdue', 'payment_in_progress']),
        ),
      )
      .then((r) => Number(r[0]?.total ?? 0)),
    db
      .select({
        total: sql<number>`coalesce(sum((${electricityInvoices.amountPaise} + coalesce(${electricityInvoices.lateFeeLockedPaise}, 0)) - ${electricityInvoices.paidPaise}), 0)::bigint::int`,
      })
      .from(electricityInvoices)
      .innerJoin(bookings, eq(bookings.id, electricityInvoices.bookingId))
      .innerJoin(customers, eq(customers.id, electricityInvoices.customerId))
      .where(
        and(
          collectibleResidentFilters(),
          eq(electricityInvoices.billingMonth, billingMonth),
          eq(electricityInvoices.status, 'pending'),
        ),
      )
      .then((r) => Number(r[0]?.total ?? 0)),
    db
      .select({ count: count() })
      .from(rentInvoices)
      .where(
        and(
          eq(rentInvoices.isAdhoc, false),
          inArray(rentInvoices.status, ['pending', 'overdue']),
          sql`${rentInvoices.paymentProofUrl} IS NULL`,
          eq(rentInvoices.billingMonth, billingMonth),
        ),
      )
      .then((r) => r[0]?.count ?? 0),
    db
      .select({ count: count() })
      .from(electricityInvoices)
      .where(
        and(
          eq(electricityInvoices.billingMonth, billingMonth),
          eq(electricityInvoices.status, 'pending'),
          sql`${electricityInvoices.paymentProofUrl} IS NULL`,
        ),
      )
      .then((r) => r[0]?.count ?? 0),
    db
      .select({ count: count() })
      .from(rentInvoices)
      .where(
        and(
          eq(rentInvoices.isAdhoc, false),
          inArray(rentInvoices.status, ['pending', 'overdue', 'payment_in_progress']),
          sql`${rentInvoices.paymentProofUrl} IS NOT NULL`,
        ),
      )
      .then((r) => r[0]?.count ?? 0),
    db
      .select({ count: count() })
      .from(electricityInvoices)
      .where(
        and(
          eq(electricityInvoices.status, 'pending'),
          sql`${electricityInvoices.paymentProofUrl} IS NOT NULL`,
        ),
      )
      .then((r) => r[0]?.count ?? 0),
    db
      .select({ count: count() })
      .from(rentInvoices)
      .innerJoin(bookings, eq(bookings.id, rentInvoices.bookingId))
      .innerJoin(customers, eq(customers.id, rentInvoices.customerId))
      .where(
        and(
          collectibleResidentFilters(),
          eq(rentInvoices.billingMonth, billingMonth),
          eq(rentInvoices.status, 'overdue'),
        ),
      )
      .then((r) => r[0]?.count ?? 0),
    db
      .select({ count: count() })
      .from(electricityInvoices)
      .innerJoin(bookings, eq(bookings.id, electricityInvoices.bookingId))
      .innerJoin(customers, eq(customers.id, electricityInvoices.customerId))
      .where(
        and(
          collectibleResidentFilters(),
          eq(electricityInvoices.billingMonth, billingMonth),
          eq(electricityInvoices.status, 'pending'),
          sql`${electricityInvoices.dueDate} < current_date`,
        ),
      )
      .then((r) => r[0]?.count ?? 0),
    db
      .select({ count: count() })
      .from(billingGenerationFailures)
      .where(
        and(
          isNull(billingGenerationFailures.resolvedAt),
          eq(billingGenerationFailures.billingMonth, billingMonth),
        ),
      )
      .then((r) => r[0]?.count ?? 0),
    db
      .select({ count: count() })
      .from(electricityBillGenerationJobs)
      .where(
        and(
          eq(electricityBillGenerationJobs.billingMonth, billingMonth),
          eq(electricityBillGenerationJobs.status, 'failed'),
        ),
      )
      .then((r) => r[0]?.count ?? 0),
    countActiveElectricityInvoiceDuplicatesForMonth(billingMonth),
    countDriftedFinancialInvoices(billingMonth),
    countOrphanRentInvoices(billingMonth),
    countOrphanElectricityInvoices(billingMonth),
    countRentSkippedForMonth(billingMonth),
    countElectricitySkippedForMonth(billingMonth),
    countMissingPaymentReviewProofs(session, billingMonth),
    billingMonth.startsWith('2026-06') ? getJuneElectricityOpsCompletion() : Promise.resolve(null),
  ]);

  const totalBilledPaise = rentBilledRow + elecBilledRow;
  const totalCollectedPaise = paidRent + paidElec;
  const totalOutstandingPaise = rentOutstandingRow + elecOutstandingRow;
  const collectionPct =
    totalBilledPaise > 0 ? Math.round((totalCollectedPaise / totalBilledPaise) * 100) : 100;
  const residentsSkipped = rentSkipped + elecSkipped;
  const failedInvoices = failedRent + failedElecJobs;
  const waitingAdminReview = rentReviewRow + elecReviewRow;
  const overdueInvoices = overdueRentRow + overdueElecRow;

  const checks: BillingReconciliationCheck[] = [
    {
      id: 'no_failures',
      label: 'No failed invoice generation',
      pass: failedInvoices === 0,
      detail:
        failedInvoices === 0
          ? 'All generation jobs completed without failures'
          : `${failedInvoices} failed generation job(s) — see Failed jobs tab`,
    },
    {
      id: 'no_duplicates',
      label: 'No duplicate invoices',
      pass: duplicateGroups === 0,
      detail:
        duplicateGroups === 0
          ? 'No duplicate electricity invoice groups'
          : `${duplicateGroups} duplicate group(s) detected — repair required`,
    },
    {
      id: 'registry_sync',
      label: 'Invoice registry synchronized',
      pass: orphanRent === 0 && orphanElec === 0 && driftCount === 0,
      detail:
        orphanRent + orphanElec + driftCount === 0
          ? 'Every invoice appears in Admin Invoices and resident portal'
          : `${orphanRent + orphanElec} orphan(s), ${driftCount} drifted registry row(s)`,
    },
    {
      id: 'payment_reviews',
      label: 'Payment Reviews complete',
      pass: proofCheck.missing === 0,
      detail: proofCheck.detail,
    },
    {
      id: 'revenue_integrity',
      label: 'Revenue counts approved payments only',
      pass: totalCollectedPaise <= totalBilledPaise,
      detail: `Collected ${totalCollectedPaise} paise of ${totalBilledPaise} paise billed (principal + late fees) — outstanding stays in queues until approval`,
    },
  ];

  if (billingMonth.startsWith('2026-06') && juneOps) {
    checks.push({
      id: 'june_electricity_ops',
      label: 'June electricity generation recorded',
      pass: juneOps.completed,
      detail: juneOps.completed
        ? `Completed ${juneOps.completedAt?.toISOString() ?? 'successfully'}`
        : 'June electricity production ops audit entry not found',
    });
  }

  const failures = checks.filter((c) => !c.pass).map((c) => `${c.label}: ${c.detail}`);
  const status = failures.length === 0 ? 'success' : 'failed';
  const headline =
    status === 'success'
      ? '✓ Billing completed successfully'
      : `${failures.length} reconciliation issue${failures.length === 1 ? '' : 's'} need attention`;

  const actionable = deriveActionableReconciliation(checks, billingMonth);

  return {
    billingMonth,
    monthLabel: label,
    status,
    headline,
    ...actionable,
    metrics: {
      rentResidentsBilled: rentResidentsRow,
      electricityResidentsBilled: elecResidentsRow,
      residentsSkipped,
      rentInvoicesGenerated: rentInvoicesRow,
      electricityInvoicesGenerated: elecInvoicesRow,
      totalBilledPaise,
      totalCollectedPaise,
      totalOutstandingPaise,
      collectionPct,
      failedInvoices,
      duplicateInvoiceGroups: duplicateGroups,
      rentWaitingPayment: rentWaitingRow,
      electricityWaitingPayment: elecWaitingRow,
      waitingAdminReview,
      overdueInvoices,
    },
    checks,
    failures,
  };
}

/** Auto-sync registry then evaluate — called when Billing Centre / Overview loads. */
export async function reconcileAndEvaluateBillingCycle(
  session: AdminSession,
  billingMonthInput?: string,
): Promise<BillingCycleReconciliation> {
  const billingMonth = resolveBillingMonth(billingMonthInput);
  const { reconcileStaleFinancialInvoices } = await import('@/src/lib/billing/financialMetrics');
  await reconcileStaleFinancialInvoices({ billingMonth }).catch(() => undefined);
  const { syncActionItemsForCron } = await import('@/src/services/actionItems');
  await syncActionItemsForCron().catch(() => undefined);
  return evaluateBillingCycleReconciliation(session, billingMonth);
}

export type BillingReconciliationLoadResult =
  | { ok: true; reconciliation: BillingCycleReconciliation }
  | { ok: false; error: string; reconciliation: null };

/** Never throws — safe for Overview and other critical pages. */
export async function loadBillingReconciliationSafe(
  session: AdminSession,
  billingMonthInput?: string,
  opts?: { reconcile?: boolean },
): Promise<BillingReconciliationLoadResult> {
  return loadBillingReconciliationSafeForRequest(
    adminRequestScopeKey(session),
    session,
    billingMonthInput,
    opts?.reconcile === true,
  );
}

const loadBillingReconciliationSafeForRequest = cache(
  async (
    scopeKey: string,
    session: AdminSession,
    billingMonthInput: string | undefined,
    reconcile: boolean,
  ): Promise<BillingReconciliationLoadResult> => {
    void scopeKey;
    try {
      const reconciliation = reconcile
        ? await reconcileAndEvaluateBillingCycle(session, billingMonthInput)
        : await evaluateBillingCycleReconciliation(session, billingMonthInput);
      return { ok: true, reconciliation };
    } catch (err) {
      console.error('[billing-reconciliation]', err);
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Billing certification unavailable',
        reconciliation: null,
      };
    }
  },
);
