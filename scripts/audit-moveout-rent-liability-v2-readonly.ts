/**
 * READ-ONLY move-out rent liability audit. Mutations: 0
 */
import { loadProductionAuditEnv, requireDatabaseUrl } from '@/src/lib/db/loadEnv';

loadProductionAuditEnv();
requireDatabaseUrl('audit-moveout-rent-liability-v2');

import { writeFileSync } from 'node:fs';
import { sql } from 'drizzle-orm';
import { closeDb, db } from '@/src/db/client';
import { resolveVacatingAwareRentCharge } from '@/src/lib/billing/billingCoverageModel';
import { computeVacatingFinalPeriodRentDecision } from '@/src/lib/billing/vacatingFinalPeriodRent';
import { buildResidentMoveOutRequestPreview } from '@/src/lib/vacating/residentMoveOutRequestPreview';
import { formatDate, parseDate } from '@/src/lib/dates';
import { paiseToInr } from '@/src/lib/format';
import { calendarMonthBillingPeriod, firstOfMonth } from '@/src/services/billing';
import { loadBillingCoverageModel } from '@/src/services/billingCoverage';

async function analyze(bookingId: string, vacatingDate: string, label: string) {
  const [inv] = (await db.execute(sql`
    SELECT ri.id::text, ri.invoice_number, ri.rent_paise, ri.paid_principal_paise,
           ri.status::text, ri.notes, ri.billing_month::text
    FROM rent_invoices ri
    WHERE ri.booking_id = ${bookingId}::uuid
      AND ri.billing_month = date_trunc('month', ${vacatingDate}::date)::date
      AND ri.is_adhoc = false
      AND ri.status <> 'cancelled'
    LIMIT 1
  `)) as any[];

  const [vr] = (await db.execute(sql`
    SELECT status::text, vacating_date::text, notice_given_date::text,
           monthly_rent_paise_snapshot
    FROM vacating_requests
    WHERE booking_id = ${bookingId}::uuid
      AND status IN ('pending','approved')
    ORDER BY updated_at DESC LIMIT 1
  `)) as any[];

  const [bk] = (await db.execute(sql`
    SELECT bk.booking_code, c.full_name,
           rbp.billing_cycle_policy::text AS policy,
           rbp.billing_day
    FROM bookings bk
    JOIN customers c ON c.id = bk.customer_id
    LEFT JOIN resident_billing_profiles rbp ON rbp.booking_id = bk.id
    WHERE bk.id = ${bookingId}::uuid
    LIMIT 1
  `)) as any[];

  const monthlyGuess =
    Number(vr?.monthly_rent_paise_snapshot ?? 0) || Number(inv?.rent_paise ?? 0);

  const coverage = await loadBillingCoverageModel({
    bookingId,
    vacatingDate,
    monthlyRentPaise: monthlyGuess,
    treatAsApprovedForTail: true,
  });

  let charge: ReturnType<typeof resolveVacatingAwareRentCharge> | null = null;
  let decision: ReturnType<typeof computeVacatingFinalPeriodRentDecision> | null = null;
  if (coverage) {
    const billingPeriod =
      coverage.billingCyclePolicy === 'calendar_month_1st'
        ? calendarMonthBillingPeriod(firstOfMonth(vacatingDate))
        : calendarMonthBillingPeriod(firstOfMonth(vacatingDate));
    decision = computeVacatingFinalPeriodRentDecision({
      vacatingApproved: true,
      vacatingDate,
      billingDay: coverage.billingDay,
      moveInDate: coverage.moveInDate,
      monthlyRentPaise: monthlyGuess || coverage.monthlyRentPaise,
      paidPeriods: coverage.paidInvoiceCoverage,
      billingCyclePolicy: coverage.billingCyclePolicy,
    });
    charge = resolveVacatingAwareRentCharge({
      billingMonth: firstOfMonth(vacatingDate),
      billingDay: coverage.billingDay,
      billingCyclePolicy: coverage.billingCyclePolicy,
      moveInDate: coverage.moveInDate,
      monthlyRentPaise: monthlyGuess || coverage.monthlyRentPaise,
      paidInvoiceCoverage: coverage.paidInvoiceCoverage,
      activeVacating: {
        status: (vr?.status as 'pending' | 'approved') ?? 'pending',
        vacatingDate: formatDate(parseDate(vacatingDate)),
      },
      fullMonthRentPaise: monthlyGuess || coverage.monthlyRentPaise,
      billingPeriod,
      existingInvoice: inv
        ? {
            id: inv.id,
            rentPaise: Number(inv.rent_paise),
            paidPrincipalPaise: Number(inv.paid_principal_paise ?? 0),
            status: inv.status,
          }
        : null,
    });
  }

  const preview = await buildResidentMoveOutRequestPreview({
    bookingId,
    vacatingDate,
    noticeGivenDate: vr?.notice_given_date
      ? String(vr.notice_given_date).slice(0, 10)
      : undefined,
  });

  const paid = Number(inv?.paid_principal_paise ?? 0);
  const rentPaise = Number(inv?.rent_paise ?? 0);

  return {
    label,
    bookingCode: bk?.booking_code,
    name: bk?.full_name,
    policy: bk?.policy ?? coverage?.billingCyclePolicy,
    vacating: vr
      ? { status: vr.status, date: String(vr.vacating_date).slice(0, 10) }
      : { status: null, date: vacatingDate, synthetic: true },
    invoice: inv
      ? {
          number: inv.invoice_number,
          rentPaise,
          rentInr: paiseToInr(rentPaise),
          paidPaise: paid,
          paidInr: paiseToInr(paid),
          status: inv.status,
          notes: inv.notes,
          alreadyProrated: String(inv.notes ?? '').includes('move-out proration'),
        }
      : null,
    decision: decision
      ? {
          suppress: decision.shouldSuppressFinalInvoice,
          tailDays: decision.tailDays,
          tailRentPaise: decision.tailRentPaise,
          tailInr: paiseToInr(decision.tailRentPaise),
          invoiceBillingMonth: decision.invoiceBillingMonth,
          tailStart: decision.tailPeriodStart,
          tailEnd: decision.tailPeriodEnd,
        }
      : null,
    charge: charge
      ? {
          action: charge.billingAction,
          chargeablePaise: charge.chargeablePaise,
          chargeableInr: paiseToInr(charge.chargeablePaise),
          days: charge.chargeableDays,
          blocked: charge.adjustBlockedReason,
          invoiceBillingMonth: charge.invoiceBillingMonth,
        }
      : null,
    preview: preview
      ? {
          throughPaise: preview.rentThroughVacatingPaise,
          throughInr: paiseToInr(preview.rentThroughVacatingPaise),
          settlePaise: preview.finalRentSettlementPaise,
          settleInr: paiseToInr(preview.finalRentSettlementPaise ?? 0),
          unusedPaise: preview.estimatedUnusedRentCreditPaise,
          unusedInr: paiseToInr(preview.estimatedUnusedRentCreditPaise ?? 0),
          noticePaise: preview.noticeDeductionPaise,
        }
      : null,
    gap: {
      invoiceVsChargeable:
        inv && charge ? Number(inv.rent_paise) - charge.chargeablePaise : null,
      previewShowsFullUnpaidLiability:
        preview != null &&
        paid <= 0 &&
        (preview.finalRentSettlementPaise ?? 0) === rentPaise &&
        rentPaise > 0,
      needsAdjust:
        charge?.billingAction === 'adjust_existing' &&
        inv != null &&
        Number(inv.rent_paise) !== charge.chargeablePaise,
    },
  };
}

