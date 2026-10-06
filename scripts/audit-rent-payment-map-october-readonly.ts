/* eslint-disable no-console */
/**
 * Read-only October 2026 rent payment map reconciliation (production).
 * USE_PRODUCTION_DB=1 npx tsx scripts/audit-rent-payment-map-october-readonly.ts
 */
import { loadProductionAuditEnv, requireDatabaseUrl } from '../src/lib/db/loadEnv';

loadProductionAuditEnv();
requireDatabaseUrl('audit-rent-payment-map-october');

import { and, eq, inArray, sql } from 'drizzle-orm';
import { closeDb, db } from '../src/db/client';
import { paymentProofRejections, rentInvoices } from '../src/db/schema';
import { buildRentInvoiceProjectInput } from '../src/lib/billing/rentInvoiceProjectInput';
import {
  pickRentInvoiceForPaymentMap,
  RENT_PAYMENT_MAP_RENT_INVOICE_DB_STATUSES,
} from '../src/lib/billing/rentPaymentMapInvoiceSelection';
import {
  aggregateRentPaymentMapSummary,
  classifyRentPaymentMapBed,
} from '../src/lib/billing/rentPaymentMapStatus';
import { resolveRentLiabilityCoveragePeriod } from '../src/lib/billing/rentOverlapLiability';
import { formatDate } from '../src/lib/dates';
import { firstOfMonth, monthBounds } from '../src/services/billing';
import { projectInvoice } from '../src/services/rentInvoices';

const BILLING_MONTH = '2026-10-01';
const SHANTINAGAR_LIKE = '%Shantinagar%';
const ALL_PGS = process.env.RPM_AUDIT_ALL_PGS === '1';

function rentInvoiceRelevantToBillingMonth(
  row: (typeof rentInvoices.$inferSelect),
  billingMonth: string,
): boolean {
  const month = firstOfMonth(billingMonth);
  if (!row.isAdhoc) {
    return firstOfMonth(String(row.billingMonth)) === month;
  }
  const period = resolveRentLiabilityCoveragePeriod(
    {
      id: row.id,
      isAdhoc: true,
      invoiceSubtype: row.invoiceSubtype,
      status: row.status,
      paidPrincipalPaise: row.paidPrincipalPaise,
      paidLateFeePaise: row.paidLateFeePaise,
      paymentProofUrl: row.paymentProofUrl,
      proofSubmittedAt: row.proofSubmittedAt,
      proofSnapshotOutstandingPaise: row.proofSnapshotOutstandingPaise,
      billingMonth: row.billingMonth,
      dueDate: row.dueDate,
      notes: row.notes,
    },
    { billingDay: 5, billingCyclePolicy: 'calendar_month_1st' },
  );
  if (!period) return firstOfMonth(String(row.billingMonth)) === month;
  const { start, end } = monthBounds(month);
  return period.periodStart <= formatDate(end) && period.periodEnd >= formatDate(start);
}

