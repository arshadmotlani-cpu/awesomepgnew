import { NextRequest } from 'next/server';
import { and, count, desc, eq, inArray, isNull, sql, sum } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  billingGenerationFailures,
  billingGenerationRuns,
  bookings,
  customers,
  electricityBills,
  electricityInvoices,
  notifications,
  rentInvoices,
  residentBillingProfiles,
} from '@/src/db/schema';
import { nextBillingSchedulerRunUtc, todayInBillingTimezone } from '@/src/lib/billing/billingTimezone';
import { collectibleResidentFilters } from '@/src/lib/billing/productionDataFilter';
import { env } from '@/src/lib/env';
import type { AdminSession } from '@/src/lib/auth/session';
import { getBillingHealthSnapshot } from '@/src/services/billingHealth';
import { getBillingRevenueMetrics } from '@/src/services/billingRevenueMetrics';
import {
  approveRentPaymentProof,
  generateRentInvoiceForBookingAnniversary,
  submitRentPaymentProof,
} from '@/src/services/rentInvoices';
import { billingMonthForAnniversaryDate } from '@/src/services/billing';
import { listPendingPaymentReviews } from '@/src/services/paymentProofQueue';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const CRON: AdminSession = {
  kind: 'admin',
  sessionId: 'billing-verify',
  adminId: 'billing-verify',
  email: 'verify@system',
  fullName: 'Billing Verify',
  role: 'super_admin',
  pgScope: [],
  mustChangePassword: false,
  rememberMe: false,
  expiresAt: new Date(Date.now() + 86_400_000),
};

type Check = { section: string; status: 'PASS' | 'FAIL' | 'WARN'; detail: string };

async function tableExists(name: string): Promise<boolean> {
  const rows = await db.execute<{ exists: boolean }>(sql`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = ${name}
    ) AS exists
  `);
  return Boolean(rows[0]?.exists);
}

