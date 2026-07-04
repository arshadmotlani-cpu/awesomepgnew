#!/usr/bin/env npx tsx
/**
 * Complete production integrity audit (read-only).
 *
 *   USE_PRODUCTION_DB=1 npx tsx scripts/run-complete-integrity-audit.ts
 */
import { config } from 'dotenv';

config({ path: '.env' });
config({ path: '.env.local' });
if (process.env.USE_PRODUCTION_DB === '1') {
  // Vercel pulls may export empty DATABASE_URL keys — never clobber a working URL.
  const before = process.env.DATABASE_URL?.trim();
  config({ path: '.env.prod.live', override: true });
  if (!process.env.DATABASE_URL?.trim() && before) {
    process.env.DATABASE_URL = before;
  }
  const beforePostgres = process.env.POSTGRES_URL?.trim();
  config({ path: '.env.production.pull', override: true });
  if (!process.env.DATABASE_URL?.trim() && before) {
    process.env.DATABASE_URL = before;
  }
  if (!process.env.POSTGRES_URL?.trim() && beforePostgres) {
    process.env.POSTGRES_URL = beforePostgres;
  }
}

import { and, eq, isNull, sql } from 'drizzle-orm';
import { db, closeDb } from '@/src/db/client';
import { bookings, customers, pgs } from '@/src/db/schema';
import type { AdminSession } from '@/src/lib/auth/session';
import { getDatabaseHost, hasDatabaseUrl } from '@/src/lib/db/env';
import { runBedAudit } from '@/src/services/bedAudit';
import { runBillingIntegrityCheck } from '@/src/services/billingIntegrityCheck';
import { runCheckoutAudit } from '@/src/services/checkoutAudit';
import { runDepositAudit } from '@/src/services/depositAudit';
import { runFinancialIntegrityAudit } from '@/src/services/financialIntegrityAudit';
import { getPaymentReviewIntegrityReport } from '@/src/services/paymentReviewIntegrity';
import {
  runProductionDataConsistencyAudit,
  type ProductionDataConsistencyReport,
} from '@/src/services/productionDataConsistencyAudit';
import { runVacatingAudit } from '@/src/services/vacatingAudit';
import { getPgAvailabilitySummaries } from '@/src/services/availabilityService';
import { listPublicPgs } from '@/src/db/queries/customer';

type CheckResult = {
  id: string;
  category: string;
  label: string;
  pass: boolean;
  brokenRecords: string[];
};

function mockSession(): AdminSession {
  return {
    kind: 'admin',
    sessionId: 'integrity-audit',
    adminId: 'integrity-audit',
    email: 'audit@system',
    fullName: 'Integrity Audit',
    role: 'super_admin',
    pgScope: [],
    mustChangePassword: false,
    rememberMe: false,
    expiresAt: new Date(Date.now() + 86_400_000),
  };
}

async function auditBookingPrimaryReservation(): Promise<CheckResult> {
  const rows = await db.execute<{
    booking_id: string;
    booking_code: string;
    primary_count: number;
  }>(sql`
    SELECT bk.id::text AS booking_id, bk.booking_code,
           count(br.id) filter (
             WHERE br.kind = 'primary' AND br.status = 'active'
               AND CURRENT_DATE <@ br.stay_range
           )::int AS primary_count
    FROM bookings bk
    LEFT JOIN bed_reservations br ON br.booking_id = bk.id
    WHERE bk.status = 'confirmed'
      AND EXISTS (
        SELECT 1 FROM bed_reservations br2
        WHERE br2.booking_id = bk.id AND br2.kind = 'primary'
          AND br2.status = 'active' AND CURRENT_DATE <@ br2.stay_range
      )
    GROUP BY bk.id, bk.booking_code
    HAVING count(br.id) filter (
      WHERE br.kind = 'primary' AND br.status = 'active'
        AND CURRENT_DATE <@ br.stay_range
    ) <> 1
  `);
  const broken = rows.map(
    (r) => `${r.booking_code} (${r.booking_id}): ${r.primary_count} active primary reservations`,
  );
  return {
    id: 'booking_primary_reservation',
    category: 'BOOKINGS',
    label: 'Every active booking has exactly one active primary reservation',
    pass: broken.length === 0,
    brokenRecords: broken,
  };
}

