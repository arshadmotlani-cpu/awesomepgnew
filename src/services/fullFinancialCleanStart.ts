/**
 * Full financial clean start — wipes ALL financial data to zero state.
 * Does not change billing engine logic or schema; data-only reset.
 */

import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  actionItems,
  bookings,
  couponRedemptions,
  depositLedger,
  depositSettlements,
  electricityBills,
  electricityInvoices,
  financialInvoices,
  invoiceAuditEvents,
  paymentLinks,
  payments,
  pgPaymentRecords,
  rentInvoices,
  residentRequests,
  roomElectricityPrepaidLedger,
} from '@/src/db/schema';
import { purgeOccupancyPlaceholderFromSystem } from '@/src/services/occupancyAdmin';
import { runOperatorTestDataCleanup } from '@/src/services/operatorTestDataCleanup';
import type { AdminSession } from '@/src/lib/auth/session';

const RESET_REASON = 'Full financial clean start — manual re-entry only going forward';

const BILLING_ACTION_TYPES = [
  'rent_due',
  'electricity_due',
  'refund_pending',
  'payment_received',
  'deposit_refund_request',
  'deposit_collection_due',
] as const;

export type FullFinancialCleanStartPreview = {
  depositLedgerRows: number;
  depositSettlements: number;
  rentInvoices: number;
  electricityInvoices: number;
  electricityBills: number;
  financialInvoices: number;
  pgPaymentRecords: number;
  payments: number;
  paymentLinks: number;
  couponRedemptions: number;
  prepaidLedgerRows: number;
  openActionItems: number;
  openRefundRequests: number;
};

export type FullFinancialCleanStartResult = FullFinancialCleanStartPreview & {
  bookingsReset: number;
  occupancyPurge: Awaited<ReturnType<typeof purgeOccupancyPlaceholderFromSystem>>;
  testCleanup: Awaited<ReturnType<typeof runOperatorTestDataCleanup>>;
};

async function countRows(table: string) {
  const rows = await db.execute<{ c: number }>(sql.raw(`SELECT count(*)::int AS c FROM ${table}`));
  const row = Array.from(rows)[0];
  return Number(row?.c ?? 0);
}

export async function previewFullFinancialCleanStart(): Promise<FullFinancialCleanStartPreview> {
  const [
    depositLedgerRows,
    depositSettlements,
    rentInvoicesCount,
    electricityInvoicesCount,
    electricityBillsCount,
    financialInvoicesCount,
    pgPaymentRecordsCount,
    paymentsCount,
    paymentLinksCount,
    couponRedemptionsCount,
    prepaidLedgerRows,
    openActionItems,
    openRefundRequests,
  ] = await Promise.all([
    countRows('deposit_ledger'),
    countRows('deposit_settlements'),
    countRows('rent_invoices'),
    countRows('electricity_invoices'),
    countRows('electricity_bills'),
    countRows('financial_invoices'),
    countRows('pg_payment_records'),
    countRows('payments'),
    countRows('payment_links'),
    countRows('coupon_redemptions'),
    countRows('room_electricity_prepaid_ledger'),
    db
      .select({ c: sql<number>`count(*)::int` })
      .from(actionItems)
      .where(
        and(
          inArray(actionItems.status, ['open', 'in_progress']),
          inArray(actionItems.type, [...BILLING_ACTION_TYPES]),
        ),
      )
      .then((r) => Number(r[0]?.c ?? 0)),
    db
      .select({ c: sql<number>`count(*)::int` })
      .from(residentRequests)
      .where(
        and(
          sql`${residentRequests.type} = 'deposit_refund'`,
          inArray(residentRequests.status, ['submitted', 'under_review', 'approved']),
        ),
      )
      .then((r) => Number(r[0]?.c ?? 0)),
  ]);

  return {
    depositLedgerRows,
    depositSettlements,
    rentInvoices: rentInvoicesCount,
    electricityInvoices: electricityInvoicesCount,
    electricityBills: electricityBillsCount,
    financialInvoices: financialInvoicesCount,
    pgPaymentRecords: pgPaymentRecordsCount,
    payments: paymentsCount,
    paymentLinks: paymentLinksCount,
    couponRedemptions: couponRedemptionsCount,
    prepaidLedgerRows,
    openActionItems,
    openRefundRequests,
  };
}

