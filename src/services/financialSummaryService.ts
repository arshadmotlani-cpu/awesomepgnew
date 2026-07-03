/**
 * Financial summary SSOT — outstanding invoices and collection totals.
 *
 * Overview, Operations, Billing Center, Revenue, and Resident Billing must
 * derive rent/electricity outstanding counts and amounts from this module only.
 */

import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  getDailyCollectionTotals,
  listAdminElectricityInvoicesForReminders,
  listAdminOpenRentInvoices,
  type AdminElectricityInvoiceReminderRow,
  type AdminRentInvoiceRow,
  type CollectionBreakdown,
} from '@/src/db/queries/admin';
import { bookings, customers, rentInvoices } from '@/src/db/schema';
import { adminCanAccessPg } from '@/src/lib/auth/roles';
import type { AdminSession } from '@/src/lib/auth/session';
import {
  isElectricityAwaitingAdminApproval,
  isElectricityAwaitingResidentPayment,
} from '@/src/lib/billing/electricityCollectibility';
import { collectibleResidentFilters } from '@/src/lib/billing/productionDataFilter';
import { getFinancialMetrics } from '@/src/services/financialMetricsEngine';
import { resolveBillingMonth } from '@/src/lib/dateDefaults';

/** Rent invoices awaiting resident payment (unpaid + partially paid, not in review). */
export function filterRentAwaitingResidentPayment(rows: AdminRentInvoiceRow[]): AdminRentInvoiceRow[] {
  return rows.filter(
    (r) =>
      r.outstandingPaise > 0 &&
      r.effectiveStatus !== 'paid' &&
      r.effectiveStatus !== 'cancelled' &&
      r.effectiveStatus !== 'payment_in_progress',
  );
}

/** Electricity invoices awaiting resident payment — same rule as Billing Center / collections queue. */
export function filterElectricityAwaitingResidentPayment(
  rows: AdminElectricityInvoiceReminderRow[],
): AdminElectricityInvoiceReminderRow[] {
  return rows.filter((r) => {
    if (!r.bookingId) return false;
    return isElectricityAwaitingResidentPayment({
      id: r.id,
      status: 'pending',
      paymentProofUrl: r.paymentProofUrl,
      outstandingPaise: r.outstandingPaise,
      effectiveStatus: r.effectiveStatus,
      bookingId: r.bookingId,
      billingMonth: r.billingMonth,
    });
  });
}

export type InvoiceOutstandingSnapshot = {
  allOpenRent: AdminRentInvoiceRow[];
  allOpenElectricity: AdminElectricityInvoiceReminderRow[];
  rentWaiting: AdminRentInvoiceRow[];
  electricityWaiting: AdminElectricityInvoiceReminderRow[];
  rentInReview: AdminRentInvoiceRow[];
  electricityInReview: AdminElectricityInvoiceReminderRow[];
};

function filterRowsBySessionPg<T extends { pgId: string }>(
  rows: T[],
  session?: AdminSession,
): T[] {
  if (!session) return rows;
  return rows.filter((r) =>
    adminCanAccessPg({ role: session.role, pgScope: session.pgScope }, r.pgId),
  );
}

/** Load open rent + electricity invoices with operational queue filters applied. */
export async function loadInvoiceOutstandingSnapshot(
  session?: AdminSession,
): Promise<InvoiceOutstandingSnapshot> {
  const [openRentRes, elecRes] = await Promise.all([
    listAdminOpenRentInvoices(),
    listAdminElectricityInvoicesForReminders(),
  ]);

  const allOpenRent = filterRowsBySessionPg(openRentRes.ok ? openRentRes.data : [], session);
  const allOpenElectricity = filterRowsBySessionPg(
    elecRes.ok ? elecRes.data : [],
    session,
  );

  const rentWaiting = filterRentAwaitingResidentPayment(allOpenRent);
  const electricityWaiting = filterElectricityAwaitingResidentPayment(allOpenElectricity);

  return {
    allOpenRent,
    allOpenElectricity,
    rentWaiting,
    electricityWaiting,
    rentInReview: allOpenRent.filter((r) => r.effectiveStatus === 'payment_in_progress'),
    electricityInReview: allOpenElectricity.filter((r) =>
      isElectricityAwaitingAdminApproval({
        status: 'pending',
        paymentProofUrl: r.paymentProofUrl,
      }),
    ),
  };
}

export type OutstandingMoneyFromInvoices = {
  pendingRentInvoices: number;
  pendingRentInvoicesPaise: number;
  pendingElectricityInvoices: number;
  pendingElectricityInvoicesPaise: number;
  /** Rent + electricity outstanding only — no deposits, wallets, or booking balances. */
  totalOutstandingPaise: number;
};

export function computeOutstandingMoneyFromInvoices(
  snapshot: Pick<InvoiceOutstandingSnapshot, 'rentWaiting' | 'electricityWaiting'>,
): OutstandingMoneyFromInvoices {
  const pendingRentInvoicesPaise = snapshot.rentWaiting.reduce(
    (sum, row) => sum + row.outstandingPaise,
    0,
  );
  const pendingElectricityInvoicesPaise = snapshot.electricityWaiting.reduce(
    (sum, row) => sum + row.outstandingPaise,
    0,
  );

  return {
    pendingRentInvoices: snapshot.rentWaiting.length,
    pendingRentInvoicesPaise,
    pendingElectricityInvoices: snapshot.electricityWaiting.length,
    pendingElectricityInvoicesPaise,
    totalOutstandingPaise: pendingRentInvoicesPaise + pendingElectricityInvoicesPaise,
  };
}

