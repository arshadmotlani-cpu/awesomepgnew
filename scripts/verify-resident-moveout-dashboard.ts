#!/usr/bin/env npx tsx
/**
 * Pre-commit resident move-out / dashboard verification (read-only by default).
 *
 *   RESIDENT_VERIFY_BOOKING_CODE=APG-2026-xxxx npx tsx scripts/verify-resident-moveout-dashboard.ts
 *   RESIDENT_VERIFY_CUSTOMER_EMAIL=user@example.com npx tsx scripts/verify-resident-moveout-dashboard.ts
 *   USE_PRODUCTION_DB=1 npx tsx scripts/verify-resident-moveout-dashboard.ts
 *
 * Optional: RESIDENT_VERIFY_EXECUTE_DATE_PREVIEW=1 — preview date change (+3 days from vacate, if valid)
 */
import { loadProductionAuditEnv, requireDatabaseUrl } from '@/src/lib/db/loadEnv';

loadProductionAuditEnv();
requireDatabaseUrl('verify-resident-moveout-dashboard.ts');

import { and, eq, inArray, sql } from 'drizzle-orm';
import { createClient, closeDb } from '@/src/db/client';
import { rentInvoices } from '@/src/db/schema';
import { addDays, formatDate, parseDate } from '@/src/lib/dates';
import { VACATING_NOTICE_MIN_DAYS } from '@/src/services/billing';
import { computeVacatingFinalPeriodRentDecision } from '@/src/lib/billing/vacatingFinalPeriodRent';
import { getVacatingForBooking } from '@/src/db/queries/customer';
import { loadEstimatedSettlementForVacating } from '@/src/lib/vacating/estimatedSettlementPreview';
import { loadResidentAccountContextSafe } from '@/src/services/residentAccountContextSafe';
import {
  getResidentFinancialAccount,
} from '@/src/services/residentFinancialEngine';
import { listRentInvoicesForBooking } from '@/src/db/queries/customer';
import {
  getResidentMoveOutSettlementContext,
} from '@/src/services/checkoutSettlement';
import {
  getPendingVacatingDateChangeForBooking,
  previewVacatingDateChange,
} from '@/src/services/vacatingDateChange';
import { computeNoticeDeductionForBooking, loadPaidRentCoveragePeriods } from '@/src/services/noticeDeduction';
import { db } from '@/src/db/client';

type CheckResult = { id: string; pass: boolean; detail: string };

const results: CheckResult[] = [];

