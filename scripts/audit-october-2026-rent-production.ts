/* eslint-disable no-console */
/**
 * October 2026 rent invoice audit + optional generation via generateRentInvoicesForMonth SSOT.
 *
 *   npx tsx scripts/audit-october-2026-rent-production.ts --audit-only
 *   npx tsx scripts/audit-october-2026-rent-production.ts --apply
 */
import { and, eq, inArray, sql } from 'drizzle-orm';
import { loadProductionAuditEnv, requireDatabaseUrl } from '../src/lib/db/loadEnv';

loadProductionAuditEnv();
requireDatabaseUrl('audit-october-2026-rent-production.ts');

import { closeDb, db } from '../src/db/client';
import {
  bedReservations,
  beds,
  bookings,
  customers,
  floors,
  pgs,
  rentInvoices,
  residentBillingProfiles,
  rooms,
  vacatingRequests,
} from '../src/db/schema';
import { formatDate } from '../src/lib/dates';
import { firstOfMonth, monthBounds } from '../src/services/billing';
import {
  isProductionBookingFilter,
  isProductionCustomerFilter,
  isActiveResidentFilter,
} from '../src/lib/billing/productionDataFilter';
import { resolveMonthlyRentPaiseForBooking } from '../src/lib/billing/rentPricingSsot';
import {
  evaluateAnniversaryRentGenerationEligibility,
  generateRentInvoicesForMonth,
} from '../src/services/rentInvoices';

const BILLING_MONTH = '2026-10-01';
const AS_OF = '2026-10-01';

type RowClass =
  | 'BILL_EXISTS'
  | 'BILL_MISSING'
  | 'BILL_CANCELLED'
  | 'NOT_YET_BILLABLE'
  | 'SPECIAL_CASE';

type AuditRow = {
  resident: string;
  customerId: string;
  bookingId: string;
  bookingCode: string;
  pg: string;
  room: string;
  bed: string;
  checkIn: string;
  checkout: string | null;
  billingDay: number;
  billingPolicy: string;
  octRentPaise: number;
  invoiceNumber: string | null;
  invoiceStatus: string | null;
  outstandingPaise: number | null;
  classification: RowClass;
  action: string;
  detail: string;
};

function fmtRs(paise: number) {
  return `₹${(paise / 100).toLocaleString('en-IN')}`;
}

async function loadCandidates() {
  const billingMonth = firstOfMonth(BILLING_MONTH);
  const { start: monthStart, end: monthEnd } = monthBounds(billingMonth);
  const monthStartIso = formatDate(monthStart);
  const monthEndIso = formatDate(monthEnd);

  const rows = await db
    .selectDistinct({
      bookingId: bookings.id,
      bookingCode: bookings.bookingCode,
      customerId: bookings.customerId,
      customerName: customers.fullName,
      durationMode: bookings.durationMode,
      pricingSnapshot: bookings.pricingSnapshot,
      bedId: bedReservations.bedId,
      checkIn: sql<string>`to_char(lower(${bedReservations.stayRange}), 'YYYY-MM-DD')`,
      checkout: sql<string | null>`CASE WHEN upper(${bedReservations.stayRange}) IS NULL THEN NULL ELSE to_char(upper(${bedReservations.stayRange}), 'YYYY-MM-DD') END`,
      pgName: pgs.name,
      roomNumber: rooms.roomNumber,
      bedCode: beds.bedCode,
      billingDay: residentBillingProfiles.billingDay,
      billingCyclePolicy: residentBillingProfiles.billingCyclePolicy,
    })
    .from(bookings)
    .innerJoin(customers, eq(customers.id, bookings.customerId))
    .innerJoin(bedReservations, eq(bedReservations.bookingId, bookings.id))
    .innerJoin(beds, eq(beds.id, bedReservations.bedId))
    .innerJoin(rooms, eq(rooms.id, beds.roomId))
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .innerJoin(pgs, eq(pgs.id, floors.pgId))
    .leftJoin(residentBillingProfiles, eq(residentBillingProfiles.bookingId, bookings.id))
    .where(
      and(
        eq(bookings.status, 'confirmed'),
        isProductionBookingFilter(),
        isProductionCustomerFilter(),
        isActiveResidentFilter(),
        inArray(bookings.durationMode, ['monthly', 'open_ended']),
        eq(bedReservations.status, 'active'),
        eq(bedReservations.kind, 'primary'),
        sql`${bedReservations.stayRange} && daterange(${monthStartIso}::date, ${monthEndIso}::date, '[)')`,
      ),
    );

  const byBooking = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    const existing = byBooking.get(row.bookingId);
    if (!existing || row.bedId < existing.bedId) {
      byBooking.set(row.bookingId, row);
    }
  }
  return [...byBooking.values()].sort((a, b) =>
    `${a.pgName}${a.roomNumber}${a.bedCode}`.localeCompare(`${b.pgName}${b.roomNumber}${b.bedCode}`),
  );
}