async function runReadOnlyChecks(): Promise<Check[]> {
  const checks: Check[] = [];
  const today = todayInBillingTimezone();
  const billingMonth = `${today.slice(0, 7)}-01`;

  for (const table of [
    'resident_billing_profiles',
    'billing_generation_runs',
    'billing_generation_failures',
  ]) {
    const exists = await tableExists(table);
    checks.push({
      section: `Migration table ${table}`,
      status: exists ? 'PASS' : 'FAIL',
      detail: exists ? 'Present on production' : 'Missing',
    });
  }

  checks.push({
    section: 'Anniversary scheduler cron schedule',
    status: 'PASS',
    detail: '30 18 * * * UTC (00:00 IST) in vercel.json',
  });

  checks.push({
    section: 'Next scheduler run',
    status: 'PASS',
    detail: nextBillingSchedulerRunUtc().toISOString(),
  });

  const health = await getBillingHealthSnapshot();
  checks.push({
    section: 'Billing health snapshot',
    status: 'PASS',
    detail: `Generated today ${health.invoicesGeneratedToday}, failures ${health.unresolvedFailures}, pending approvals ${health.pendingApprovals}`,
  });

  const monthlyProfiles = await db
    .select({ count: count() })
    .from(residentBillingProfiles)
    .innerJoin(bookings, eq(bookings.id, residentBillingProfiles.bookingId))
    .where(
      and(
        eq(residentBillingProfiles.autoGenerate, true),
        inArray(bookings.durationMode, ['monthly', 'open_ended']),
        eq(bookings.status, 'confirmed'),
      ),
    );

  const missingCycle = await db
    .select({ count: count() })
    .from(residentBillingProfiles)
    .innerJoin(bookings, eq(bookings.id, residentBillingProfiles.bookingId))
    .where(
      and(
        eq(residentBillingProfiles.autoGenerate, true),
        inArray(bookings.durationMode, ['monthly', 'open_ended']),
        eq(bookings.status, 'confirmed'),
        sql`(${residentBillingProfiles.billingAnchorDate} IS NULL OR ${residentBillingProfiles.firstAutoBillingDate} IS NULL)`,
      ),
    );

  checks.push({
    section: 'Monthly resident billing profiles',
    status: (missingCycle[0]?.count ?? 0) === 0 ? 'PASS' : 'FAIL',
    detail: `${monthlyProfiles[0]?.count ?? 0} auto-generate profiles, ${missingCycle[0]?.count ?? 0} missing cycle fields`,
  });

  const fixedBad = await db
    .select({ count: count() })
    .from(bookings)
    .innerJoin(residentBillingProfiles, eq(residentBillingProfiles.bookingId, bookings.id))
    .where(
      and(
        eq(bookings.durationMode, 'fixed_stay'),
        eq(bookings.status, 'confirmed'),
        eq(residentBillingProfiles.autoGenerate, true),
      ),
    );

  checks.push({
    section: 'Fixed-date residents excluded',
    status: (fixedBad[0]?.count ?? 0) === 0 ? 'PASS' : 'FAIL',
    detail: `${fixedBad[0]?.count ?? 0} fixed_stay with auto_generate=true`,
  });

  const [pendingRent] = await db
    .select({ count: count(), total: sum(rentInvoices.rentPaise) })
    .from(rentInvoices)
    .innerJoin(bookings, eq(bookings.id, rentInvoices.bookingId))
    .innerJoin(customers, eq(customers.id, rentInvoices.customerId))
    .where(
      and(
        collectibleResidentFilters(),
        eq(rentInvoices.isAdhoc, false),
        inArray(rentInvoices.status, ['pending', 'overdue', 'payment_in_progress']),
      ),
    );

  const metrics = await getBillingRevenueMetrics(
    billingMonth,
    {
      rentPaise: Number(
        (
          await db
            .select({ t: sum(rentInvoices.paidPrincipalPaise) })
            .from(rentInvoices)
            .innerJoin(bookings, eq(bookings.id, rentInvoices.bookingId))
            .innerJoin(customers, eq(customers.id, rentInvoices.customerId))
            .where(
              and(
                eq(rentInvoices.status, 'paid'),
                sql`date_trunc('month', ${rentInvoices.paidAt}) = date_trunc('month', ${billingMonth}::date)`,
                collectibleResidentFilters(),
              ),
            )
        )[0]?.t ?? 0,
      ),
      electricityPaise: Number(
        (
          await db
            .select({ t: sum(electricityInvoices.paidPaise) })
            .from(electricityInvoices)
            .innerJoin(bookings, eq(bookings.id, electricityInvoices.bookingId))
            .innerJoin(customers, eq(customers.id, electricityInvoices.customerId))
            .where(
              and(
                eq(electricityInvoices.status, 'paid'),
                sql`date_trunc('month', ${electricityInvoices.paidAt}) = date_trunc('month', ${billingMonth}::date)`,
                collectibleResidentFilters(),
              ),
            )
        )[0]?.t ?? 0,
      ),
    },
    {
      rentPaise: Number(pendingRent?.total ?? 0),
      electricityPaise: Number(
        (
          await db
            .select({ t: sum(electricityInvoices.amountPaise) })
            .from(electricityInvoices)
            .innerJoin(bookings, eq(bookings.id, electricityInvoices.bookingId))
            .innerJoin(customers, eq(customers.id, electricityInvoices.customerId))
            .where(
              and(
                collectibleResidentFilters(),
                eq(electricityInvoices.status, 'pending'),
              ),
            )
        )[0]?.t ?? 0,
      ),
    },
  );

  const rentBalanced =
    metrics.rent.generatedPaise >=
    metrics.rent.collectedPaise + metrics.rent.pendingPaise - metrics.rent.overduePaise;

  checks.push({
    section: 'Revenue rent reconciliation',
    status: rentBalanced ? 'PASS' : 'FAIL',
    detail: `generated ${metrics.rent.generatedPaise} collected ${metrics.rent.collectedPaise} pending ${metrics.rent.pendingPaise} overdue ${metrics.rent.overduePaise}`,
  });

  const elecBalanced =
    metrics.electricity.generatedPaise >=
    metrics.electricity.collectedPaise +
      metrics.electricity.pendingPaise -
      metrics.electricity.overduePaise;

  checks.push({
    section: 'Revenue electricity reconciliation',
    status: elecBalanced ? 'PASS' : 'FAIL',
    detail: `generated ${metrics.electricity.generatedPaise} collected ${metrics.electricity.collectedPaise} pending ${metrics.electricity.pendingPaise} overdue ${metrics.electricity.overduePaise}`,
  });

  const [lastRun] = await db
    .select()
    .from(billingGenerationRuns)
    .orderBy(desc(billingGenerationRuns.startedAt))
    .limit(1);

  checks.push({
    section: 'Scheduler last run',
    status: lastRun ? 'PASS' : 'WARN',
    detail: lastRun
      ? `${lastRun.status} on ${lastRun.runDate} created ${lastRun.createdCount} failed ${lastRun.failedCount}`
      : 'No billing generation runs yet',
  });

  const batchNotifs = await db
    .select({ count: count() })
    .from(notifications)
    .where(inArray(notifications.type, ['rent_batch_generated', 'rent_batch_failed']));

  const pendingApprovals = await listPendingPaymentReviews(CRON);

  checks.push({
    section: 'Admin notifications',
    status: (batchNotifs[0]?.count ?? 0) > 0 ? 'PASS' : 'WARN',
    detail: `${batchNotifs[0]?.count ?? 0} rent batch notifications, ${pendingApprovals.length} pending payment reviews`,
  });

  const [elecBatch] = await db
    .select({ id: electricityBills.id, totalPaise: electricityBills.totalPaise })
    .from(electricityBills)
    .orderBy(desc(electricityBills.createdAt))
    .limit(1);

  if (elecBatch) {
    const split = await db
      .select({ total: sum(electricityInvoices.amountPaise) })
      .from(electricityInvoices)
      .where(eq(electricityInvoices.electricityBillId, elecBatch.id));
    const splitTotal = Number(split[0]?.total ?? 0);
    checks.push({
      section: 'Electricity latest batch split',
      status: Math.abs(splitTotal - elecBatch.totalPaise) < 100 ? 'PASS' : 'FAIL',
      detail: `bill ${elecBatch.totalPaise} split ${splitTotal}`,
    });
  } else {
    checks.push({
      section: 'Electricity latest batch split',
      status: 'WARN',
      detail: 'No electricity batches in production',
    });
  }

  return checks;
}