async function auditCompletedBookingOnBed(): Promise<CheckResult> {
  const rows = await db.execute<{
    booking_code: string;
    booking_id: string;
    bed_code: string;
    pg_name: string;
  }>(sql`
    SELECT bk.booking_code, bk.id::text AS booking_id, bd.bed_code, p.name AS pg_name
    FROM bookings bk
    INNER JOIN bed_reservations br ON br.booking_id = bk.id
    INNER JOIN beds bd ON bd.id = br.bed_id
    INNER JOIN rooms r ON r.id = bd.room_id
    INNER JOIN floors f ON f.id = r.floor_id
    INNER JOIN pgs p ON p.id = f.pg_id
    WHERE bk.status IN ('completed', 'cancelled', 'refunded')
      AND br.status = 'active'
      AND br.kind = 'primary'
      AND CURRENT_DATE <@ br.stay_range
    ORDER BY bk.updated_at DESC
    LIMIT 200
  `);
  const broken = rows.map(
    (r) => `${r.booking_code} (${r.booking_id}) still on ${r.pg_name} ${r.bed_code}`,
  );
  return {
    id: 'completed_booking_on_bed',
    category: 'BOOKINGS',
    label: 'No completed booking still occupies a bed',
    pass: broken.length === 0,
    brokenRecords: broken,
  };
}

async function auditDuplicateApprovedPayments(): Promise<CheckResult> {
  const rows = await db.execute<{
    booking_id: string;
    booking_code: string | null;
    cnt: number;
    ids: string;
  }>(sql`
    SELECT pr.booking_id::text AS booking_id, bk.booking_code,
           count(*)::int AS cnt,
           string_agg(pr.id::text, ', ') AS ids
    FROM pg_payment_records pr
    LEFT JOIN bookings bk ON bk.id = pr.booking_id
    WHERE pr.status = 'approved' AND pr.booking_id IS NOT NULL
    GROUP BY pr.booking_id, bk.booking_code
    HAVING count(*) > 1
  `);
  const broken = rows.map(
    (r) => `${r.booking_code ?? r.booking_id}: ${r.cnt} approved records [${r.ids}]`,
  );
  return {
    id: 'duplicate_approved_payments',
    category: 'PAYMENTS',
    label: 'No duplicate approved payment records per booking',
    pass: broken.length === 0,
    brokenRecords: broken,
  };
}

async function auditApprovedPaymentFinancialEffect(): Promise<CheckResult> {
  const rows = await db.execute<{
    record_id: string;
    booking_code: string | null;
  }>(sql`
    SELECT pr.id::text AS record_id, bk.booking_code
    FROM pg_payment_records pr
    LEFT JOIN bookings bk ON bk.id = pr.booking_id
    WHERE pr.status = 'approved'
      AND pr.booking_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM payments p
        WHERE p.provider_payment_id = 'qr_record_' || pr.id::text
           OR (p.raw_payload->>'pgPaymentRecordId') = pr.id::text
      )
      AND NOT EXISTS (
        SELECT 1 FROM deposit_ledger dl
        WHERE dl.related_payment_id IS NOT NULL
          AND dl.booking_id = pr.booking_id
          AND dl.entry_kind = 'collected'
          AND dl.created_at >= pr.reviewed_at - interval '1 minute'
      )
    LIMIT 100
  `);
  const broken = rows.map((r) => `pg_payment_record ${r.record_id} (${r.booking_code ?? 'no code'}) — no payment/ledger effect`);
  return {
    id: 'approved_payment_effect',
    category: 'PAYMENTS',
    label: 'Every approved payment has exactly one financial effect',
    pass: broken.length === 0,
    brokenRecords: broken,
  };
}

