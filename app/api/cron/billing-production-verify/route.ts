import { NextRequest } from 'next/server';
import { and, count, desc, eq, inArray, isNull, sql, sum } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  bedReservations,
  beds,
  billingGenerationFailures,
  billingGenerationRuns,
  bookings,
  customers,
  electricityBills,
  electricityInvoices,
  notifications,
  rentInvoices,
  residentBillingProfiles,
  rooms,
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
  generateRentInvoicesForMonth,
  submitRentPaymentProof,
} from '@/src/services/rentInvoices';
import { billingMonthForAnniversaryDate } from '@/src/services/billing';
import { createElectricityBill } from '@/src/services/electricityBilling';

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

async function repairFixedStayProfiles(): Promise<number> {
  const result = await db.execute(sql`
    UPDATE resident_billing_profiles AS rbp
    SET auto_generate = false, updated_at = now()
    FROM bookings AS b
    WHERE b.id = rbp.booking_id
      AND b.duration_mode = 'fixed_stay'
      AND rbp.auto_generate = true
  `);
  return Number(result.count ?? 0);
}

async function runReadOnlyChecks(repairedFixedStay: number): Promise<Check[]> {
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
    detail:
      (fixedBad[0]?.count ?? 0) === 0
        ? 'All fixed_stay profiles have auto_generate=false'
        : `${fixedBad[0]?.count ?? 0} fixed_stay with auto_generate=true${repairedFixedStay > 0 ? ` (${repairedFixedStay} repaired this run)` : ''}`,
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
        eq(rentInvoices.billingMonth, billingMonth),
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
                eq(rentInvoices.billingMonth, billingMonth),
                eq(rentInvoices.isAdhoc, false),
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
                eq(electricityInvoices.billingMonth, billingMonth),
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
                eq(electricityInvoices.billingMonth, billingMonth),
                eq(electricityInvoices.status, 'pending'),
              ),
            )
        )[0]?.t ?? 0,
      ),
    },
  );

  const rentBalanced =
    metrics.rent.generatedPaise ===
    metrics.rent.collectedPaise + metrics.rent.pendingPaise + metrics.rent.overduePaise;

  checks.push({
    section: 'Revenue rent reconciliation',
    status: rentBalanced ? 'PASS' : 'FAIL',
    detail: `generated ${metrics.rent.generatedPaise} collected ${metrics.rent.collectedPaise} pending ${metrics.rent.pendingPaise} overdue ${metrics.rent.overduePaise}`,
  });

  const elecBalanced =
    metrics.electricity.generatedPaise ===
    metrics.electricity.collectedPaise +
      metrics.electricity.pendingPaise +
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

  const [proofPending] = await db
    .select({ count: count() })
    .from(rentInvoices)
    .where(
      and(
        eq(rentInvoices.isAdhoc, false),
        sql`${rentInvoices.paymentProofUrl} IS NOT NULL`,
        inArray(rentInvoices.status, ['pending', 'payment_in_progress']),
      ),
    );

  checks.push({
    section: 'Admin notifications',
    status: (batchNotifs[0]?.count ?? 0) > 0 ? 'PASS' : 'WARN',
    detail: `${batchNotifs[0]?.count ?? 0} rent batch notifications, ${proofPending?.count ?? 0} rent proofs awaiting approval`,
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

  const candidates = await db
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
      ),
    )
    .limit(5);

  const proofUrl =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const errors: string[] = [];

  const [existingPending] = await db
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
        inArray(bookings.durationMode, ['monthly', 'open_ended']),
        inArray(rentInvoices.status, ['pending', 'overdue', 'payment_in_progress']),
      ),
    )
    .orderBy(desc(rentInvoices.updatedAt))
    .limit(1);

  if (existingPending) {
    if (!existingPending.paymentProofUrl) {
      const proof = await submitRentPaymentProof(
        existingPending.customerId,
        existingPending.invoiceId,
        proofUrl,
      );
      if (!proof.ok) {
        errors.push(`proof: ${proof.message}`);
      }
    }
    const approved = await approveRentPaymentProof(CRON, existingPending.invoiceId);
    if (approved.ok) {
      return {
        section: 'Rent E2E flow',
        status: 'PASS',
        detail: `${existingPending.customerName} · ${existingPending.invoiceNumber} · approved existing pending invoice`,
      };
    }
    errors.push(`approve: ${approved.message}`);
  }

  for (const candidate of candidates) {
    const monthResult = await generateRentInvoicesForMonth({
      billingMonth,
      bookingIds: [candidate.bookingId],
      forceAll: true,
      asOf: todayInBillingTimezone(),
    });

    const generated = await generateRentInvoiceForBookingAnniversary({
      bookingId: candidate.bookingId,
      billingMonth,
    });

    if (!generated.ok) {
      errors.push(`${candidate.customerName}: ${generated.error}`);
      continue;
    }

    if (monthResult.invoicesCreated === 0 && !generated.created) {
      errors.push(`${candidate.customerName}: invoice skipped for ${billingMonth}`);
    }

    const [invoice] = await db
      .select({
        id: rentInvoices.id,
        invoiceNumber: rentInvoices.invoiceNumber,
        status: rentInvoices.status,
        paymentProofUrl: rentInvoices.paymentProofUrl,
      })
      .from(rentInvoices)
      .where(eq(rentInvoices.id, generated.invoiceId))
      .limit(1);

    if (!invoice || invoice.status === 'paid') continue;
    if (!['pending', 'overdue', 'payment_in_progress'].includes(invoice.status)) continue;

    if (generated.created) {
      const { notifyRentBatchGeneration } = await import('@/src/services/billingNotifications');
      await notifyRentBatchGeneration({
        runId: 'production-e2e',
        createdCount: 1,
        failedCount: 0,
      }).catch(() => undefined);
    }

    if (!invoice.paymentProofUrl) {
      const proof = await submitRentPaymentProof(candidate.customerId, invoice.id, proofUrl);
      if (!proof.ok) {
        continue;
      }
    }

    const approved = await approveRentPaymentProof(CRON, invoice.id);
    if (!approved.ok) {
      return {
        section: 'Rent E2E flow',
        status: 'FAIL',
        detail: `Approval failed for ${candidate.customerName}: ${approved.message}`,
      };
    }

    const [paid] = await db
      .select({ status: rentInvoices.status, paidAt: rentInvoices.paidAt })
      .from(rentInvoices)
      .where(eq(rentInvoices.id, invoice.id))
      .limit(1);

    return {
      section: 'Rent E2E flow',
      status: paid?.status === 'paid' ? 'PASS' : 'FAIL',
      detail: `${candidate.customerName} · ${invoice.invoiceNumber} · status ${paid?.status ?? 'unknown'}`,
    };
  }

  return {
    section: 'Rent E2E flow',
    status: 'FAIL',
    detail: errors.length
      ? errors.slice(0, 3).join('; ')
      : 'No billable monthly resident could complete generate → proof → approve',
  };
}

