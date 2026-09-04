/**
 * Lean READ-ONLY move-out rent liability audit (SQL + charge SSOT only).
 * Mutations: 0
 */
import { loadProductionAuditEnv, requireDatabaseUrl } from '@/src/lib/db/loadEnv';

loadProductionAuditEnv();
requireDatabaseUrl('audit-moveout-rent-liability-lean');

import { writeFileSync } from 'node:fs';
import { sql } from 'drizzle-orm';
import { closeDb, db } from '@/src/db/client';
import { resolveVacatingAwareRentCharge } from '@/src/lib/billing/billingCoverageModel';
import { formatDate, parseDate } from '@/src/lib/dates';
import { paiseToInr } from '@/src/lib/format';
import { calendarMonthBillingPeriod, firstOfMonth } from '@/src/services/billing';
import { loadBillingCoverageModel } from '@/src/services/billingCoverage';

type Row = {
  booking_id: string;
  booking_code: string;
  full_name: string;
  rent_paise: number;
  paid_principal_paise: number;
  status: string;
  notes: string | null;
  invoice_number: string;
  vac_status: string | null;
  vacating_date: string | null;
  notice_given_date: string | null;
  policy: string | null;
  billing_day: number | null;
};

async function chargeFor(bookingId: string, vacatingDate: string, monthlyRentPaise: number, inv: {
  id: string;
  rentPaise: number;
  paidPrincipalPaise: number;
  status: string;
} | null, vacStatus: 'pending' | 'approved' | null) {
  const coverage = await loadBillingCoverageModel({
    bookingId,
    vacatingDate,
    monthlyRentPaise,
    treatAsApprovedForTail: true,
  });
  if (!coverage) return null;
  const billingPeriod = calendarMonthBillingPeriod(firstOfMonth(vacatingDate));
  return resolveVacatingAwareRentCharge({
    billingMonth: firstOfMonth(vacatingDate),
    billingDay: coverage.billingDay,
    billingCyclePolicy: coverage.billingCyclePolicy,
    moveInDate: coverage.moveInDate,
    monthlyRentPaise: monthlyRentPaise || coverage.monthlyRentPaise,
    paidInvoiceCoverage: coverage.paidInvoiceCoverage,
    activeVacating: {
      status: vacStatus ?? 'pending',
      vacatingDate: formatDate(parseDate(vacatingDate)),
    },
    fullMonthRentPaise: monthlyRentPaise || coverage.monthlyRentPaise,
    billingPeriod,
    existingInvoice: inv,
  });
}