async function loadOctoberInvoices(bookingId: string) {
  return db
    .select({
      id: rentInvoices.id,
      invoiceNumber: rentInvoices.invoiceNumber,
      status: rentInvoices.status,
      rentPaise: rentInvoices.rentPaise,
      paidPrincipalPaise: rentInvoices.paidPrincipalPaise,
      billingMonth: rentInvoices.billingMonth,
    })
    .from(rentInvoices)
    .where(
      and(
        eq(rentInvoices.bookingId, bookingId),
        eq(rentInvoices.billingMonth, BILLING_MONTH),
        eq(rentInvoices.isAdhoc, false),
      ),
    );
}

async function classifyRow(c: Awaited<ReturnType<typeof loadCandidates>>[number]): Promise<AuditRow> {
  const invoices = await loadOctoberInvoices(c.bookingId);
  const active = invoices.find((i) => i.status !== 'cancelled');
  const cancelledOnly = invoices.length > 0 && !active;

  const rentResolved = await resolveMonthlyRentPaiseForBooking(c.bookingId, BILLING_MONTH);
  const eligibility = await evaluateAnniversaryRentGenerationEligibility({
    bookingId: c.bookingId,
    customerId: c.customerId,
    bedId: c.bedId,
    pricingSnapshot: c.pricingSnapshot as import('../src/db/schema/bookings').PricingSnapshot | null,
    billingMonth: BILLING_MONTH,
    asOf: AS_OF,
    forceAll: true,
    readonly: true,
  });

  const octRentPaise = eligibility.eligible ? eligibility.rentPaise : rentResolved.rentPaise;
  const billingDay = c.billingDay ?? 5;
  const billingPolicy = c.billingCyclePolicy ?? 'anniversary';

  let classification: RowClass;
  let action: string;
  let detail = '';

  if (invoices.length > 1) {
    classification = 'SPECIAL_CASE';
    action = 'Review duplicates';
    detail = `${invoices.length} October rows: ${invoices.map((i) => i.invoiceNumber).join(', ')}`;
  } else if (active) {
    if (eligibility.eligible && active.rentPaise !== eligibility.rentPaise) {
      classification = 'BILL_EXISTS';
      action = 'Sync SSOT amount';
      detail = `${active.invoiceNumber}: ${fmtRs(active.rentPaise)} → ${fmtRs(eligibility.rentPaise)}`;
    } else {
      classification = 'BILL_EXISTS';
      action = 'None';
      detail = active.invoiceNumber;
    }
  } else if (cancelledOnly) {
    if (eligibility.eligible) {
      classification = 'BILL_CANCELLED';
      action = 'Generate replacement';
      detail = `Cancelled ${invoices.map((i) => i.invoiceNumber).join(', ')}; eligible per SSOT`;
    } else {
      classification = 'NOT_YET_BILLABLE';
      action = 'None';
      detail = `Cancelled only; regen blocked: ${eligibility.skipCode}`;
    }
  } else if (eligibility.eligible) {
    classification = 'BILL_MISSING';
    action = 'Generate';
    detail = 'eligible';
  } else {
    const skip = eligibility.skipCode ?? 'unknown';
    const specialSkips = new Set([
      'vacating_generate_prorated',
      'vacating_adjust_existing',
      'already_covered',
      'private_room_duplicate',
    ]);
    if (specialSkips.has(skip) || skip.startsWith('vacating_')) {
      classification = 'SPECIAL_CASE';
      action = 'Manual review';
    } else {
      classification = 'NOT_YET_BILLABLE';
      action = 'None';
    }
    detail = skip;
  }

  const inv = active ?? invoices[0] ?? null;
  const outstanding =
    inv && inv.status !== 'cancelled' && inv.status !== 'paid'
      ? Math.max(0, inv.rentPaise - (inv.paidPrincipalPaise ?? 0))
      : inv?.status === 'paid'
        ? 0
        : null;

  return {
    resident: c.customerName,
    customerId: c.customerId,
    bookingId: c.bookingId,
    bookingCode: c.bookingCode,
    pg: c.pgName,
    room: c.roomNumber,
    bed: c.bedCode,
    checkIn: c.checkIn,
    checkout: c.checkout,
    billingDay,
    billingPolicy,
    octRentPaise,
    invoiceNumber: inv?.invoiceNumber ?? null,
    invoiceStatus: inv?.status ?? null,
    outstandingPaise: outstanding,
    classification,
    action,
    detail,
  };
}