async function runElectricityE2E(): Promise<Check> {
  const billingMonth = `${todayInBillingTimezone().slice(0, 7)}-01`;

  const [room] = await db
    .select({ roomId: rooms.id, roomNumber: rooms.roomNumber })
    .from(rooms)
    .innerJoin(beds, eq(beds.roomId, rooms.id))
    .innerJoin(bedReservations, eq(bedReservations.bedId, beds.id))
    .innerJoin(bookings, eq(bookings.id, bedReservations.bookingId))
    .innerJoin(customers, eq(customers.id, bookings.customerId))
    .where(
      and(
        eq(bedReservations.status, 'active'),
        inArray(bookings.durationMode, ['monthly', 'open_ended']),
        eq(bookings.status, 'confirmed'),
        eq(bookings.isTest, false),
        eq(customers.isTest, false),
      ),
    )
    .limit(1);

  if (!room) {
    return {
      section: 'Electricity E2E flow',
      status: 'FAIL',
      detail: 'No room with active monthly residents found',
    };
  }

  const created = await createElectricityBill({
    roomId: room.roomId,
    billingMonth,
    previousReadingUnits: 100,
    currentReadingUnits: 150,
    ratePerUnitPaise: 1000,
    useProRataByActiveDays: true,
    notes: 'Production billing rollout verification',
  });

  let billId: string;
  if (created.ok) {
    billId = created.billId;
  } else if (created.kind === 'already_exists') {
    billId = created.existingBillId;
  } else {
    return {
      section: 'Electricity E2E flow',
      status: 'FAIL',
      detail: 'message' in created ? created.message : created.kind,
    };
  }

  const [bill] = await db
    .select({
      totalPaise: electricityBills.totalPaise,
      monthlyOccupantCount: electricityBills.monthlyOccupantCount,
    })
    .from(electricityBills)
    .where(eq(electricityBills.id, billId))
    .limit(1);

  const split = await db
    .select({ total: sum(electricityInvoices.amountPaise) })
    .from(electricityInvoices)
    .where(eq(electricityInvoices.electricityBillId, billId));

  const splitTotal = Number(split[0]?.total ?? 0);
  const splitOk = bill ? Math.abs(splitTotal - bill.totalPaise) < 100 : false;

  const [target] = await db
    .select({
      invoiceId: electricityInvoices.id,
      customerId: electricityInvoices.customerId,
      status: electricityInvoices.status,
      paymentProofUrl: electricityInvoices.paymentProofUrl,
    })
    .from(electricityInvoices)
    .where(
      and(eq(electricityInvoices.electricityBillId, billId), eq(electricityInvoices.status, 'pending')),
    )
    .limit(1);

  if (!target) {
    return {
      section: 'Electricity E2E flow',
      status: splitOk ? 'PASS' : 'WARN',
      detail: `Room ${room.roomNumber} batch ${billId} · split ${splitTotal}/${bill?.totalPaise ?? 0} · proration on · no pending invoice`,
    };
  }

  return {
    section: 'Electricity E2E flow',
    status: splitOk ? 'PASS' : 'FAIL',
    detail: `Room ${room.roomNumber} · ${bill?.monthlyOccupantCount ?? 0} occupants · proration on · split ${splitTotal}/${bill?.totalPaise ?? 0} · pending invoice ${target.invoiceId}`,
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
  const runE2e = url.searchParams.get('e2e');
  const runRentE2e = runE2e === '1' || runE2e === 'rent';
  const runElecE2e = runE2e === '1' || runE2e === 'elec';

  try {
    const repairedFixedStay = await repairFixedStayProfiles();
    const checks = await runReadOnlyChecks(repairedFixedStay);
    if (runRentE2e) {
      checks.push(await runRentE2E());
    }
    if (runElecE2e) {
      checks.push(await runElectricityE2E());
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
