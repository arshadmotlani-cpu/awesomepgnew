/**
 * Daily rent billing scheduler — midnight IST anniversary generation.
 */

import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  auditLog,
  bedReservations,
  billingGenerationFailures,
  billingGenerationRuns,
  bookings,
  customers,
  residentBillingProfiles,
} from '@/src/db/schema';
import { todayInBillingTimezone } from '@/src/lib/billing/billingTimezone';
import {
  billingMonthForAnniversaryDate,
  firstAutoBillingDate,
  isBillingAnniversaryToday,
} from '@/src/services/billing';
import {
  generateRentInvoiceForBookingAnniversary,
  markOverdueInvoices,
  expireRentInvoicesPastDue,
} from '@/src/services/rentInvoices';
import {
  isProductionBookingFilter,
  isProductionCustomerFilter,
  isActiveResidentFilter,
} from '@/src/lib/billing/productionDataFilter';
import { ensureBillingProfileForBooking } from '@/src/services/residentBillingProfiles';

export type DailyRentBillingJobResult = {
  runId: string;
  runDate: string;
  status: 'success' | 'partial' | 'failed';
  candidateCount: number;
  createdCount: number;
  skippedCount: number;
  failedCount: number;
  overdue: Awaited<ReturnType<typeof markOverdueInvoices>>;
  expired: Awaited<ReturnType<typeof expireRentInvoicesPastDue>>;
};

async function listAnniversaryCandidates(runDate: string) {
  const rows = await db
    .select({
      bookingId: residentBillingProfiles.bookingId,
      customerId: residentBillingProfiles.customerId,
      pgId: residentBillingProfiles.pgId,
      billingDay: residentBillingProfiles.billingDay,
      billingAnchorDate: residentBillingProfiles.billingAnchorDate,
      firstAutoBillingDate: residentBillingProfiles.firstAutoBillingDate,
      autoGenerate: residentBillingProfiles.autoGenerate,
      durationMode: bookings.durationMode,
      bookingStatus: bookings.status,
    })
    .from(residentBillingProfiles)
    .innerJoin(bookings, eq(bookings.id, residentBillingProfiles.bookingId))
    .innerJoin(customers, eq(customers.id, residentBillingProfiles.customerId))
    .innerJoin(bedReservations, eq(bedReservations.bookingId, bookings.id))
    .where(
      and(
        eq(residentBillingProfiles.autoGenerate, true),
        eq(bookings.status, 'confirmed'),
        isProductionBookingFilter(),
        isProductionCustomerFilter(),
        isActiveResidentFilter(),
        inArray(bookings.durationMode, ['monthly', 'open_ended']),
        eq(bedReservations.status, 'active'),
        sql`${runDate}::date <@ ${bedReservations.stayRange}`,
      ),
    );

  const byBooking = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    if (!byBooking.has(row.bookingId)) byBooking.set(row.bookingId, row);
  }

  const eligible: Array<(typeof rows)[number] & { firstAuto: string }> = [];
  for (const row of byBooking.values()) {
    await ensureBillingProfileForBooking(row.bookingId);
    const anchor =
      row.billingAnchorDate ??
      row.firstAutoBillingDate ??
      null;
    let firstAuto = row.firstAutoBillingDate;
    if (!firstAuto && anchor) {
      firstAuto = firstAutoBillingDate(anchor, row.billingDay);
    }
    if (!firstAuto) continue;
    if (!isBillingAnniversaryToday(runDate, row.billingDay, firstAuto)) continue;
    eligible.push({ ...row, firstAuto });
  }
  return eligible;
}

