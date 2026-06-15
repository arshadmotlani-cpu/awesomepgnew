/**
 * Single source of truth for collected revenue — always derived from active financial
 * records (paid invoices, approved QR payments, deposit ledger), never stale snapshots.
 */

import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { financialInvoices, rentInvoices } from '@/src/db/schema';
import {
  syncElectricityInvoiceToUnified,
  syncRentInvoiceToUnified,
} from '@/src/services/unifiedInvoices';

export type FinancialReconcileResult = {
  rentUnifiedSynced: number;
  elecUnifiedSynced: number;
  financialRowsCancelled: number;
  financialRowsFixed: number;
};

/** Align `financial_invoices` with source rent/electricity rows after cancellations. */
export async function reconcileStaleFinancialInvoices(opts?: {
  billingMonth?: string;
}): Promise<FinancialReconcileResult> {
  let financialRowsCancelled = 0;
  let financialRowsFixed = 0;
  let rentUnifiedSynced = 0;
  let elecUnifiedSynced = 0;

  const monthFilter = opts?.billingMonth
    ? sql`AND ri.billing_month = ${opts.billingMonth}::date`
    : sql``;
  const elecMonthFilter = opts?.billingMonth
    ? sql`AND ei.billing_month = ${opts.billingMonth}::date`
    : sql``;

  const driftRent = await db.execute<{ id: string; rent_id: string }>(sql`
    SELECT fi.id, ri.id AS rent_id
    FROM financial_invoices fi
    INNER JOIN rent_invoices ri ON fi.source_table = 'rent_invoices' AND fi.source_id = ri.id
    WHERE ri.status = 'cancelled'
      AND fi.status NOT IN ('cancelled', 'refunded')
      ${monthFilter}
  `);

  for (const row of Array.from(driftRent)) {
    await db
      .update(financialInvoices)
      .set({
        status: 'cancelled',
        cancelledAt: new Date(),
        cancellationReason: 'Reconciled — source rent invoice cancelled',
        updatedAt: new Date(),
      })
      .where(eq(financialInvoices.id, row.id));
    financialRowsCancelled += 1;
    await syncRentInvoiceToUnified(row.rent_id);
    rentUnifiedSynced += 1;
  }

  const driftElec = await db.execute<{ id: string; elec_id: string }>(sql`
    SELECT fi.id, ei.id AS elec_id
    FROM financial_invoices fi
    INNER JOIN electricity_invoices ei ON fi.source_table = 'electricity_invoices' AND fi.source_id = ei.id
    WHERE ei.status = 'cancelled'
      AND fi.status NOT IN ('cancelled', 'refunded')
      ${elecMonthFilter}
  `);

  for (const row of Array.from(driftElec)) {
    await db
      .update(financialInvoices)
      .set({
        status: 'cancelled',
        cancelledAt: new Date(),
        cancellationReason: 'Reconciled — source electricity invoice cancelled',
        updatedAt: new Date(),
      })
      .where(eq(financialInvoices.id, row.id));
    financialRowsCancelled += 1;
    await syncElectricityInvoiceToUnified(row.elec_id);
    elecUnifiedSynced += 1;
  }

  const orphanPaidRent = await db.execute<{ rent_id: string }>(sql`
    SELECT ri.id AS rent_id
    FROM rent_invoices ri
    LEFT JOIN financial_invoices fi ON fi.source_table = 'rent_invoices' AND fi.source_id = ri.id
    WHERE ri.status IN ('pending', 'overdue', 'cancelled')
      AND fi.id IS NOT NULL
      AND fi.status IN ('paid', 'sent', 'overdue', 'draft')
      ${monthFilter}
  `);

  for (const row of Array.from(orphanPaidRent)) {
    await syncRentInvoiceToUnified(row.rent_id);
    financialRowsFixed += 1;
    rentUnifiedSynced += 1;
  }

  const orphanPaidElec = await db.execute<{ elec_id: string }>(sql`
    SELECT ei.id AS elec_id
    FROM electricity_invoices ei
    LEFT JOIN financial_invoices fi ON fi.source_table = 'electricity_invoices' AND fi.source_id = ei.id
    WHERE ei.status IN ('pending', 'cancelled')
      AND fi.id IS NOT NULL
      AND fi.status IN ('paid', 'sent', 'overdue', 'draft')
      ${elecMonthFilter}
  `);

  for (const row of Array.from(orphanPaidElec)) {
    await syncElectricityInvoiceToUnified(row.elec_id);
    financialRowsFixed += 1;
    elecUnifiedSynced += 1;
  }

  return {
    rentUnifiedSynced,
    elecUnifiedSynced,
    financialRowsCancelled,
    financialRowsFixed,
  };
}