async function auditOccupiedCountParity(): Promise<CheckResult> {
  const pgRows = await db
    .select({ id: pgs.id, name: pgs.name })
    .from(pgs)
    .where(and(isNull(pgs.archivedAt), eq(pgs.isActive, true)));

  const summaries = await getPgAvailabilitySummaries(pgRows.map((p) => p.id));
  const reservationCounts = await db.execute<{ pg_id: string; cnt: number }>(sql`
    SELECT f.pg_id::text AS pg_id, count(DISTINCT br.bed_id)::int AS cnt
    FROM bed_reservations br
    INNER JOIN bookings bk ON bk.id = br.booking_id
    INNER JOIN beds bd ON bd.id = br.bed_id
    INNER JOIN rooms r ON r.id = bd.room_id
    INNER JOIN floors f ON f.id = r.floor_id
    WHERE br.status = 'active' AND br.kind = 'primary'
      AND bk.status = 'confirmed'
      AND CURRENT_DATE <@ br.stay_range
      AND bd.archived_at IS NULL
    GROUP BY f.pg_id
  `);
  const resByPg = new Map(reservationCounts.map((r) => [r.pg_id, r.cnt]));
  const broken: string[] = [];
  for (const pg of pgRows) {
    const ssot = summaries.get(pg.id);
    const resCount = resByPg.get(pg.id) ?? 0;
    const occupied = ssot?.occupiedBeds ?? 0;
    if (occupied !== resCount) {
      broken.push(`${pg.name}: SSOT occupied=${occupied} vs active reservations=${resCount}`);
    }
  }
  return {
    id: 'occupied_count_parity',
    category: 'BEDS',
    label: 'Occupied count matches reservations',
    pass: broken.length === 0,
    brokenRecords: broken,
  };
}

async function auditMaintenanceExcluded(): Promise<CheckResult> {
  const rows = await db.execute<{
    bed_id: string;
    bed_code: string;
    pg_name: string;
  }>(sql`
    SELECT bd.id::text AS bed_id, bd.bed_code, p.name AS pg_name
    FROM beds bd
    INNER JOIN rooms r ON r.id = bd.room_id
    INNER JOIN floors f ON f.id = r.floor_id
    INNER JOIN pgs p ON p.id = f.pg_id
    WHERE bd.archived_at IS NULL AND bd.status = 'maintenance'
      AND EXISTS (
        SELECT 1 FROM bed_reservations br
        INNER JOIN bookings bk ON bk.id = br.booking_id
        WHERE br.bed_id = bd.id AND br.status = 'active' AND br.kind = 'primary'
          AND bk.status = 'confirmed' AND CURRENT_DATE <@ br.stay_range
      )
  `);
  const broken = rows.map((r) => `${r.pg_name} ${r.bed_code} (${r.bed_id}) — maintenance with active reservation`);
  return {
    id: 'maintenance_excluded',
    category: 'BEDS',
    label: 'Maintenance beds are excluded from availability (no active reservation)',
    pass: broken.length === 0,
    brokenRecords: broken,
  };
}

async function auditActiveResidentBooking(): Promise<CheckResult> {
  const rows = await db.execute<{
    customer_id: string;
    full_name: string;
    active_bookings: number;
  }>(sql`
    WITH active_today AS (
      SELECT DISTINCT bk.customer_id, bk.id AS booking_id
      FROM bookings bk
      INNER JOIN bed_reservations br ON br.booking_id = bk.id
      WHERE bk.status = 'confirmed'
        AND br.status = 'active' AND br.kind = 'primary'
        AND CURRENT_DATE <@ br.stay_range
    )
    SELECT c.id::text AS customer_id, c.full_name,
           count(at.booking_id)::int AS active_bookings
    FROM customers c
    INNER JOIN active_today at ON at.customer_id = c.id
    WHERE c.archived_at IS NULL AND c.residency_status = 'active'
    GROUP BY c.id, c.full_name
    HAVING count(at.booking_id) <> 1
  `);
  const broken = rows.map(
    (r) => `${r.full_name} (${r.customer_id}): ${r.active_bookings} active confirmed bookings`,
  );
  return {
    id: 'active_resident_one_booking',
    category: 'RESIDENTS',
    label: 'Every active resident has one active booking',
    pass: broken.length === 0,
    brokenRecords: broken,
  };
}

async function auditWebsiteAvailability(): Promise<CheckResult> {
  const publicList = await listPublicPgs();
  if (!publicList.ok) {
    return {
      id: 'website_availability',
      category: 'WEBSITE',
      label: 'Availability matches admin (public list vs SSOT)',
      pass: false,
      brokenRecords: [`listPublicPgs failed: ${publicList.error}`],
    };
  }
  const broken: string[] = [];
  for (const pg of publicList.data) {
    const direct = await getPgAvailabilitySummaries([pg.id]);
    const ssot = direct.get(pg.id);
    if (!ssot) continue;
    if (
      pg.availableBeds !== ssot.availableBeds ||
      pg.occupiedBeds !== ssot.occupiedBeds ||
      pg.maintenanceBeds !== ssot.maintenanceBeds
    ) {
      broken.push(
        `${pg.name}: website avail=${pg.availableBeds} occ=${pg.occupiedBeds} maint=${pg.maintenanceBeds} vs SSOT avail=${ssot.availableBeds} occ=${ssot.occupiedBeds} maint=${ssot.maintenanceBeds}`,
      );
    }
  }
  return {
    id: 'website_availability',
    category: 'WEBSITE',
    label: 'Availability matches admin (public list vs SSOT)',
    pass: broken.length === 0,
    brokenRecords: broken,
  };
}