async function main() {
  const unpaidSep = (await db.execute(sql`
    SELECT bk.id::text AS booking_id, bk.booking_code, c.full_name,
           ri.id::text AS invoice_id, ri.rent_paise, ri.paid_principal_paise, ri.status::text,
           ri.notes, ri.invoice_number,
           vr.status::text AS vac_status, vr.vacating_date::text, vr.notice_given_date::text,
           rbp.billing_cycle_policy::text AS policy, rbp.billing_day
    FROM rent_invoices ri
    JOIN bookings bk ON bk.id = ri.booking_id
    JOIN customers c ON c.id = bk.customer_id
    LEFT JOIN vacating_requests vr ON vr.booking_id = bk.id AND vr.status IN ('pending','approved')
    LEFT JOIN resident_billing_profiles rbp ON rbp.booking_id = bk.id
    WHERE ri.billing_month = '2026-09-01'
      AND ri.is_adhoc = false
      AND ri.status IN ('pending','overdue')
      AND coalesce(ri.paid_principal_paise,0) = 0
      AND bk.is_test = false AND c.is_test = false
      AND bk.status = 'confirmed'
    ORDER BY c.full_name
  `)) as Row[];

  const paidSepWithVac = (await db.execute(sql`
    SELECT bk.id::text AS booking_id, bk.booking_code, c.full_name,
           ri.id::text AS invoice_id, ri.rent_paise, ri.paid_principal_paise, ri.status::text,
           ri.notes, ri.invoice_number,
           vr.status::text AS vac_status, vr.vacating_date::text, vr.notice_given_date::text,
           rbp.billing_cycle_policy::text AS policy, rbp.billing_day
    FROM rent_invoices ri
    JOIN bookings bk ON bk.id = ri.booking_id
    JOIN customers c ON c.id = bk.customer_id
    JOIN vacating_requests vr ON vr.booking_id = bk.id AND vr.status IN ('pending','approved')
    LEFT JOIN resident_billing_profiles rbp ON rbp.booking_id = bk.id
    WHERE ri.billing_month = '2026-09-01'
      AND ri.is_adhoc = false
      AND ri.status = 'paid'
      AND bk.is_test = false AND c.is_test = false
      AND bk.status = 'confirmed'
    ORDER BY c.full_name
    LIMIT 20
  `)) as (Row & { invoice_id: string })[];

  const partialSep = (await db.execute(sql`
    SELECT bk.id::text AS booking_id, bk.booking_code, c.full_name,
           ri.id::text AS invoice_id, ri.rent_paise, ri.paid_principal_paise, ri.status::text,
           ri.notes, ri.invoice_number,
           vr.status::text AS vac_status, vr.vacating_date::text, vr.notice_given_date::text,
           rbp.billing_cycle_policy::text AS policy, rbp.billing_day
    FROM rent_invoices ri
    JOIN bookings bk ON bk.id = ri.booking_id
    JOIN customers c ON c.id = bk.customer_id
    LEFT JOIN vacating_requests vr ON vr.booking_id = bk.id AND vr.status IN ('pending','approved')
    LEFT JOIN resident_billing_profiles rbp ON rbp.booking_id = bk.id
    WHERE ri.billing_month = '2026-09-01'
      AND ri.is_adhoc = false
      AND ri.status IN ('pending','overdue')
      AND coalesce(ri.paid_principal_paise,0) > 0
      AND coalesce(ri.paid_principal_paise,0) < ri.rent_paise
      AND bk.is_test = false AND c.is_test = false
      AND bk.status = 'confirmed'
    ORDER BY c.full_name
    LIMIT 20
  `)) as (Row & { invoice_id: string })[];

  const allVacating = (await db.execute(sql`
    SELECT bk.id::text AS booking_id, bk.booking_code, c.full_name,
           ri.id::text AS invoice_id, ri.rent_paise, ri.paid_principal_paise, ri.status::text,
           ri.notes, ri.invoice_number,
           vr.status::text AS vac_status, vr.vacating_date::text, vr.notice_given_date::text,
           vr.monthly_rent_paise_snapshot,
           rbp.billing_cycle_policy::text AS policy, rbp.billing_day
    FROM vacating_requests vr
    JOIN bookings bk ON bk.id = vr.booking_id
    JOIN customers c ON c.id = bk.customer_id
    LEFT JOIN rent_invoices ri ON ri.booking_id = bk.id
      AND ri.billing_month = date_trunc('month', vr.vacating_date)::date
      AND ri.is_adhoc = false AND ri.status <> 'cancelled'
    LEFT JOIN resident_billing_profiles rbp ON rbp.booking_id = bk.id
    WHERE vr.status IN ('pending','approved')
      AND vr.vacating_date >= '2026-09-01'
      AND vr.vacating_date < '2026-10-01'
      AND bk.is_test = false AND c.is_test = false
    ORDER BY vr.vacating_date, c.full_name
  `)) as any[];

  const analyses: unknown[] = [];

  async function analyzeRow(
    label: string,
    row: any,
    vacDateOverride?: string,
  ) {
    const vacDate =
      vacDateOverride ??
      (row.vacating_date ? String(row.vacating_date).slice(0, 10) : '2026-09-10');
    const rentPaise = Number(row.rent_paise ?? row.monthly_rent_paise_snapshot ?? 0);
    const paid = Number(row.paid_principal_paise ?? 0);
    const inv = row.invoice_id
      ? {
          id: String(row.invoice_id),
          rentPaise,
          paidPrincipalPaise: paid,
          status: String(row.status),
        }
      : null;
    const charge = await chargeFor(
      row.booking_id,
      vacDate,
      rentPaise,
      inv,
      (row.vac_status as 'pending' | 'approved') ?? null,
    );
    const alreadyProrated = String(row.notes ?? '').includes('move-out proration');
    const chargeable = charge?.chargeablePaise ?? null;
    const presentationBugUnpaid =
      paid <= 0 && rentPaise > 0
        ? {
            // Current presentation: through = monthly - outstanding = 0 when fully unpaid
            buggyThroughPaise: Math.max(0, rentPaise - rentPaise),
            buggySettlePaise: rentPaise,
            correctThroughPaise: chargeable,
            correctSettlePaise: chargeable,
          }
        : null;

    analyses.push({
      label,
      code: row.booking_code,
      name: row.full_name,
      policy: row.policy,
      vacStatus: row.vac_status,
      vacDate,
      noticeGiven: row.notice_given_date ? String(row.notice_given_date).slice(0, 10) : null,
      invoice: {
        number: row.invoice_number,
        rentInr: paiseToInr(rentPaise),
        paidInr: paiseToInr(paid),
        status: row.status,
        alreadyProrated,
        notes: row.notes,
      },
      charge: charge
        ? {
            action: charge.billingAction,
            chargeableInr: paiseToInr(charge.chargeablePaise),
            days: charge.chargeableDays,
            blocked: charge.adjustBlockedReason,
            invoiceBillingMonth: charge.invoiceBillingMonth,
          }
        : null,
      gap: {
        invoiceVsChargeableInr:
          chargeable != null ? paiseToInr(rentPaise - chargeable) : null,
        needsAdjust:
          charge?.billingAction === 'adjust_existing' && rentPaise !== chargeable,
        ledgerStillFullMonth:
          !alreadyProrated && chargeable != null && rentPaise > chargeable && paid <= chargeable,
        presentationBugUnpaid,
      },
    });
  }

  for (const row of allVacating) {
    await analyzeRow(`active_vacating_${row.vac_status}`, row);
  }

  const unpaidWithVac = unpaidSep.filter((r) => r.vac_status);
  const unpaidWithout = unpaidSep.filter((r) => !r.vac_status);
  for (const row of unpaidWithout.slice(0, 6)) {
    await analyzeRow('C_unpaid_synthetic_day10', row, '2026-09-10');
  }

  for (const row of paidSepWithVac.slice(0, 8)) {
    await analyzeRow('B_paid_with_vacating', row);
  }

  for (const row of partialSep.slice(0, 6)) {
    await analyzeRow('partial', row, row.vacating_date ? String(row.vacating_date).slice(0, 10) : '2026-09-10');
  }

  const match7211 = unpaidSep.filter((r) => Number(r.rent_paise) === 721100);
  for (const row of match7211) {
    await analyzeRow(
      'D_rent7211',
      row,
      row.vacating_date ? String(row.vacating_date).slice(0, 10) : '2026-09-10',
    );
  }

  const out = {
    mutations: 0,
    counts: {
      unpaidSeptember: unpaidSep.length,
      unpaidWithActiveVacating: unpaidWithVac.length,
      unpaidWithoutVacating: unpaidWithout.length,
      paidWithVacating: paidSepWithVac.length,
      partialSeptember: partialSep.length,
      activeSeptemberVacating: allVacating.length,
      rent7211Unpaid: match7211.length,
    },
    unpaidWithVacatingSample: unpaidWithVac.map((r) => ({
      code: r.booking_code,
      name: r.full_name,
      rentInr: paiseToInr(Number(r.rent_paise)),
      vac: r.vac_status,
      vacDate: r.vacating_date,
      alreadyProrated: String(r.notes ?? '').includes('move-out proration'),
    })),
    activeVacatingRaw: allVacating.map((r) => ({
      code: r.booking_code,
      name: r.full_name,
      vac: r.vac_status,
      vacDate: r.vacating_date,
      rentInr: r.rent_paise != null ? paiseToInr(Number(r.rent_paise)) : null,
      paidInr: r.paid_principal_paise != null ? paiseToInr(Number(r.paid_principal_paise)) : null,
      status: r.status,
      alreadyProrated: String(r.notes ?? '').includes('move-out proration'),
    })),
    analyses,
  };

  writeFileSync('/tmp/moveout-rent-audit-lean.json', JSON.stringify(out, null, 2));
  console.log(
    JSON.stringify(
      {
        mutations: 0,
        counts: out.counts,
        unpaidWithVacatingSample: out.unpaidWithVacatingSample,
        activeVacatingRaw: out.activeVacatingRaw,
        analysisCount: analyses.length,
      },
      null,
      2,
    ),
  );
  for (const a of analyses as any[]) {
    console.log(
      `${a.label} ${a.code} inv=${a.invoice.rentInr} paid=${a.invoice.paidInr} ` +
        `vac=${a.vacStatus}@${a.vacDate} action=${a.charge?.action} chargeable=${a.charge?.chargeableInr} ` +
        `needsAdjust=${a.gap.needsAdjust} ledgerFull=${a.gap.ledgerStillFullMonth} prorated=${a.invoice.alreadyProrated}`,
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