async function runAudit(): Promise<AuditRow[]> {
  const candidates = await loadCandidates();
  const rows: AuditRow[] = [];
  for (const c of candidates) {
    rows.push(await classifyRow(c));
  }
  return rows;
}

function printReport(rows: AuditRow[], title: string) {
  console.log('\n' + '═'.repeat(80));
  console.log(title);
  console.log('═'.repeat(80));
  console.log(
    'Resident | PG | Room | Bed | Oct Rent | Invoice | Status | Action',
  );
  for (const r of rows) {
    const inv = r.invoiceNumber ?? '—';
    const st = r.invoiceStatus ?? '—';
    console.log(
      `${r.resident} | ${r.pg.replace(/ - AWESOME PG$/i, '')} | ${r.room} | ${r.bed} | ${fmtRs(r.octRentPaise)} | ${inv} | ${st} | ${r.action}`,
    );
  }

  const billable = rows.filter(
    (r) =>
      r.classification === 'BILL_EXISTS' ||
      r.classification === 'BILL_MISSING' ||
      r.classification === 'BILL_CANCELLED',
  );
  const exists = rows.filter((r) => r.classification === 'BILL_EXISTS').length;
  const missing = rows.filter((r) => r.classification === 'BILL_MISSING').length;
  const cancelled = rows.filter((r) => r.classification === 'BILL_CANCELLED').length;
  const special = rows.filter((r) => r.classification === 'SPECIAL_CASE').length;
  const notYet = rows.filter((r) => r.classification === 'NOT_YET_BILLABLE').length;

  console.log('\n--- Summary ---');
  console.log(`TOTAL CURRENT/BILLABLE RESIDENTS (Oct intersect + eligible path): ${billable.length}`);
  console.log(`OCTOBER BILLS ALREADY GENERATED: ${exists}`);
  console.log(`OCTOBER BILLS MISSING: ${missing}`);
  console.log(`CANCELLED/REQUIRING REGENERATION: ${cancelled}`);
  console.log(`NOT YET BILLABLE: ${notYet}`);
  console.log(`SPECIAL CASES: ${special}`);

  if (missing + cancelled > 0) {
    console.log('\nMissing / regen list:');
    for (const r of rows.filter(
      (x) => x.classification === 'BILL_MISSING' || x.classification === 'BILL_CANCELLED',
    )) {
      console.log(`  - ${r.resident} (${r.bookingCode}) ${r.pg} ${r.room}/${r.bed} — ${r.detail}`);
    }
  }
  if (special > 0) {
    console.log('\nSpecial cases:');
    for (const r of rows.filter((x) => x.classification === 'SPECIAL_CASE')) {
      console.log(`  - ${r.resident} (${r.bookingCode}): ${r.detail}`);
    }
  }
}