async function main() {
  const unpaidSep = (await db.execute(sql`
    SELECT bk.id::text AS booking_id, bk.booking_code, c.full_name,
           ri.rent_paise, ri.paid_principal_paise, ri.status::text,
           ri.notes, ri.invoice_number,
           vr.status::text AS vac_status, vr.vacating_date::text
    FROM rent_invoices ri
    JOIN bookings bk ON bk.id = ri.booking_id
    JOIN customers c ON c.id = bk.customer_id
    LEFT JOIN vacating_requests vr ON vr.booking_id = bk.id AND vr.status IN ('pending','approved')
    WHERE ri.billing_month = '2026-09-01'
      AND ri.is_adhoc = false
      AND ri.status IN ('pending','overdue')
      AND coalesce(ri.paid_principal_paise,0) = 0
      AND bk.is_test = false AND c.is_test = false
      AND bk.status = 'confirmed'
    ORDER BY c.full_name
    LIMIT 30
  `)) as any[];

  const withVacating = unpaidSep.filter((r) => r.vac_status);
  const withoutVacating = unpaidSep.filter((r) => !r.vac_status);

  const analyses: unknown[] = [];

  const [saswat] = (await db.execute(sql`
    SELECT id::text FROM bookings WHERE booking_code = 'APG-2026-0094' LIMIT 1
  `)) as any[];
  if (saswat) analyses.push(await analyze(saswat.id, '2026-09-09', 'A_saswat_paid_approved'));

  for (const row of withVacating.slice(0, 10)) {
    analyses.push(
      await analyze(
        row.booking_id,
        String(row.vacating_date).slice(0, 10),
        `B_unpaid_with_vacating_${row.booking_code}`,
      ),
    );
  }

  // Simulate day-10 move-out for unpaid residents who have NOT submitted vacating yet
  for (const row of withoutVacating.slice(0, 8)) {
    analyses.push(
      await analyze(row.booking_id, '2026-09-10', `C_unpaid_preview_day10_${row.booking_code}`),
    );
  }

  // Find booking with rent ~7211 if any
  const match7211 = unpaidSep.filter((r) => Number(r.rent_paise) === 721100);
  for (const row of match7211.slice(0, 5)) {
    const vac = row.vacating_date ? String(row.vacating_date).slice(0, 10) : '2026-09-10';
    analyses.push(await analyze(row.booking_id, vac, `D_rent7211_${row.booking_code}`));
  }

  const out = {
    mutations: 0,
    unpaidSeptemberCount: unpaidSep.length,
    unpaidWithActiveVacating: withVacating.length,
    unpaidWithoutVacating: withoutVacating.length,
    unpaidSample: unpaidSep.slice(0, 20).map((r) => ({
      code: r.booking_code,
      name: r.full_name,
      rentInr: paiseToInr(Number(r.rent_paise)),
      vac: r.vac_status,
      vacDate: r.vacating_date,
      notes: r.notes,
    })),
    analyses,
  };
  writeFileSync('/tmp/moveout-rent-audit2.json', JSON.stringify(out, null, 2));
  console.log(JSON.stringify({ ...out, analyses: undefined, analysisCount: analyses.length }, null, 2));
  for (const a of analyses as any[]) {
    console.log(
      `${a.label} ${a.bookingCode} inv=${a.invoice?.rentInr} paid=${a.invoice?.paidInr} ` +
        `action=${a.charge?.action} chargeable=${a.charge?.chargeableInr} ` +
        `previewThrough=${a.preview?.throughInr} previewSettle=${a.preview?.settleInr} ` +
        `needsAdjust=${a.gap?.needsAdjust} previewFullUnpaid=${a.gap?.previewShowsFullUnpaidLiability} ` +
        `proratedNote=${a.invoice?.alreadyProrated} policy=${a.policy}`,
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