/** MTD rent collected from paid rent invoices only (excludes cancelled). */
export async function sumPaidRentByPgForBillingMonth(billingMonth: string) {
  return db
    .select({
      pgId: rentInvoices.pgId,
      total: sql<number>`coalesce(sum(${rentInvoices.paidPrincipalPaise} + ${rentInvoices.paidLateFeePaise}), 0)::bigint::int`,
    })
    .from(rentInvoices)
    .where(and(eq(rentInvoices.status, 'paid'), eq(rentInvoices.billingMonth, billingMonth)))
    .groupBy(rentInvoices.pgId);
}

/** MTD electricity collected from paid electricity invoices only. */
export async function sumPaidElectricityByPgForBillingMonth(billingMonth: string) {
  const rows = await db.execute<{ pg_id: string; total: number }>(sql`
    SELECT
      eb.pg_id::text AS pg_id,
      coalesce(sum(ei.paid_paise + coalesce(ei.late_fee_locked_paise, 0)), 0)::bigint::int AS total
    FROM electricity_invoices ei
    INNER JOIN electricity_bills eb ON eb.id = ei.electricity_bill_id
    WHERE ei.status = 'paid'
      AND ei.billing_month = ${billingMonth}::date
    GROUP BY eb.pg_id
  `);
  return Array.from(rows).map((r) => ({ pgId: r.pg_id, total: Number(r.total) }));
}

/** Global paid rent for a billing month — SSOT check helper. */
export async function sumPaidRentForBillingMonth(billingMonth: string): Promise<number> {
  const [row] = await db
    .select({
      total: sql<number>`coalesce(sum(${rentInvoices.paidPrincipalPaise} + ${rentInvoices.paidLateFeePaise}), 0)::bigint::int`,
    })
    .from(rentInvoices)
    .where(and(eq(rentInvoices.status, 'paid'), eq(rentInvoices.billingMonth, billingMonth)));
  return Number(row?.total ?? 0);
}

/** Re-export resident financial engine — use for all outstanding/required/paid figures. */
export {
  getResidentFinancialSummary,
  getBookingFinancialSummary,
  getGlobalFinancialAggregates,
  getPortfolioFinancialTotals,
  getPortfolioRentStats,
  recalculateBillingAfterVacatingRestore,
} from '@/src/services/residentFinancialEngine';

/** Count non-cancelled invoices that still contribute to outstanding (pending/overdue/paid). */
export function activeRentInvoiceStatuses() {
  return ['pending', 'overdue', 'paid'] as const;
}

export async function countDriftedFinancialInvoices(billingMonth?: string): Promise<number> {
  const monthFilter = billingMonth
    ? sql`AND ri.billing_month = ${billingMonth}::date`
    : sql``;
  const [row] = await db.execute<{ cnt: number }>(sql`
    SELECT count(*)::int AS cnt FROM (
      SELECT fi.id
      FROM financial_invoices fi
      INNER JOIN rent_invoices ri ON fi.source_table = 'rent_invoices' AND fi.source_id = ri.id
      WHERE ri.status = 'cancelled' AND fi.status NOT IN ('cancelled', 'refunded')
        ${monthFilter}
      UNION ALL
      SELECT fi.id
      FROM financial_invoices fi
      INNER JOIN electricity_invoices ei ON fi.source_table = 'electricity_invoices' AND fi.source_id = ei.id
      WHERE ei.status = 'cancelled' AND fi.status NOT IN ('cancelled', 'refunded')
        ${billingMonth ? sql`AND ei.billing_month = ${billingMonth}::date` : sql``}
    ) x
  `);
  return Number((Array.from(row ? [row] : [])[0] as { cnt: number } | undefined)?.cnt ?? 0);
}

/** Pending/overdue rent invoices only — never includes cancelled. */
export async function listActiveRentInvoiceIdsForMonth(billingMonth: string) {
  return db
    .select({ id: rentInvoices.id })
    .from(rentInvoices)
    .where(
      and(
        eq(rentInvoices.billingMonth, billingMonth),
        inArray(rentInvoices.status, ['pending', 'overdue']),
      ),
    );
}
