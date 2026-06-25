/**
 * Billing health metrics for System Health + Billing Center dashboard.
 */

import { and, count, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  billingGenerationFailures,
  billingGenerationRuns,
  bookings,
  customers,
  electricityBills,
  rentInvoices,
} from '@/src/db/schema';
import { nextBillingSchedulerRunUtc, todayInBillingTimezone } from '@/src/lib/billing/billingTimezone';
import { collectibleResidentFilters } from '@/src/lib/billing/productionDataFilter';
import { getLatestBillingGenerationRun } from '@/src/services/billingScheduler';
import { listPendingPaymentReviews } from '@/src/services/paymentProofQueue';

export type BillingHealthSnapshot = {
  nextSchedulerRunUtc: string;
  todayIst: string;
  lastRun: {
    id: string;
    runDate: string;
    status: string;
    createdCount: number;
    failedCount: number;
    startedAt: string;
    finishedAt: string | null;
  } | null;
  invoicesGeneratedToday: number;
  unresolvedFailures: number;
  pendingApprovals: number;
  overdueRentInvoices: number;
  lastElectricityBatchAt: string | null;
};

export async function getBillingHealthSnapshot(): Promise<BillingHealthSnapshot> {
  const todayIst = todayInBillingTimezone();
  const nextRun = nextBillingSchedulerRunUtc();
  const lastRun = await getLatestBillingGenerationRun();

  const [generatedTodayRow] = await db
    .select({ count: count() })
    .from(rentInvoices)
    .where(
      and(
        eq(rentInvoices.isAdhoc, false),
        sql`(${rentInvoices.createdAt} AT TIME ZONE 'Asia/Kolkata')::date = ${todayIst}::date`,
      ),
    );

  const [failuresRow] = await db
    .select({ count: count() })
    .from(billingGenerationFailures)
    .where(isNull(billingGenerationFailures.resolvedAt));

  const [overdueRow] = await db
    .select({ count: count() })
    .from(rentInvoices)
    .innerJoin(bookings, eq(bookings.id, rentInvoices.bookingId))
    .innerJoin(customers, eq(customers.id, rentInvoices.customerId))
    .where(
      and(
        collectibleResidentFilters(),
        eq(rentInvoices.isAdhoc, false),
        inArray(rentInvoices.status, ['pending', 'overdue']),
        sql`${rentInvoices.dueDate} < ${todayIst}::date`,
      ),
    );

  const [elecRow] = await db
    .select({ createdAt: electricityBills.createdAt })
    .from(electricityBills)
    .orderBy(desc(electricityBills.createdAt))
    .limit(1);

  const pendingReviews = await listPendingPaymentReviews({ limit: 500 });

  return {
    nextSchedulerRunUtc: nextRun.toISOString(),
    todayIst,
    lastRun: lastRun
      ? {
          id: lastRun.id,
          runDate: lastRun.runDate,
          status: lastRun.status,
          createdCount: lastRun.createdCount,
          failedCount: lastRun.failedCount,
          startedAt: lastRun.startedAt.toISOString(),
          finishedAt: lastRun.finishedAt?.toISOString() ?? null,
        }
      : null,
    invoicesGeneratedToday: generatedTodayRow?.count ?? 0,
    unresolvedFailures: failuresRow?.count ?? 0,
    pendingApprovals: pendingReviews.length,
    overdueRentInvoices: overdueRow?.count ?? 0,
    lastElectricityBatchAt: elecRow?.createdAt?.toISOString() ?? null,
  };
}