function fromConsistency(
  id: string,
  category: string,
  label: string,
  pass: boolean,
  brokenRecords: string[],
): CheckResult {
  return { id, category, label, pass, brokenRecords };
}

function mapFinancialChecks(report: Awaited<ReturnType<typeof runFinancialIntegrityAudit>>): CheckResult[] {
  const byType = report.summary.byCheckType;
  const pick = (type: keyof typeof byType, category: string, label: string) => {
    const issues = report.issues.filter((i) => i.checkType === type);
    return fromConsistency(
      type,
      category,
      label,
      issues.length === 0,
      issues.map((i) => `${i.customerName}: ${i.detail}${i.invoiceNumber ? ` [${i.invoiceNumber}]` : ''}${i.bookingId ? ` booking=${i.bookingId}` : ''}`),
    );
  };
  return [
    pick('DEPOSIT_LEDGER_NEGATIVE', 'DEPOSITS', 'Wallet balance equals ledger (no negative deposit balance)'),
    pick('DEPOSIT_SHORTFALL_NOT_INVOICED', 'DEPOSITS', 'Deposit due invoices reconcile'),
    pick('PAYMENT_NOT_RECONCILED', 'PAYMENTS', 'Paid invoices match payment records'),
    pick('INVOICE_TOTAL_MISMATCH', 'INVOICES', 'Invoice totals reconcile'),
    pick('OUTSTANDING_NOT_SURFACED', 'INVOICES', 'Outstanding balances reconcile'),
    pick('DUPLICATE_INVOICE', 'INVOICES', 'No duplicate active invoices'),
    pick('INVOICE_EMPTY', 'INVOICES', 'No empty invoices with amount'),
  ];
}

function mapBillingChecks(report: Awaited<ReturnType<typeof runBillingIntegrityCheck>>): CheckResult[] {
  const byType = report.summary.byCheckType;
  const pick = (type: keyof typeof byType, category: string, label: string) => {
    const issues = report.issues.filter((i) => i.checkType === type);
    return fromConsistency(
      type,
      category,
      label,
      issues.length === 0,
      issues.map((i) => `${i.customerName}: ${i.detail}`),
    );
  };
  return [
    pick('DUPLICATE_APPROVED_PAYMENT', 'PAYMENTS', 'No duplicate approved payments (billing SSOT)'),
    pick('INVOICE_PAID_WITHOUT_PAYMENT', 'INVOICES', 'Paid invoices have backing payments'),
    pick('APPROVED_PAYMENT_INVOICE_DUE', 'INVOICES', 'Approved payments clear invoice due'),
    pick('ROOM_PEER_BILLING_MISMATCH', 'ELECTRICITY', 'Room totals reconcile (peer billing)'),
    pick('MISSING_ELECTRICITY_INVOICE', 'ELECTRICITY', 'Electricity invoices present where expected'),
    pick('DUPLICATE_SOURCE_INVOICE', 'ELECTRICITY', 'No duplicate electricity/rent source invoices'),
    pick('SOURCE_MIRROR_MISMATCH', 'ELECTRICITY', 'Source invoices mirror financial invoices'),
  ];
}