export type RentInvoiceStats = {
  pendingCount: number;
  overdueCount: number;
  paidCount: number;
  cancelledCount: number;
  totalRentPaise: number;
  collectedPaise: number;
  outstandingPaise: number;
};

/** Rent invoice status counts + outstanding from the same open-invoice SSOT as Operations. */
export async function loadRentInvoiceStats(
  session?: AdminSession,
  snapshot?: InvoiceOutstandingSnapshot,
): Promise<RentInvoiceStats> {
  const resolved = snapshot ?? (await loadInvoiceOutstandingSnapshot(session));
  const rentWaiting = resolved.rentWaiting;

  const [counts] = await db
    .select({
      pendingCount: sql<number>`count(*) FILTER (WHERE ${rentInvoices.status} = 'pending')::int`,
      overdueCount: sql<number>`count(*) FILTER (WHERE ${rentInvoices.status} = 'overdue')::int`,
      paidCount: sql<number>`count(*) FILTER (WHERE ${rentInvoices.status} = 'paid')::int`,
      cancelledCount: sql<number>`count(*) FILTER (WHERE ${rentInvoices.status} = 'cancelled')::int`,
    })
    .from(rentInvoices)
    .innerJoin(bookings, eq(bookings.id, rentInvoices.bookingId))
    .innerJoin(customers, eq(customers.id, rentInvoices.customerId))
    .where(collectibleResidentFilters());

  const outstandingPaise = rentWaiting.reduce((sum, row) => sum + row.outstandingPaise, 0);
  const collectedPaise = rentWaiting.reduce(
    (sum, row) => sum + row.paidPrincipalPaise + row.paidLateFeePaise,
    0,
  );
  const totalRentPaise = rentWaiting.reduce((sum, row) => sum + row.rentPaise, 0);

  return {
    pendingCount: rentWaiting.filter((r) => r.effectiveStatus === 'pending').length,
    overdueCount: rentWaiting.filter((r) => r.effectiveStatus === 'overdue').length,
    paidCount: Number(counts?.paidCount ?? 0),
    cancelledCount: Number(counts?.cancelledCount ?? 0),
    totalRentPaise,
    collectedPaise,
    outstandingPaise,
  };
}

export type CollectionsSnapshot = {
  today: CollectionBreakdown;
  mtd: CollectionBreakdown & {
    lateFeePaise: number;
    otherIncomePaise: number;
    depositRefundedPaise: number;
    netInflowPaise: number;
  };
};

/** Today + MTD collections from approved payment records only (via FinancialMetricsEngine). */
export async function loadCollectionsSnapshot(
  billingMonthInput?: string,
): Promise<CollectionsSnapshot> {
  const billingMonth = resolveBillingMonth(billingMonthInput);
  const [todayResult, financialMetrics] = await Promise.all([
    getDailyCollectionTotals(),
    getFinancialMetrics(billingMonth),
  ]);

  const today: CollectionBreakdown = todayResult.ok
    ? todayResult.data
    : { rentPaise: 0, electricityPaise: 0, depositPaise: 0, totalPaise: 0 };

  const mtd = {
    rentPaise: financialMetrics.operating.rentPrincipalPaise,
    electricityPaise: financialMetrics.operating.electricityPaise,
    lateFeePaise: financialMetrics.operating.lateFeePaise,
    otherIncomePaise: financialMetrics.operating.otherIncomePaise,
    depositPaise: financialMetrics.deposits.collectedPaise,
    totalPaise: financialMetrics.operating.operatingRevenuePaise,
    depositRefundedPaise: financialMetrics.deposits.refundedPaise,
    netInflowPaise: financialMetrics.deposits.netCashInflowPaise,
  };

  return { today, mtd };
}

export type InvoiceBreakdownReport = {
  rent: {
    generated: number;
    paid: number;
    partiallyPaid: number;
    outstandingPaise: number;
  };
  electricity: {
    generated: number;
    paid: number;
    partiallyPaid: number;
    outstandingPaise: number;
  };
};

/** Detailed invoice breakdown for verification scripts. */
export function buildInvoiceBreakdownReport(
  snapshot: InvoiceOutstandingSnapshot,
): InvoiceBreakdownReport {
  const rentPartial = snapshot.rentWaiting.filter(
    (r) => r.paidPrincipalPaise + r.paidLateFeePaise > 0,
  ).length;
  const elecPartial = snapshot.electricityWaiting.filter((r) => {
    const paid = r.amountPaise - r.outstandingPaise;
    return paid > 0;
  }).length;

  return {
    rent: {
      generated: snapshot.allOpenRent.length,
      paid: snapshot.allOpenRent.filter((r) => r.effectiveStatus === 'paid').length,
      partiallyPaid: rentPartial,
      outstandingPaise: snapshot.rentWaiting.reduce((s, r) => s + r.outstandingPaise, 0),
    },
    electricity: {
      generated: snapshot.allOpenElectricity.length,
      paid: 0,
      partiallyPaid: elecPartial,
      outstandingPaise: snapshot.electricityWaiting.reduce((s, r) => s + r.outstandingPaise, 0),
    },
  };
}