export async function runDailyRentBillingJob(opts?: {
  asOfIst?: string;
  triggeredBy?: string;
}): Promise<DailyRentBillingJobResult> {
  const runDate = opts?.asOfIst ?? todayInBillingTimezone();
  const billingMonth = billingMonthForAnniversaryDate(runDate);
  const triggeredBy = opts?.triggeredBy ?? 'system';

  const [run] = await db
    .insert(billingGenerationRuns)
    .values({
      runDate,
      status: 'running',
      triggeredBy,
    })
    .returning({ id: billingGenerationRuns.id });

  if (!run) {
    throw new Error('Failed to create billing generation run');
  }

  const runId = run.id;
  let createdCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  try {
    const candidates = await listAnniversaryCandidates(runDate);

    for (const candidate of candidates) {
      try {
        const result = await generateRentInvoiceForBookingAnniversary({
          bookingId: candidate.bookingId,
          billingMonth,
        });
        if (!result.ok) {
          failedCount += 1;
          await db.insert(billingGenerationFailures).values({
            runId,
            bookingId: candidate.bookingId,
            customerId: candidate.customerId,
            pgId: candidate.pgId,
            billingMonth,
            errorCode: result.code ?? 'generation_failed',
            errorMessage: result.error,
          });
          continue;
        }
        if (result.created) createdCount += 1;
        else skippedCount += 1;
      } catch (err) {
        failedCount += 1;
        await db.insert(billingGenerationFailures).values({
          runId,
          bookingId: candidate.bookingId,
          customerId: candidate.customerId,
          pgId: candidate.pgId,
          billingMonth,
          errorCode: 'exception',
          errorMessage: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const overdue = await markOverdueInvoices();
    const expired = await expireRentInvoicesPastDue();

    const status =
      failedCount === 0 ? 'success' : createdCount > 0 ? 'partial' : 'failed';

    await db
      .update(billingGenerationRuns)
      .set({
        finishedAt: new Date(),
        status,
        candidateCount: candidates.length,
        createdCount,
        skippedCount,
        failedCount,
        summary: { billingMonth, runDate },
      })
      .where(eq(billingGenerationRuns.id, runId));

    await db.insert(auditLog).values({
      actorType: 'system',
      actorId: null,
      entity: 'billing_generation_run',
      entityId: runId,
      action: 'completed',
      diff: {
        runDate,
        billingMonth,
        candidateCount: candidates.length,
        createdCount,
        skippedCount,
        failedCount,
        triggeredBy,
      },
    });

    const { notifyRentBatchGeneration } = await import('@/src/services/billingNotifications');
    await notifyRentBatchGeneration({
      runId,
      createdCount,
      failedCount,
    }).catch(() => undefined);

    return {
      runId,
      runDate,
      status,
      candidateCount: candidates.length,
      createdCount,
      skippedCount,
      failedCount,
      overdue,
      expired,
    };
  } catch (err) {
    await db
      .update(billingGenerationRuns)
      .set({
        finishedAt: new Date(),
        status: 'failed',
        failedCount: failedCount + 1,
        summary: { error: err instanceof Error ? err.message : String(err) },
      })
      .where(eq(billingGenerationRuns.id, runId));
    throw err;
  }
}

export async function getLatestBillingGenerationRun() {
  const [row] = await db
    .select()
    .from(billingGenerationRuns)
    .orderBy(desc(billingGenerationRuns.startedAt))
    .limit(1);
  return row ?? null;
}

export async function listBillingGenerationFailures(opts?: {
  runId?: string;
  unresolvedOnly?: boolean;
  limit?: number;
}) {
  const conditions = [];
  if (opts?.runId) conditions.push(eq(billingGenerationFailures.runId, opts.runId));
  if (opts?.unresolvedOnly) conditions.push(isNull(billingGenerationFailures.resolvedAt));

  return db
    .select()
    .from(billingGenerationFailures)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(billingGenerationFailures.createdAt))
    .limit(opts?.limit ?? 50);
}

export async function listTodayGeneratedInvoices(runDate: string) {
  const { rentInvoices, customers, pgs } = await import('@/src/db/schema');
  const dayStart = `${runDate}T00:00:00.000Z`;
  const dayEnd = `${runDate}T23:59:59.999Z`;
  return db
    .select({
      invoiceId: rentInvoices.id,
      invoiceNumber: rentInvoices.invoiceNumber,
      customerName: customers.fullName,
      pgName: pgs.name,
      rentPaise: rentInvoices.rentPaise,
      billingMonth: rentInvoices.billingMonth,
      createdAt: rentInvoices.createdAt,
    })
    .from(rentInvoices)
    .innerJoin(customers, eq(customers.id, rentInvoices.customerId))
    .innerJoin(pgs, eq(pgs.id, rentInvoices.pgId))
    .where(
      and(
        eq(rentInvoices.isAdhoc, false),
        sql`${rentInvoices.createdAt} >= ${dayStart}::timestamptz`,
        sql`${rentInvoices.createdAt} <= ${dayEnd}::timestamptz`,
      ),
    )
    .orderBy(desc(rentInvoices.createdAt));
}

export async function retryBillingGenerationFailure(failureId: string): Promise<{
  ok: boolean;
  error?: string;
}> {
  const [failure] = await db
    .select()
    .from(billingGenerationFailures)
    .where(eq(billingGenerationFailures.id, failureId))
    .limit(1);
  if (!failure) return { ok: false, error: 'Failure not found' };
  if (failure.resolvedAt) return { ok: false, error: 'Already resolved' };
  if (!failure.billingMonth) return { ok: false, error: 'Missing billing month' };

  const result = await generateRentInvoiceForBookingAnniversary({
    bookingId: failure.bookingId,
    billingMonth: failure.billingMonth,
  });

  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  await db
    .update(billingGenerationFailures)
    .set({ resolvedAt: new Date() })
    .where(eq(billingGenerationFailures.id, failureId));

  return { ok: true };
}

export async function retryAllFailuresForRun(runId: string) {
  const failures = await listBillingGenerationFailures({ runId, unresolvedOnly: true, limit: 200 });
  let resolved = 0;
  for (const f of failures) {
    const r = await retryBillingGenerationFailure(f.id);
    if (r.ok) resolved += 1;
  }
  return { attempted: failures.length, resolved };
}