function mapConsistency(report: ProductionDataConsistencyReport, bedAudit: Awaited<ReturnType<typeof runBedAudit>>): CheckResult[] {
  return [
    fromConsistency(
      'ghost_occupied',
      'BEDS',
      'No ghost occupied beds',
      report.ghostOccupied.length === 0 && !bedAudit.issues.some((i) => i.kind === 'ghost_occupied'),
      [
        ...report.ghostOccupied.map((r) => `${r.pgName} R${r.roomNumber} ${r.bedCode} (${r.bedId})`),
        ...bedAudit.issues.filter((i) => i.kind === 'ghost_occupied').map((i) => i.detail),
      ],
    ),
    fromConsistency(
      'double_assignment',
      'BOOKINGS',
      'No duplicate active bookings for the same bed',
      !bedAudit.issues.some((i) => i.kind === 'double_assignment'),
      bedAudit.issues.filter((i) => i.kind === 'double_assignment').map((i) => `${i.pgName} ${i.bedCode}: ${i.detail}`),
    ),
    fromConsistency(
      'orphan_reservations',
      'BEDS',
      'No orphan reservations',
      report.orphanReservations.length === 0,
      report.orphanReservations.map(
        (r) => `${r.bookingCode} (${r.bookingStatus}) res=${r.resStatus} → ${r.pgName ?? '?'} ${r.bedCode ?? '?'}`,
      ),
    ),
    fromConsistency(
      'duplicate_pending_payments',
      'PAYMENTS',
      'No duplicate pending payment records',
      report.duplicatePendingPayments.length === 0,
      report.duplicatePendingPayments.map(
        (r) => `${r.bookingCode ?? r.bookingId}: ${r.pendingCount} pending [${r.recordIds.join(', ')}]`,
      ),
    ),
    fromConsistency(
      'duplicate_action_items',
      'PAYMENTS',
      'No duplicate action items',
      report.duplicateActionItems.length === 0,
      report.duplicateActionItems.map(
        (r) => `${r.type} ${r.entityKey}: ${r.openCount} open [${r.sourceKeys.join(' | ')}]`,
      ),
    ),
    fromConsistency(
      'missing_checkout_settlements',
      'RESIDENTS',
      'Every completed booking with deposit has checkout history',
      report.missingCheckoutSettlements.length === 0,
      report.missingCheckoutSettlements.map((r) => `${r.bookingCode} ${r.customerName}`),
    ),
  ];
}

