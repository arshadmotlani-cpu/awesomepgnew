/**
 * Billing health metrics + composite health score for Billing Command Centre.
 */

import { and, count, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  billingGenerationFailures,
  billingGenerationRuns,
  bookings,
  customers,
  electricityBills,
  electricityInvoices,
  rentInvoices,
} from '@/src/db/schema';
import { nextBillingSchedulerRunUtc, todayInBillingTimezone } from '@/src/lib/billing/billingTimezone';
import { collectibleResidentFilters } from '@/src/lib/billing/productionDataFilter';
import { getLatestBillingGenerationRun } from '@/src/services/billingScheduler';
import { loadUpcomingRentSchedule } from '@/src/services/billingUpcomingSchedule';

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
  dueInSevenDays: number;
  upcomingScheduledResidents: number;
  healthScore: number;
  healthGrade: 'excellent' | 'good' | 'fair' | 'poor' | 'critical';
  healthIssues: string[];
};

export function computeBillingHealthScore(input: {
  unresolvedFailures: number;
  overdueRentInvoices: number;
  pendingApprovals: number;
  lastRunFailed: boolean;
  dueInSevenDays: number;
}): { score: number; grade: BillingHealthSnapshot['healthGrade']; issues: string[] } {
  let score = 100;
  const issues: string[] = [];

  if (input.unresolvedFailures > 0) {
    const penalty = Math.min(30, input.unresolvedFailures * 10);
    score -= penalty;
    issues.push(`${input.unresolvedFailures} failed rent generation(s) need attention`);
  }
  if (input.overdueRentInvoices > 0) {
    const penalty = Math.min(25, Math.ceil(input.overdueRentInvoices / 2));
    score -= penalty;
    issues.push(`${input.overdueRentInvoices} overdue rent invoice(s)`);
  }
  if (input.pendingApprovals > 0) {
    const penalty = Math.min(15, input.pendingApprovals * 3);
    score -= penalty;
    issues.push(`${input.pendingApprovals} payment proof(s) awaiting approval`);
  }
  if (input.lastRunFailed) {
    score -= 15;
    issues.push('Last scheduler run did not complete successfully');
  }

  score = Math.max(0, Math.min(100, score));

  const grade: BillingHealthSnapshot['healthGrade'] =
    score >= 90
      ? 'excellent'
      : score >= 75
        ? 'good'
        : score >= 60
          ? 'fair'
          : score >= 40
            ? 'poor'
            : 'critical';

  if (issues.length === 0 && input.dueInSevenDays > 0) {
    issues.push(`${input.dueInSevenDays} rent bill(s) due in the next 7 days`);
  }

  return { score, grade, issues };
}

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

  const sevenDaysOut = sql`((${todayIst}::date + interval '7 days'))::date`;
  const [dueSoonRow] = await db
    .select({ count: count() })
    .from(rentInvoices)
    .where(
      and(
        eq(rentInvoices.isAdhoc, false),
        inArray(rentInvoices.status, ['pending', 'overdue', 'payment_in_progress']),
        sql`${rentInvoices.dueDate} >= ${todayIst}::date`,
        sql`${rentInvoices.dueDate} <= ${sevenDaysOut}`,
      ),
    );

  const [elecRow] = await db
    .select({ createdAt: electricityBills.createdAt })
    .from(electricityBills)
    .orderBy(desc(electricityBills.createdAt))
    .limit(1);

  const [rentProofPending] = await db
    .select({ count: count() })
    .from(rentInvoices)
    .where(
      and(
        eq(rentInvoices.isAdhoc, false),
        sql`${rentInvoices.paymentProofUrl} IS NOT NULL`,
        inArray(rentInvoices.status, ['pending', 'payment_in_progress']),
      ),
    );

  const [elecProofPending] = await db
    .select({ count: count() })
    .from(electricityInvoices)
    .where(
      and(
        sql`${electricityInvoices.paymentProofUrl} IS NOT NULL`,
        eq(electricityInvoices.status, 'pending'),
      ),
    );

  const pendingApprovals =
    (rentProofPending?.count ?? 0) + (elecProofPending?.count ?? 0);

  const upcoming = await loadUpcomingRentSchedule({ fromDate: todayIst, horizonDays: 14 }).catch(
    () => ({
      totalScheduledResidents: 0,
      days: [],
      fromDate: todayIst,
      throughDate: todayIst,
      totalExpectedPaise: 0,
    }),
  );

  const unresolvedFailures = failuresRow?.count ?? 0;
  const overdueRentInvoices = overdueRow?.count ?? 0;
  const dueInSevenDays = dueSoonRow?.count ?? 0;
  const lastRunFailed = lastRun != null && lastRun.status === 'failed';

  const { score, grade, issues } = computeBillingHealthScore({
    unresolvedFailures,
    overdueRentInvoices,
    pendingApprovals,
    lastRunFailed,
    dueInSevenDays,
  });

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
    unresolvedFailures,
    pendingApprovals,
    overdueRentInvoices,
    lastElectricityBatchAt: elecRow?.createdAt?.toISOString() ?? null,
    dueInSevenDays,
    upcomingScheduledResidents: upcoming.totalScheduledResidents,
    healthScore: score,
    healthGrade: grade,
    healthIssues: issues,
  };
}