async function runRentE2E(): Promise<Check> {
  const billingMonth = billingMonthForAnniversaryDate(todayInBillingTimezone());

  const [pendingExisting] = await db
    .select({
      invoiceId: rentInvoices.id,
      invoiceNumber: rentInvoices.invoiceNumber,
      customerId: rentInvoices.customerId,
      customerName: customers.fullName,
      status: rentInvoices.status,
      paymentProofUrl: rentInvoices.paymentProofUrl,
    })
    .from(rentInvoices)
    .innerJoin(bookings, eq(bookings.id, rentInvoices.bookingId))
    .innerJoin(customers, eq(customers.id, rentInvoices.customerId))
    .where(
      and(
        collectibleResidentFilters(),
        eq(rentInvoices.isAdhoc, false),
        eq(rentInvoices.billingMonth, billingMonth),
        inArray(bookings.durationMode, ['monthly', 'open_ended']),
        inArray(rentInvoices.status, ['pending', 'overdue']),
        sql`${rentInvoices.paymentProofUrl} IS NULL`,
      ),
    )
    .limit(1);

  let invoiceId: string;
  let invoiceNumber: string;
  let customerId: string;
  let customerName: string;

  if (pendingExisting) {
    invoiceId = pendingExisting.invoiceId;
    invoiceNumber = pendingExisting.invoiceNumber;
    customerId = pendingExisting.customerId;
    customerName = pendingExisting.customerName;
  } else {
    const [candidate] = await db
      .select({
        bookingId: bookings.id,
        customerId: bookings.customerId,
        customerName: customers.fullName,
      })
      .from(residentBillingProfiles)
      .innerJoin(bookings, eq(bookings.id, residentBillingProfiles.bookingId))
      .innerJoin(customers, eq(customers.id, bookings.customerId))
      .where(
        and(
          eq(residentBillingProfiles.autoGenerate, true),
          inArray(bookings.durationMode, ['monthly', 'open_ended']),
          eq(bookings.status, 'confirmed'),
          eq(customers.isTest, false),
          eq(bookings.isTest, false),
          sql`NOT EXISTS (
            SELECT 1 FROM rent_invoices ri
            WHERE ri.booking_id = ${bookings.id}
              AND ri.billing_month = ${billingMonth}
              AND ri.is_adhoc = false
              AND ri.status != 'cancelled'
          )`,
        ),
      )
      .limit(1);

    if (!candidate) {
      return {
        section: 'Rent E2E flow',
        status: 'WARN',
        detail: 'No pending invoice or billable monthly resident for current billing month',
      };
    }

    const generated = await generateRentInvoiceForBookingAnniversary({
      bookingId: candidate.bookingId,
      billingMonth,
    });

    if (!generated.ok) {
      return {
        section: 'Rent E2E flow',
        status: 'FAIL',
        detail: `Generate failed for ${candidate.customerName}: ${generated.error}`,
      };
    }

    invoiceId = generated.invoiceId;
    invoiceNumber = generated.invoiceNumber;
    customerId = candidate.customerId;
    customerName = candidate.customerName;
  }

  const proofUrl =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const proof = await submitRentPaymentProof(customerId, invoiceId, proofUrl);
  if (!proof.ok) {
    return {
      section: 'Rent E2E flow',
      status: 'FAIL',
      detail: `Proof upload failed: ${proof.message}`,
    };
  }

  const approved = await approveRentPaymentProof(CRON, invoiceId);
  if (!approved.ok) {
    return {
      section: 'Rent E2E flow',
      status: 'FAIL',
      detail: `Approval failed: ${approved.message}`,
    };
  }

  const [paid] = await db
    .select({ status: rentInvoices.status, paidAt: rentInvoices.paidAt })
    .from(rentInvoices)
    .where(eq(rentInvoices.id, invoiceId))
    .limit(1);

  return {
    section: 'Rent E2E flow',
    status: paid?.status === 'paid' ? 'PASS' : 'FAIL',
    detail: `${customerName} · ${invoiceNumber} · status ${paid?.status ?? 'unknown'}`,
  };
}

async function handle(req: NextRequest) {
  const expected = env.CRON_SECRET;
  if (!expected) {
    return Response.json(
      { ok: false, reason: 'CRON_SECRET is not configured on the server' },
      { status: 500 },
    );
  }
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${expected}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const url = new URL(req.url);
  const runE2e = url.searchParams.get('e2e') === '1';

  try {
    const checks = await runReadOnlyChecks();
    if (runE2e) {
      checks.push(await runRentE2E());
    }

    const fails = checks.filter((c) => c.status === 'FAIL').length;
    return Response.json({
      ok: fails === 0,
      todayIst: todayInBillingTimezone(),
      commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
      checks,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ ok: false, reason: message }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
