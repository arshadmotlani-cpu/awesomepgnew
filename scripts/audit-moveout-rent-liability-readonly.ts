/**
 * READ-ONLY: move-out rent liability vs September invoice audit.
 * Production mutations: 0
 */
import { loadProductionAuditEnv, requireDatabaseUrl } from '@/src/lib/db/loadEnv';

loadProductionAuditEnv();
requireDatabaseUrl('audit-moveout-rent-readonly');

import { writeFileSync } from 'node:fs';
import { sql } from 'drizzle-orm';
import { closeDb, db } from '@/src/db/client';
import { buildResidentMoveOutRequestPreview } from '@/src/lib/vacating/residentMoveOutRequestPreview';
import { computeVacatingFinalPeriodRentDecision } from '@/src/lib/billing/vacatingFinalPeriodRent';
import { resolveVacatingAwareRentCharge } from '@/src/lib/billing/billingCoverageModel';
import { paiseToInr } from '@/src/lib/format';
// projectInvoice unused in audit
void 0;

async function main() {
  const rows = await db.execute(sql`
    SELECT
      vr.id::text AS vacating_id,
      vr.status::text AS vacating_status,
      vr.vacating_date::text,
      vr.notice_given_date::text,
      vr.created_at::text AS vacating_created_at,
      bk.id::text AS booking_id,
      bk.booking_code,
      c.full_name,
      p.name AS pg_name,
      r.room_number,
      b.bed_code,
      ri.id::text AS rent_invoice_id,
      ri.invoice_number,
      ri.billing_month::text,
      ri.rent_paise,
      ri.paid_principal_paise AS paid_paise,
      ri.status::text AS rent_status,
      ri.notes
    FROM vacating_requests vr
    JOIN bookings bk ON bk.id = vr.booking_id
    JOIN customers c ON c.id = bk.customer_id
    LEFT JOIN LATERAL (
      SELECT br2.bed_id
      FROM bed_reservations br2
      WHERE br2.booking_id = bk.id AND br2.kind = 'primary'
        AND br2.status IN ('active', 'completed')
      ORDER BY CASE br2.status WHEN 'active' THEN 0 ELSE 1 END, br2.updated_at DESC
      LIMIT 1
    ) br ON true
    LEFT JOIN beds b ON b.id = br.bed_id
    LEFT JOIN rooms r ON r.id = b.room_id
    LEFT JOIN floors f ON f.id = r.floor_id
    LEFT JOIN pgs p ON p.id = f.pg_id
    LEFT JOIN LATERAL (
      SELECT ri2.id, ri2.invoice_number, ri2.billing_month, ri2.rent_paise,
             ri2.paid_principal_paise, ri2.status, ri2.notes
      FROM rent_invoices ri2
      WHERE ri2.booking_id = bk.id
        AND ri2.billing_month = date_trunc('month', vr.vacating_date::date)::date
        AND ri2.status <> 'cancelled'
        AND ri2.is_adhoc = false
      ORDER BY ri2.created_at DESC
      LIMIT 1
    ) ri ON true
    WHERE vr.status IN ('pending', 'approved')
      AND bk.is_test = false
      AND c.is_test = false
      AND vr.vacating_date >= '2026-09-01'
      AND vr.vacating_date < '2026-10-01'
    ORDER BY vr.status, p.name NULLS LAST, c.full_name
  `);

  const cases: unknown[] = [];
  for (const row of rows as any[]) {
    const vacatingDate = String(row.vacating_date).slice(0, 10);
    const billingMonth = '2026-09-01';
    const monthly = Number(row.rent_paise ?? 0);
    const paid = Number(row.paid_paise ?? 0);

    let preview: Awaited<ReturnType<typeof buildResidentMoveOutRequestPreview>> | null = null;
    let previewError: string | null = null;
    try {
      preview = await buildResidentMoveOutRequestPreview({
        bookingId: row.booking_id,
        vacatingDate,
        noticeGivenDate: row.notice_given_date
          ? String(row.notice_given_date).slice(0, 10)
          : undefined,
      });
    } catch (e) {
      previewError = e instanceof Error ? e.message : String(e);
    }

    let charge: unknown = null;
    let chargeError: string | null = null;
    let syncDry: unknown = null;
    try {
      const { resolveMonthlyRentPaiseForBooking } = await import(
        '@/src/services/rentResolution'
      );
      const monthlySsot = await resolveMonthlyRentPaiseForBooking(row.booking_id);
      const coverage = await (
        await import('@/src/services/billingCoverage')
      ).loadBillingCoverageModel({
        bookingId: row.booking_id,
        vacatingDate,
        monthlyRentPaise: monthly > 0 ? monthly : monthlySsot,
        treatAsApprovedForTail: true,
      });
      if (!coverage) throw new Error('no coverage');
      const decision = computeVacatingFinalPeriodRentDecision({
        vacatingApproved: true,
        vacatingDate,
        billingDay: coverage.billingDay,
        moveInDate: coverage.moveInDate,
        monthlyRentPaise: monthly > 0 ? monthly : monthlySsot,
        paidPeriods: coverage.paidInvoiceCoverage,
        billingCyclePolicy: coverage.billingCyclePolicy,
      });
      const rentCharge = resolveVacatingAwareRentCharge({
        billingMonth: '2026-09-01',
        billingDay: coverage.billingDay,
        billingCyclePolicy: coverage.billingCyclePolicy,
        moveInDate: coverage.moveInDate,
        monthlyRentPaise: monthly > 0 ? monthly : monthlySsot,
        paidInvoiceCoverage: coverage.paidInvoiceCoverage,
        activeVacating: {
          status: row.vacating_status as 'pending' | 'approved',
          vacatingDate,
        },
        fullMonthRentPaise: monthly > 0 ? monthly : monthlySsot,
        billingPeriod: {
          periodStart: '2026-09-01',
          periodEnd: '2026-09-30',
        },
        existingInvoice: row.rent_invoice_id
          ? {
              id: row.rent_invoice_id,
              rentPaise: monthly,
              paidPrincipalPaise: paid,
              status: row.rent_status,
            }
          : null,
      });
      charge = {
        monthlySsot,
        billingCyclePolicy: coverage.billingCyclePolicy,
        decision: {
          shouldSuppress: decision.shouldSuppressFinalInvoice,
          tailDays: decision.tailDays,
          tailRentPaise: decision.tailRentPaise,
          invoiceBillingMonth: decision.invoiceBillingMonth,
          tailStart: decision.tailPeriodStart,
          tailEnd: decision.tailPeriodEnd,
        },
        rentChargeAction: rentCharge.billingAction,
        expectedLiabilityPaise: rentCharge.chargeablePaise,
        expectedLiabilityInr: paiseToInr(rentCharge.chargeablePaise),
        unusedIfFullyPaidPaise:
          paid >= (monthly > 0 ? monthly : monthlySsot) && rentCharge.billingAction === 'skip_already_paid'
            ? Math.max(0, (monthly > 0 ? monthly : monthlySsot) - (decision.tailRentPaise || 0))
            : paid >= (monthly > 0 ? monthly : monthlySsot)
              ? Math.max(0, (monthly > 0 ? monthly : monthlySsot) - decision.tailRentPaise)
              : 0,
      };
    } catch (e) {
      chargeError = e instanceof Error ? e.message : String(e);
    }

    const bucket =
      paid <= 0
        ? 'A_unpaid'
        : paid >= monthly && monthly > 0
          ? 'B_fully_paid'
          : 'C_partial';

    cases.push({
      bucket,
      name: row.full_name,
      bookingCode: row.booking_code,
      bookingId: row.booking_id,
      pg: row.pg_name,
      room: row.room_number,
      bed: row.bed_code,
      vacatingStatus: row.vacating_status,
      vacatingDate,
      noticeGivenDate: row.notice_given_date,
      vacatingCreatedAt: row.vacating_created_at,
      invoice: {
        id: row.rent_invoice_id,
        number: row.invoice_number,
        billingMonth: row.billing_month,
        rentPaise: monthly,
        rentInr: paiseToInr(monthly),
        paidPaise: paid,
        paidInr: paiseToInr(paid),
        status: row.rent_status,
        notes: row.notes,
      },
      canonical: charge,
      preview: preview
        ? {
            rentThroughVacatingPaise: preview.rentThroughVacatingPaise,
            rentThroughInr: paiseToInr(preview.rentThroughVacatingPaise),
            finalRentSettlementPaise: preview.finalRentSettlementPaise,
            finalSettlementInr: paiseToInr(preview.finalRentSettlementPaise ?? 0),
            estimatedUnusedRentCreditPaise: preview.estimatedUnusedRentCreditPaise,
            noticeDeductionPaise: preview.noticeDeductionPaise,
          }
        : null,
      previewError,
      chargeError,
      mismatch:
        charge &&
        typeof charge === 'object' &&
        'expectedLiabilityPaise' in charge &&
        monthly > 0 &&
        paid <= 0
          ? monthly !== (charge as { expectedLiabilityPaise: number }).expectedLiabilityPaise
          : null,
    });
  }

  const summary = {
    mutations: 0,
    total: cases.length,
    byBucket: {
      A_unpaid: cases.filter((c: any) => c.bucket === 'A_unpaid').length,
      B_fully_paid: cases.filter((c: any) => c.bucket === 'B_fully_paid').length,
      C_partial: cases.filter((c: any) => c.bucket === 'C_partial').length,
    },
    unpaidWithFullMonthInvoice: (cases as any[]).filter(
      (c) =>
        c.bucket === 'A_unpaid' &&
        c.invoice?.rentPaise > 0 &&
        c.canonical?.expectedLiabilityPaise != null &&
        c.invoice.rentPaise > c.canonical.expectedLiabilityPaise,
    ).length,
  };

  const out = { summary, cases };
  writeFileSync('/tmp/moveout-rent-audit.json', JSON.stringify(out, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  console.log('--- unpaid mismatches (sample) ---');
  for (const c of (cases as any[]).filter((x) => x.bucket === 'A_unpaid' && x.mismatch).slice(0, 15)) {
    console.log(
      `${c.bookingCode} ${c.name} vacate ${c.vacatingDate} status=${c.vacatingStatus} ` +
        `invoice=${c.invoice?.rentInr} paid=${c.invoice?.paidInr} ` +
        `canonical=${c.canonical?.expectedLiabilityInr} ` +
        `previewThrough=${c.preview?.rentThroughInr} previewSettle=${c.preview?.finalSettlementInr} ` +
        `notes=${JSON.stringify(c.invoice?.notes)?.slice(0, 80)}`,
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