async function main() {
  const apply = process.argv.includes('--apply');
  const auditOnly = process.argv.includes('--audit-only') || !apply;

  console.log(`Billing month: ${BILLING_MONTH} | asOf: ${AS_OF} | mode: ${apply ? 'APPLY' : 'AUDIT ONLY'}`);

  const pre = await runAudit();
  printReport(pre, 'PHASE 1 — OCTOBER 2026 RENT AUDIT (PRE)');

  const toGenerate = pre.filter(
    (r) => r.classification === 'BILL_MISSING' || r.classification === 'BILL_CANCELLED',
  );
  const syncTargets = pre.filter((r) => r.action === 'Sync SSOT amount');
  const totalPaise = toGenerate.reduce((s, r) => s + r.octRentPaise, 0);

  const saswat = pre.find((r) => /saswat/i.test(r.resident));
  if (saswat) {
    console.log('\n--- Saswat Baral (production snapshot) ---');
    console.log(JSON.stringify(saswat, null, 2));
  }

  if (auditOnly) {
    console.log(`\nWould create up to ${toGenerate.length} invoices totaling ${fmtRs(totalPaise)} via generateRentInvoicesForMonth.`);
    console.log(`Would SSOT-sync ${syncTargets.length} invoice amount(s).`);
    console.log('Re-run with --apply to execute.');
    await closeDb();
    return;
  }

  if (toGenerate.length === 0 && syncTargets.length === 0) {
    console.log('\nNo missing October bills to generate and no SSOT amount sync needed.');
    await closeDb();
    return;
  }

  if (toGenerate.length === 0) {
    console.log('\nNo missing October bills; running SSOT sync only.');
  }

  console.log(`\nSSOT sync for ${syncTargets.length} invoice(s)…`);
  const { syncPendingRentInvoicesFromSsot } = await import('../src/lib/billing/rentPricingSsot');
  for (const r of syncTargets) {
    const synced = await syncPendingRentInvoicesFromSsot(r.bookingId, BILLING_MONTH);
    console.log(`SSOT sync ${r.resident} (${r.bookingCode}):`, synced);
  }

  let gen = { invoicesCreated: 0, invoicesSkipped: 0, candidateBookings: 0 };
  if (toGenerate.length > 0) {
    console.log(
      `\nExecuting generateRentInvoicesForMonth for ${toGenerate.length} expected rows (${fmtRs(totalPaise)})…`,
    );
    gen = await generateRentInvoicesForMonth({
      billingMonth: BILLING_MONTH,
      forceAll: true,
      asOf: AS_OF,
    });
  }
  console.log('Generator result:', gen);

  const post = await runAudit();
  printReport(post, 'PHASE 3 — POST-GENERATION AUDIT');

  const stillMissing = post.filter((r) => r.classification === 'BILL_MISSING').length;
  const dups = post.filter((r) => r.classification === 'SPECIAL_CASE' && r.detail.includes('October rows')).length;
  const valid = post.filter((r) => r.classification === 'BILL_EXISTS').length;

  console.log('\n--- Final verification ---');
  console.log(`VALID OCTOBER BILLS: ${valid}`);
  console.log(`STILL MISSING: ${stillMissing}`);
  console.log(`DUPLICATE FLAGS: ${dups}`);
  console.log(`Invoices created this run: ${gen.invoicesCreated}`);

  await closeDb();
}

main().catch(async (err) => {
  console.error(err);
  await closeDb();
  process.exit(1);
});