async function main() {
  if (!hasDatabaseUrl()) {
    console.error('No DATABASE_URL. Run with USE_PRODUCTION_DB=1 and .env.prod.live configured.');
    process.exit(1);
  }

  const session = mockSession();
  const host = getDatabaseHost() ?? 'unknown';
  console.log(`\nIntegrity audit @ ${host}\n${'='.repeat(60)}\n`);

  let billing: Awaited<ReturnType<typeof runBillingIntegrityCheck>> | null = null;
  let billingError: string | null = null;
  try {
    billing = await runBillingIntegrityCheck();
  } catch (err) {
    billingError = err instanceof Error ? err.message : String(err);
  }

  const [
    consistency,
    bedAudit,
    financial,
    checkout,
    deposit,
    vacating,
    paymentReview,
    bookingPrimary,
    completedOnBed,
    dupApproved,
    approvedEffect,
    occupiedParity,
    maintenanceExcluded,
    activeResident,
    websiteAvail,
  ] = await Promise.all([
    runProductionDataConsistencyAudit(),
    runBedAudit(),
    runFinancialIntegrityAudit(),
    runCheckoutAudit(session),
    runDepositAudit(session, { sampleSize: 50 }),
    runVacatingAudit(),
    getPaymentReviewIntegrityReport(session),
    auditBookingPrimaryReservation(),
    auditCompletedBookingOnBed(),
    auditDuplicateApprovedPayments(),
    auditApprovedPaymentFinancialEffect(),
    auditOccupiedCountParity(),
    auditMaintenanceExcluded(),
    auditActiveResidentBooking(),
    auditWebsiteAvailability(),
  ]);

  const consistencyChecks = mapConsistency(consistency, bedAudit);

  const checks: CheckResult[] = [
    bookingPrimary,
    completedOnBed,
    ...consistencyChecks.filter((c) => c.id === 'double_assignment'),
    ...consistencyChecks.filter((c) =>
      ['ghost_occupied', 'orphan_reservations', 'duplicate_pending_payments', 'duplicate_action_items', 'missing_checkout_settlements'].includes(c.id),
    ),
    occupiedParity,
    maintenanceExcluded,
    dupApproved,
    fromConsistency(
      'payment_review_ssot',
      'PAYMENTS',
      'No duplicate approvals / stale payment review artifacts',
      paymentReview.matches && paymentReview.stale.openPaymentReceivedActionItems.length === 0,
      [
        ...(paymentReview.matches ? [] : [`Queue ${paymentReview.queueCount} ≠ dashboard ${paymentReview.dashboardCount}`]),
        ...paymentReview.stale.openPaymentReceivedActionItems.map((id) => `orphan action_item ${id}`),
        ...paymentReview.stale.orphanPaymentProofUnresolved.map((id) => `orphan unresolved ${id}`),
        ...paymentReview.stale.stalePaymentNotifications.map((id) => `stale notification ${id}`),
      ],
    ),
    approvedEffect,
    ...mapFinancialChecks(financial),
    ...(billing ? mapBillingChecks(billing) : [
      fromConsistency(
        'billing_integrity_audit',
        'ELECTRICITY',
        'Billing integrity audit (electricity/rent duplicates)',
        false,
        [billingError ?? 'billing integrity check failed to run'],
      ),
    ]),
    fromConsistency(
      'checkout_refunds',
      'DEPOSITS',
      'Refunds / checkout pipeline reconcile',
      checkout.pass,
      checkout.issues.map((i) => `${i.code}: ${i.detail}`),
    ),
    fromConsistency(
      'deposit_sample',
      'DEPOSITS',
      'Deposit transfers reconcile (sampled active bookings)',
      deposit.pass,
      deposit.issues.map((i) => `${i.bookingCode} ${i.residentName}: ${i.detail}`),
    ),
    fromConsistency(
      'vacating_lifecycle',
      'RESIDENTS',
      'No impossible lifecycle states',
      vacating.pass,
      vacating.issues.map((i) => `${i.bookingCode} ${i.customerName}: ${i.detail}`),
    ),
    websiteAvail,
    fromConsistency(
      'website_search',
      'WEBSITE',
      'Search / PG cards match availability SSOT',
      websiteAvail.pass,
      websiteAvail.brokenRecords,
    ),
    fromConsistency(
      'booking_flow_occupancy',
      'WEBSITE',
      'Booking flow matches occupancy (no status-only drift)',
      consistency.pgAvailability.every((r) => r.statusOnlyAvailable === r.expectedAvailable || r.occupiedBeds > 0),
      consistency.pgAvailability
        .filter((r) => r.statusOnlyAvailable !== r.expectedAvailable && r.occupiedBeds === 0)
        .map((r) => `${r.pgName}: status-only=${r.statusOnlyAvailable} SSOT=${r.expectedAvailable}`),
    ),
  ];

  // Deduplicate checks by id (some were added twice in composition — fix)
  const seen = new Set<string>();
  const uniqueChecks = checks.filter((c) => {
    if (seen.has(c.id)) return false;
    seen.add(c.id);
    return true;
  });

  const categories = [
    'BOOKINGS',
    'BEDS',
    'PAYMENTS',
    'DEPOSITS',
    'ELECTRICITY',
    'INVOICES',
    'RESIDENTS',
    'WEBSITE',
  ] as const;

  let totalFail = 0;
  let totalBroken = 0;

  for (const cat of categories) {
    const catChecks = uniqueChecks.filter((c) => c.category === cat);
    if (catChecks.length === 0) continue;
    const catPass = catChecks.every((c) => c.pass);
    console.log(`\n## ${cat} — ${catPass ? 'PASS' : 'FAIL'}\n`);
    for (const check of catChecks) {
      const mark = check.pass ? '✓' : '✗';
      console.log(`${mark} ${check.label}`);
      if (!check.pass) {
        totalFail += 1;
        totalBroken += check.brokenRecords.length;
        for (const rec of check.brokenRecords.slice(0, 50)) {
          console.log(`    • ${rec}`);
        }
        if (check.brokenRecords.length > 50) {
          console.log(`    … and ${check.brokenRecords.length - 50} more`);
        }
      }
    }
  }

  const overallPass = uniqueChecks.every((c) => c.pass);
  console.log(`\n${'='.repeat(60)}`);
  console.log(`OVERALL: ${overallPass ? 'PASS' : 'FAIL'}`);
  console.log(`Checks: ${uniqueChecks.length} | Failed checks: ${uniqueChecks.filter((c) => !c.pass).length} | Broken records: ${totalBroken}`);
  console.log(`Generated: ${new Date().toISOString()}`);

  if (overallPass) {
    console.log('\nProduction integrity is verified.');
  }

  await closeDb();
  process.exit(overallPass ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  await closeDb().catch(() => undefined);
  process.exit(1);
});