function record(id: string, pass: boolean, detail: string) {
  results.push({ id, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'} [${id}] ${detail}`);
}

function failAndExit(msg: string): never {
  console.error(`\nABORT: ${msg}`);
  process.exit(1);
}

type Subject = {
  customerId: string;
  customerEmail: string | null;
  customerName: string;
  bookingId: string;
  bookingCode: string;
  durationMode: string | null;
  stayType: string | null;
  vacatingId: string;
  vacatingStatus: string;
  vacatingDate: string;
  noticeGivenDate: string;
  monthlyRentPaiseSnapshot: number;
  noticeRentCoveredDays: number;
  noticeChargeableDays: number;
  deductionPaise: number;
};

async function resolveSubject(): Promise<Subject> {
  const bookingCode = process.env.RESIDENT_VERIFY_BOOKING_CODE?.trim();
  const customerEmail = process.env.RESIDENT_VERIFY_CUSTOMER_EMAIL?.trim();

  const { db: database, close } = createClient({ max: 1 });

  const buildWhere = () => {
    if (bookingCode) {
      return sql`b.booking_code = ${bookingCode}`;
    }
    if (customerEmail) {
      return sql`lower(c.email) = lower(${customerEmail})`;
    }
    return sql`TRUE`;
  };

  const explicitTarget = Boolean(bookingCode || customerEmail);

  const primary = await database.execute<{
    customer_id: string;
    customer_email: string | null;
    customer_name: string;
    booking_id: string;
    booking_code: string;
    duration_mode: string | null;
    stay_type: string | null;
    vacating_id: string;
    vacating_status: string;
    vacating_date: string;
    notice_given_date: string;
    monthly_rent_paise_snapshot: number;
    notice_rent_covered_days: number;
    notice_chargeable_days: number;
    deduction_paise: number;
  }>(sql`
    SELECT
      c.id AS customer_id,
      c.email AS customer_email,
      c.full_name AS customer_name,
      b.id AS booking_id,
      b.booking_code,
      b.duration_mode,
      b.stay_type,
      vr.id AS vacating_id,
      vr.status AS vacating_status,
      vr.vacating_date::text AS vacating_date,
      vr.notice_given_date::text AS notice_given_date,
      vr.monthly_rent_paise_snapshot,
      vr.notice_rent_covered_days,
      vr.notice_chargeable_days,
      vr.deduction_paise
    FROM vacating_requests vr
    INNER JOIN bookings b ON b.id = vr.booking_id
    INNER JOIN customers c ON c.id = b.customer_id
    WHERE b.status = 'confirmed'
      AND (${buildWhere()})
      AND (
        vr.status = 'approved'
        OR (${explicitTarget ? sql`TRUE` : sql`FALSE`} AND vr.status = 'pending')
      )
    ORDER BY CASE WHEN vr.status = 'approved' THEN 0 ELSE 1 END, vr.updated_at DESC
    LIMIT 1
  `);

  let row = primary[0];

  if (!row && (bookingCode || customerEmail)) {
    await close();
    failAndExit(
      `No approved/pending vacating for RESIDENT_VERIFY_* target (code=${bookingCode ?? '—'}, email=${customerEmail ?? '—'})`,
    );
  }

  if (!row) {
    const fallback = await database.execute<typeof primary[0]>(sql`
      SELECT
        c.id AS customer_id,
        c.email AS customer_email,
        c.full_name AS customer_name,
        b.id AS booking_id,
        b.booking_code,
        b.duration_mode,
        b.stay_type,
        vr.id AS vacating_id,
        vr.status AS vacating_status,
        vr.vacating_date::text AS vacating_date,
        vr.notice_given_date::text AS notice_given_date,
        vr.monthly_rent_paise_snapshot,
        vr.notice_rent_covered_days,
        vr.notice_chargeable_days,
        vr.deduction_paise
      FROM vacating_requests vr
      INNER JOIN bookings b ON b.id = vr.booking_id
      INNER JOIN customers c ON c.id = b.customer_id
      WHERE vr.status = 'approved'
        AND b.status = 'confirmed'
        AND b.duration_mode IN ('monthly', 'open_ended')
      ORDER BY vr.updated_at DESC
      LIMIT 1
    `);
    row = fallback[0];
  }

  await close();

  if (!row) {
    failAndExit('No approved vacating booking found in database (set RESIDENT_VERIFY_BOOKING_CODE)');
  }

  console.log(
    `\nSubject: ${row.customer_name} · ${row.booking_code} · vacating ${row.vacating_date} (${row.vacating_status})\n`,
  );

  return {
    customerId: row.customer_id,
    customerEmail: row.customer_email,
    customerName: row.customer_name,
    bookingId: row.booking_id,
    bookingCode: row.booking_code,
    durationMode: row.duration_mode,
    stayType: row.stay_type,
    vacatingId: row.vacating_id,
    vacatingStatus: row.vacating_status,
    vacatingDate: formatDate(parseDate(row.vacating_date)),
    noticeGivenDate: formatDate(parseDate(row.notice_given_date)),
    monthlyRentPaiseSnapshot: Number(row.monthly_rent_paise_snapshot),
    noticeRentCoveredDays: Number(row.notice_rent_covered_days),
    noticeChargeableDays: Number(row.notice_chargeable_days),
    deductionPaise: Number(row.deduction_paise),
  };
}

async function check1DashboardLoaders(subject: Subject): Promise<boolean> {
  try {
    const ctxLoad = await loadResidentAccountContextSafe(subject.customerId, subject.customerEmail);
    if (!ctxLoad.ok) {
      record(
        '1.dashboard_context',
        false,
        `loadResidentAccountContextSafe: ${ctxLoad.reason} ${ctxLoad.errorMessage ?? ''}`.trim(),
      );
      return false;
    }
    record(
      '1.dashboard_context',
      true,
      `context ok · primaryBooking=${ctxLoad.ctx.primaryBooking?.bookingId ?? 'none'}`,
    );

    await getResidentFinancialAccount(subject.customerId);
    await listRentInvoicesForBooking(subject.bookingId);
    await getVacatingForBooking(subject.bookingId);
    record('1.dashboard_loaders', true, 'financial account + rent invoices + vacating loaders ok');
    return true;
  } catch (err) {
    record('1.dashboard_loaders', false, String(err));
    return false;
  }
}

async function check2RequestsMoveOut(subject: Subject): Promise<boolean> {
  try {
    await getResidentMoveOutSettlementContext(subject.customerId, subject.bookingId);
    await getPendingVacatingDateChangeForBooking(subject.bookingId);
    record('2.requests_move_out', true, 'move-out settlement context + pending date change loaders ok');
    return true;
  } catch (err) {
    record('2.requests_move_out', false, String(err));
    return false;
  }
}

function check3ApprovedDate(subject: Subject): boolean {
  const dateOk = /^\d{4}-\d{2}-\d{2}$/.test(subject.vacatingDate);
  if (subject.vacatingStatus === 'approved') {
    record(
      '3.approved_leaving_date',
      dateOk,
      dateOk
        ? `approved · leaving ${subject.vacatingDate}`
        : `invalid date ${subject.vacatingDate}`,
    );
    return dateOk;
  }
  if (subject.vacatingStatus === 'pending') {
    record(
      '3.approved_leaving_date',
      dateOk,
      dateOk
        ? `pending notice · leaving ${subject.vacatingDate} (approve for final-period invoice checks)`
        : `pending but invalid date ${subject.vacatingDate}`,
    );
    return dateOk;
  }
  record(
    '3.approved_leaving_date',
    false,
    `unexpected status=${subject.vacatingStatus}`,
  );
  return false;
}

async function check4EstimatedSettlement(subject: Subject): Promise<{
  ok: boolean;
  estimated: Awaited<ReturnType<typeof loadEstimatedSettlementForVacating>>;
}> {
  try {
    const estimated = await loadEstimatedSettlementForVacating({
      bookingId: subject.bookingId,
      noticeGivenDate: subject.noticeGivenDate,
      vacatingDate: subject.vacatingDate,
      monthlyRentPaiseSnapshot: subject.monthlyRentPaiseSnapshot,
      noticeRentCoveredDays: subject.noticeRentCoveredDays,
      noticeChargeableDays: subject.noticeChargeableDays,
      deductionPaise: subject.deductionPaise,
      durationMode: subject.durationMode,
      stayType: subject.stayType,
    });
    const pass =
      estimated != null &&
      Number.isFinite(estimated.waterfall.refund.totalPaise) &&
      estimated.estimatedRefundPaise === estimated.waterfall.refund.totalPaise;
    record(
      '4.estimated_settlement',
      pass,
      estimated
        ? `refund ₹${(estimated.estimatedRefundPaise / 100).toFixed(2)} · tailRent ₹${((estimated.waterfall.depositBucket.tailRentPaise ?? 0) / 100).toFixed(2)}`
        : 'preview returned null',
    );
    return { ok: pass, estimated };
  } catch (err) {
    record('4.estimated_settlement', false, String(err));
    return { ok: false, estimated: null };
  }
}

async function check5Notice(subject: Subject): Promise<boolean> {
  try {
    const breakdown = await computeNoticeDeductionForBooking({
      bookingId: subject.bookingId,
      noticeGivenDate: subject.noticeGivenDate,
      vacatingDate: subject.vacatingDate,
      monthlyRentPaise: subject.monthlyRentPaiseSnapshot,
    });
    const stored = Number(subject.deductionPaise);
    const recomputed = Number(breakdown.noticeDeductionPaise);
    const pass = stored === recomputed;
    record(
      '5.notice_deduction',
      pass,
      pass
        ? `${recomputed} paise · chargeable days ${breakdown.chargeableNoticeDays}`
        : `stored=${stored} recomputed=${recomputed}`,
    );
    return pass;
  } catch (err) {
    record('5.notice_deduction', false, String(err));
    return false;
  }
}

function check6EstimatedRefund(
  estimated: NonNullable<Awaited<ReturnType<typeof loadEstimatedSettlementForVacating>>>,
): boolean {
  const w = estimated.waterfall;
  const pass =
    estimated.estimatedRefundPaise === w.refund.totalPaise &&
    estimated.estimatedRefundableDepositPaise === w.depositBucket.refundablePaise;
  record(
    '6.estimated_refund',
    pass,
    `total ₹${(w.refund.totalPaise / 100).toFixed(2)} (deposit ₹${(w.depositBucket.refundablePaise / 100).toFixed(2)} + unused rent ₹${(w.refund.unusedRentPortionPaise / 100).toFixed(2)})`,
  );
  return pass;
}

async function check7FinalInvoiceSuppression(subject: Subject): Promise<boolean> {
  if (subject.vacatingStatus !== 'approved') {
    record(
      '7.final_invoice_suppression',
      true,
      `skipped — vacating is ${subject.vacatingStatus} (approved-only suppression)`,
    );
    return true;
  }
  try {
    const { periods, billingDay, moveInDate } = await loadPaidRentCoveragePeriods(subject.bookingId);
    if (!moveInDate) {
      record('7.final_invoice_suppression', true, 'skipped — no move-in date');
      return true;
    }
    const decision = computeVacatingFinalPeriodRentDecision({
      vacatingApproved: true,
      vacatingDate: subject.vacatingDate,
      billingDay,
      moveInDate,
      monthlyRentPaise: subject.monthlyRentPaiseSnapshot,
      paidPeriods: periods,
    });

    if (!decision.shouldSuppressFinalInvoice) {
      record(
        '7.final_invoice_suppression',
        true,
        `not applicable (suppress=false) · period ${decision.periodStart ?? '—'} → ${decision.periodEnd ?? '—'}`,
      );
      return true;
    }

    const billingMonth = decision.invoiceBillingMonth;
    if (!billingMonth) {
      record('7.final_invoice_suppression', false, 'shouldSuppress but no invoiceBillingMonth');
      return false;
    }

    const bad = await db
      .select({ id: rentInvoices.id, status: rentInvoices.status })
      .from(rentInvoices)
      .where(
        and(
          eq(rentInvoices.bookingId, subject.bookingId),
          eq(rentInvoices.billingMonth, billingMonth),
          eq(rentInvoices.isAdhoc, false),
          inArray(rentInvoices.status, ['pending', 'overdue']),
        ),
      )
      .limit(3);

    const pass = bad.length === 0;
    record(
      '7.final_invoice_suppression',
      pass,
      pass
        ? `no pending/overdue invoice for ${billingMonth} · tail ${decision.tailDays}d`
        : `pending invoice(s): ${bad.map((r) => `${r.id.slice(0, 8)}… (${r.status})`).join(', ')}`,
    );
    return pass;
  } catch (err) {
    record('7.final_invoice_suppression', false, String(err));
    return false;
  }
}

async function check8DateChangePreview(subject: Subject): Promise<boolean> {
  if (subject.vacatingStatus !== 'approved') {
    record(
      '8.date_change_recalc',
      true,
      `skipped — vacating is ${subject.vacatingStatus} (date change requires approval)`,
    );
    return true;
  }
  if (process.env.RESIDENT_VERIFY_EXECUTE_DATE_PREVIEW !== '1') {
    record('8.date_change_recalc', true, 'skipped (set RESIDENT_VERIFY_EXECUTE_DATE_PREVIEW=1 to run preview)');
    return true;
  }

  try {
    const today = formatDate(new Date());
    const minNoticeEnd = formatDate(
      addDays(subject.noticeGivenDate, VACATING_NOTICE_MIN_DAYS),
    );
    let candidate = formatDate(addDays(subject.vacatingDate, 3));
    if (candidate < minNoticeEnd) {
      candidate = formatDate(addDays(minNoticeEnd, 1));
    }
    if (candidate <= today) {
      candidate = formatDate(addDays(today, 7));
    }
    if (candidate === subject.vacatingDate) {
      candidate = formatDate(addDays(candidate, 7));
    }

    const preview = await previewVacatingDateChange({
      bookingId: subject.bookingId,
      customerId: subject.customerId,
      requestedVacatingDate: candidate,
    });

    if (!preview.ok) {
      const skippable =
        preview.error.includes('checkout settlement has started') ||
        preview.error.includes('cannot change leaving date');
      record(
        '8.date_change_recalc',
        skippable,
        skippable ? `skipped: ${preview.error}` : preview.error,
      );
      return skippable;
    }

    const pass =
      Number.isFinite(preview.preview.refundDeltaPaise) &&
      preview.preview.requestedEstimatedSettlement != null &&
      preview.preview.currentEstimatedSettlement != null;
    record(
      '8.date_change_recalc',
      pass,
      `${subject.vacatingDate} → ${candidate} · delta ${preview.preview.refundDeltaPaise} paise`,
    );
    return pass;
  } catch (err) {
    record('8.date_change_recalc', false, String(err));
    return false;
  }
}

async function main() {
  console.log('=== Resident move-out dashboard verification ===\n');

  const subject = await resolveSubject();

  let allPass = true;
  allPass = (await check1DashboardLoaders(subject)) && allPass;
  allPass = (await check2RequestsMoveOut(subject)) && allPass;
  allPass = check3ApprovedDate(subject) && allPass;

  const { ok: estOk, estimated } = await check4EstimatedSettlement(subject);
  allPass = estOk && allPass;
  allPass = (await check5Notice(subject)) && allPass;
  if (estimated) {
    allPass = check6EstimatedRefund(estimated) && allPass;
  } else {
    record('6.estimated_refund', false, 'skipped — no settlement preview');
    allPass = false;
  }

  allPass = (await check7FinalInvoiceSuppression(subject)) && allPass;
  allPass = (await check8DateChangePreview(subject)) && allPass;

  record(
    '9.no_runtime_errors',
    allPass,
    allPass ? 'all checklist checks passed in this script run' : 'one or more checks failed',
  );

  console.log('\n--- Summary ---');
  for (const r of results) {
    console.log(`  ${r.pass ? '✓' : '✗'} ${r.id}: ${r.detail}`);
  }

  await closeDb();
  process.exit(allPass ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  await closeDb();
  process.exit(1);
});