export async function runFullFinancialCleanStart(
  session: AdminSession,
): Promise<FullFinancialCleanStartResult> {
  const preview = await previewFullFinancialCleanStart();
  const now = new Date();

  let bookingsReset = 0;

  await db.transaction(async (tx) => {
    await tx.delete(depositSettlements);
    await tx.delete(depositLedger);
    await tx.delete(couponRedemptions);
    await tx.delete(roomElectricityPrepaidLedger);
    await tx.delete(pgPaymentRecords);
    await tx.delete(invoiceAuditEvents);

    await tx
      .update(paymentLinks)
      .set({ status: 'expired' })
      .where(eq(paymentLinks.status, 'active'));

    await tx
      .update(rentInvoices)
      .set({
        status: 'cancelled',
        cancelledAt: now,
        cancellationReason: RESET_REASON,
        paymentId: null,
        paymentProofUrl: null,
        paidPrincipalPaise: 0,
        paidLateFeePaise: 0,
        lateFeeLockedPaise: 0,
        paidAt: null,
        updatedAt: now,
      })
      .where(sql`true`);

    await tx.delete(electricityInvoices);
    await tx.delete(electricityBills);

    await tx
      .update(financialInvoices)
      .set({
        status: 'cancelled',
        cancelledAt: now,
        cancellationReason: RESET_REASON,
        paymentId: null,
        paymentLinkId: null,
        paidAt: null,
        amountPaise: 0,
        breakdown: { paidPaise: 0 },
        updatedAt: now,
      })
      .where(sql`true`);

    await tx
      .update(payments)
      .set({
        status: 'failed',
        paidAt: null,
        updatedAt: now,
      })
      .where(inArray(payments.status, ['succeeded', 'initiated', 'partially_refunded']));

    const bookingRows = await tx
      .update(bookings)
      .set({
        depositDuePaise: 0,
        depositCollectionStatus: 'pending',
        adminDepositRefundStatus: 'unknown',
        adminDuesStatus: 'unknown',
        updatedAt: now,
      })
      .where(inArray(bookings.status, ['confirmed', 'completed', 'pending_payment']))
      .returning({ id: bookings.id });
    bookingsReset = bookingRows.length;

    await tx
      .update(residentRequests)
      .set({
        status: 'rejected',
        adminNotes: RESET_REASON,
        resolvedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          sql`${residentRequests.type} = 'deposit_refund'`,
          inArray(residentRequests.status, ['submitted', 'under_review', 'approved']),
        ),
      );

    await tx
      .update(actionItems)
      .set({
        status: 'resolved',
        updatedAt: now,
      })
      .where(
        and(
          inArray(actionItems.status, ['open', 'in_progress']),
          inArray(actionItems.type, [...BILLING_ACTION_TYPES]),
        ),
      );
  });

  const occupancyPurge = await purgeOccupancyPlaceholderFromSystem(session);
  const testCleanup = await runOperatorTestDataCleanup();

  const { reconcileStaleFinancialInvoices } = await import('@/src/lib/billing/financialMetrics');
  await reconcileStaleFinancialInvoices().catch(() => undefined);
  const { resolveStaleBillingActionItems, syncActionItems } = await import(
    '@/src/services/actionItems'
  );
  await resolveStaleBillingActionItems().catch(() => undefined);
  await syncActionItems(session).catch(() => undefined);

  return {
    ...preview,
    bookingsReset,
    occupancyPurge,
    testCleanup,
  };
}