async function main() {
  const pgRows = ALL_PGS
    ? await db.execute<{ id: string; name: string }>(sql`
        SELECT id::text, name FROM pgs WHERE archived_at IS NULL ORDER BY name
      `)
    : await db.execute<{ id: string; name: string }>(sql`
        SELECT id::text, name FROM pgs WHERE name ILIKE ${SHANTINAGAR_LIKE} AND archived_at IS NULL LIMIT 1
      `);
  if (pgRows.length === 0) throw new Error('No PGs found for audit');

  const pgIds = pgRows.map((p) => p.id);
  const pgLabel = ALL_PGS ? 'All PGs' : pgRows[0]!.name;

  const month = firstOfMonth(BILLING_MONTH);
  const { start, end } = monthBounds(month);
  const monthStartIso = formatDate(start);
  const monthEndIso = formatDate(end);

  const beds = await db.execute<{
    bed_code: string;
    room_number: string;
    customer_name: string | null;
    booking_id: string | null;
  }>(sql`
    SELECT b.bed_code, r.room_number, occ.customer_name, occ.booking_id::text
    FROM beds b
    INNER JOIN rooms r ON r.id = b.room_id AND r.archived_at IS NULL
    INNER JOIN floors f ON f.id = r.floor_id AND f.archived_at IS NULL
    INNER JOIN pgs p ON p.id = f.pg_id
    LEFT JOIN LATERAL (
      SELECT c.full_name AS customer_name, bk.id AS booking_id
      FROM bed_reservations br
      INNER JOIN bookings bk ON bk.id = br.booking_id
      INNER JOIN customers c ON c.id = bk.customer_id
      WHERE br.bed_id = b.id
        AND br.status = 'active' AND br.kind = 'primary'
        AND bk.status = 'confirmed' AND bk.is_test = false AND c.is_test = false
        AND bk.duration_mode IN ('monthly', 'open_ended')
        AND br.stay_range && daterange(${monthStartIso}::date, ${monthEndIso}::date, '[)')
      ORDER BY lower(br.stay_range) DESC LIMIT 1
    ) occ ON true
    WHERE p.id = ANY(${sql.raw(`'{${pgIds.join(',')}}'::uuid[]`)}) AND b.archived_at IS NULL
    ORDER BY r.room_number, b.bed_code
  `);

  const bookingIds = [...new Set(beds.map((b) => b.booking_id).filter(Boolean))] as string[];

  const invoiceRows = await db
    .select()
    .from(rentInvoices)
    .where(
      and(
        inArray(rentInvoices.bookingId, bookingIds),
        inArray(rentInvoices.status, [...RENT_PAYMENT_MAP_RENT_INVOICE_DB_STATUSES]),
      ),
    );

  const grouped = new Map<string, ReturnType<typeof buildRentInvoiceProjectInput>[]>();
  for (const row of invoiceRows) {
    if (!rentInvoiceRelevantToBillingMonth(row, BILLING_MONTH)) continue;
    const input = buildRentInvoiceProjectInput(row);
    const list = grouped.get(row.bookingId) ?? [];
    list.push(input);
    grouped.set(row.bookingId, list);
  }

  const legacyGrouped = new Map<string, ReturnType<typeof buildRentInvoiceProjectInput>[]>();
  for (const row of invoiceRows) {
    if (!['pending', 'overdue', 'payment_in_progress'].includes(row.status)) continue;
    if (!rentInvoiceRelevantToBillingMonth(row, BILLING_MONTH)) continue;
    const input = buildRentInvoiceProjectInput(row);
    const list = legacyGrouped.get(row.bookingId) ?? [];
    list.push(input);
    legacyGrouped.set(row.bookingId, list);
  }

  const invoiceIds = [...grouped.values()].flatMap((list) => list.map((i) => i.id));
  const rejections = invoiceIds.length
    ? await db
        .select({ entityId: paymentProofRejections.entityId })
        .from(paymentProofRejections)
        .where(
          and(
            eq(paymentProofRejections.entityType, 'rent_invoice'),
            eq(paymentProofRejections.status, 'active'),
            inArray(paymentProofRejections.entityId, invoiceIds),
          ),
        )
    : [];
  const rejected = new Set(rejections.map((r) => r.entityId));

  const bedStatuses: Array<{ room: string; bed: string; name: string; status: string; legacy: string }> = [];
  let billedPaise = 0;
  let paidPaise = 0;
  let outstandingPaise = 0;

  for (const bed of beds) {
    if (!bed.booking_id) continue;
    const candidates = grouped.get(bed.booking_id) ?? [];
    const picked = pickRentInvoiceForPaymentMap(candidates);
    const projected = picked ? projectInvoice(picked) : null;
    const status = classifyRentPaymentMapBed({
      isOccupiedInMonth: true,
      projected,
      hasActiveRejectionWithoutProof: picked ? rejected.has(picked.id) : false,
      paymentProofUrl: picked?.paymentProofUrl ?? null,
    });

    const legacyCandidates = legacyGrouped.get(bed.booking_id) ?? [];
    const legacyPicked = legacyCandidates[0];
    const legacyProjected = legacyPicked ? projectInvoice(legacyPicked) : null;
    const legacyStatus = classifyRentPaymentMapBed({
      isOccupiedInMonth: true,
      projected: legacyProjected,
    });

    if (picked) {
      billedPaise += picked.rentPaise - (picked.discountPaise ?? 0);
      paidPaise += picked.paidPrincipalPaise + picked.paidLateFeePaise;
      if (projected) outstandingPaise += projected.outstandingPaise;
    }

    bedStatuses.push({
      room: bed.room_number,
      bed: bed.bed_code,
      name: bed.customer_name ?? '?',
      status,
      legacy: legacyStatus,
    });
  }

  const summary = aggregateRentPaymentMapSummary(
    bedStatuses.map((b) => ({ status: b.status as 'paid' | 'not_paid' | 'payment_submitted' | 'partially_paid' })),
  );
  const legacySummary = aggregateRentPaymentMapSummary(
    bedStatuses.map((b) => ({ status: b.legacy as 'paid' | 'not_paid' | 'payment_submitted' | 'partially_paid' })),
  );

  console.log(`\n=== October 2026 Rent Payment Map (${pgLabel}) ===\n`);
  console.log('Fixed map summary:', summary);
  console.log('Legacy map summary (pre-fix query):', legacySummary);
  console.log('\nFinancial rollup (picked invoice per occupied bed):');
  console.log({
    billedPaise,
    paidPaise,
    outstandingPaise,
    billedInr: (billedPaise / 100).toFixed(2),
    paidInr: (paidPaise / 100).toFixed(2),
  });

  console.log('\nSample rows (legacy → fixed):');
  for (const row of bedStatuses.filter((b) => b.legacy !== b.status).slice(0, 12)) {
    console.log(`  Room ${row.room} ${row.bed} ${row.name}: ${row.legacy} → ${row.status}`);
  }

  console.log('\nAll occupied beds:');
  for (const row of bedStatuses) {
    console.log(
      `  ${row.room}/${row.bed} ${row.name}: invoice-status=${row.status} (legacy=${row.legacy})`,
    );
  }

  await closeDb();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
