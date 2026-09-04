/**
 * Generic move-out rent reconciliation for active vacating requests.
 *
 * Default: READ-ONLY dry-run (mutations: 0).
 * Apply: USE_PRODUCTION_DB=1 npx tsx scripts/reconcile-moveout-rent-liability.ts --apply
 *
 * No resident-specific branches — calls syncVacatingCheckoutRentBilling for each
 * active vacating whose checkout-month unpaid invoice differs from BCM chargeable.
 */
import { loadProductionAuditEnv, requireDatabaseUrl } from '@/src/lib/db/loadEnv';

loadProductionAuditEnv();
requireDatabaseUrl('reconcile-moveout-rent-liability');

import { writeFileSync } from 'node:fs';
import { sql } from 'drizzle-orm';
import { closeDb, db } from '@/src/db/client';
import { resolveVacatingAwareRentCharge } from '@/src/lib/billing/billingCoverageModel';
import { formatDate, parseDate } from '@/src/lib/dates';
import { paiseToInr } from '@/src/lib/format';
import { calendarMonthBillingPeriod, firstOfMonth, fullMonthlyRentPaise } from '@/src/services/billing';
import { loadBillingCoverageModel } from '@/src/services/billingCoverage';
import { syncVacatingCheckoutRentBilling } from '@/src/services/vacatingCheckoutBilling';

const APPLY = process.argv.includes('--apply');

async function main() {
  const rows = (await db.execute(sql`
    SELECT vr.id::text AS vacating_id, bk.id::text AS booking_id, bk.booking_code, c.full_name,
           vr.status::text AS vac_status, vr.vacating_date::text,
           vr.monthly_rent_paise_snapshot,
           ri.id::text AS invoice_id, ri.rent_paise, ri.paid_principal_paise, ri.status::text AS inv_status,
           ri.notes, ri.invoice_number
    FROM vacating_requests vr
    JOIN bookings bk ON bk.id = vr.booking_id
    JOIN customers c ON c.id = bk.customer_id
    LEFT JOIN rent_invoices ri ON ri.booking_id = bk.id
      AND ri.billing_month = date_trunc('month', vr.vacating_date)::date
      AND ri.is_adhoc = false
      AND ri.status <> 'cancelled'
    WHERE vr.status IN ('pending', 'approved')
      AND bk.is_test = false AND c.is_test = false
    ORDER BY vr.vacating_date, c.full_name
  `)) as any[];

  const plan: unknown[] = [];
  let mutations = 0;

  for (const row of rows) {
    const vacatingDate = String(row.vacating_date).slice(0, 10);
    const monthly = Number(row.monthly_rent_paise_snapshot ?? row.rent_paise ?? 0);
    const coverage = await loadBillingCoverageModel({
      bookingId: row.booking_id,
      vacatingDate,
      monthlyRentPaise: monthly,
      treatAsApprovedForTail: true,
    });
    if (!coverage) continue;

    const billingPeriod = calendarMonthBillingPeriod(firstOfMonth(vacatingDate));
    const charge = resolveVacatingAwareRentCharge({
      billingMonth: firstOfMonth(vacatingDate),
      billingDay: coverage.billingDay,
      billingCyclePolicy: coverage.billingCyclePolicy,
      moveInDate: coverage.moveInDate,
      monthlyRentPaise: monthly || coverage.monthlyRentPaise,
      paidInvoiceCoverage: coverage.paidInvoiceCoverage,
      activeVacating: {
        status: row.vac_status as 'pending' | 'approved',
        vacatingDate: formatDate(parseDate(vacatingDate)),
      },
      fullMonthRentPaise: fullMonthlyRentPaise(monthly || coverage.monthlyRentPaise),
      billingPeriod,
      existingInvoice: row.invoice_id
        ? {
            id: row.invoice_id,
            rentPaise: Number(row.rent_paise),
            paidPrincipalPaise: Number(row.paid_principal_paise ?? 0),
            status: String(row.inv_status),
          }
        : null,
    });

    const needsWrite =
      charge.billingAction === 'adjust_existing' ||
      charge.billingAction === 'generate_prorated' ||
      (charge.billingAction === 'generate_full' &&
        row.invoice_id &&
        Number(row.rent_paise) !== charge.chargeablePaise &&
        Number(row.paid_principal_paise ?? 0) <= charge.chargeablePaise);

    const entry = {
      bookingCode: row.booking_code,
      name: row.full_name,
      vacStatus: row.vac_status,
      vacatingDate,
      invoice: row.invoice_id
        ? {
            number: row.invoice_number,
            rentInr: paiseToInr(Number(row.rent_paise)),
            paidInr: paiseToInr(Number(row.paid_principal_paise ?? 0)),
            status: row.inv_status,
          }
        : null,
      charge: {
        action: charge.billingAction,
        chargeableInr: paiseToInr(charge.chargeablePaise),
        days: charge.chargeableDays,
      },
      needsWrite,
      applied: false as boolean,
      result: null as unknown,
    };

    if (needsWrite && APPLY) {
      const result = await syncVacatingCheckoutRentBilling({
        bookingId: row.booking_id,
        vacatingDate,
        actorType: 'system',
      });
      entry.applied = true;
      entry.result = result;
      mutations += 1;
    }

    plan.push(entry);
  }

  const out = {
    apply: APPLY,
    mutations,
    scanned: rows.length,
    needingWrite: plan.filter((p: any) => p.needsWrite).length,
    plan,
  };
  writeFileSync('/tmp/reconcile-moveout-rent.json', JSON.stringify(out, null, 2));
  console.log(
    JSON.stringify(
      {
        apply: APPLY,
        mutations,
        scanned: rows.length,
        needingWrite: out.needingWrite,
        needing: plan
          .filter((p: any) => p.needsWrite)
          .map((p: any) => `${p.bookingCode} ${p.vacatingDate} ${p.charge.action} → ${p.charge.chargeableInr}`),
      },
      null,
      2,
    ),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
