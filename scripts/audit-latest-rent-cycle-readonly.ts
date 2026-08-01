#!/usr/bin/env npx tsx
/**
 * Read-only billing correctness audit for the latest rent generation cycle.
 *
 *   npx tsx scripts/audit-latest-rent-cycle-readonly.ts
 *   npx tsx scripts/audit-latest-rent-cycle-readonly.ts --run-date 2026-08-01
 */
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { loadProductionAuditEnv, requireDatabaseUrl } from '@/src/lib/db/loadEnv';
import { db, closeDb } from '@/src/db/client';
import {
  bedReservations,
  beds,
  billingGenerationRuns,
  bookings,
  customers,
  depositLedger,
  financialInvoices,
  pgs,
  rentInvoices,
  residentBillingProfiles,
  roomTypes,
  rooms,
} from '@/src/db/schema';
import { resolveMonthlyRentPaiseForBooking } from '@/src/lib/billing/rentPricingSsot';
import { getRoomBillingConfigForBed } from '@/src/lib/billing/roomBilling';
import { getDatabaseConnectionInfo } from '@/src/lib/db/env';
import { loadBedPrice } from '@/src/services/pricing';
import {
  getLatestBillingGenerationRun,
  listTodayGeneratedInvoices,
} from '@/src/services/billingScheduler';
import { todayInBillingTimezone } from '@/src/lib/billing/billingTimezone';
import { fullMonthlyRentPaise } from '@/src/services/billing';

loadProductionAuditEnv();
requireDatabaseUrl('audit-latest-rent-cycle-readonly.ts');

type Discrepancy = {
  category: 'rent' | 'deposit' | 'sharing' | 'profile' | 'unified';
  resident: string;
  bookingCode: string;
  bookingId: string;
  room: string;
  bed: string;
  pg: string;
  billingMonth: string;
  invoiceNumber: string;
  expected: string;
  generated: string;
  reason: string;
  codePath: string;
  dbFields: string;
  fixRequired: string;
};

function paise(p: number) {
  return `₹${(p / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
}

function argRunDate(): string | null {
  const idx = process.argv.indexOf('--run-date');
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return null;
}

async function countActiveResidentsInRoom(roomId: string, asOf: string) {
  const rows = await db.execute<{
    booking_id: string;
    customer_name: string;
    bed_code: string;
    booking_status: string;
    reservation_status: string;
    stay_start: string;
    stay_end: string | null;
  }>(sql`
    SELECT bk.id::text AS booking_id,
           c.full_name AS customer_name,
           b.bed_code,
           bk.status AS booking_status,
           br.status AS reservation_status,
           to_char(lower(br.stay_range), 'YYYY-MM-DD') AS stay_start,
           CASE WHEN upper_inc(br.stay_range)
             THEN to_char(upper(br.stay_range), 'YYYY-MM-DD')
             ELSE to_char(upper(br.stay_range) - 1, 'YYYY-MM-DD')
           END AS stay_end
    FROM beds b
    JOIN bed_reservations br ON br.bed_id = b.id AND br.kind = 'primary'
    JOIN bookings bk ON bk.id = br.booking_id
    JOIN customers c ON c.id = bk.customer_id
    WHERE b.room_id = ${roomId}::uuid
      AND bk.status = 'confirmed'
      AND br.status = 'active'
      AND ${asOf}::date <@ br.stay_range
      AND c.is_test = false
      AND bk.is_test = false
    ORDER BY b.bed_code
  `);
  return rows;
}

async function countRoomBeds(roomId: string) {
  const [row] = await db
    .select({
      total: sql<number>`count(*)::int`,
      available: sql<number>`count(*) filter (where ${beds.status} = 'available')::int`,
      blocked: sql<number>`count(*) filter (where ${beds.status} = 'blocked')::int`,
      maintenance: sql<number>`count(*) filter (where ${beds.status} = 'maintenance')::int`,
    })
    .from(beds)
    .where(eq(beds.roomId, roomId));
  return row ?? { total: 0, available: 0, blocked: 0, maintenance: 0 };
}

async function depositCollectedPaise(bookingId: string) {
  const [row] = await db
    .select({
      total: sql<number>`coalesce(sum(${depositLedger.amountPaise}), 0)::bigint::int`,
    })
    .from(depositLedger)
    .where(and(eq(depositLedger.bookingId, bookingId), eq(depositLedger.entryKind, 'collected')));
  return Number(row?.total ?? 0);
}

async function latestBedPriceRevision(bedId: string, pgId: string) {
  const revisions = await db
    .select({
      createdAt: sql<string>`created_at`,
      bedChanges: sql<unknown>`bed_changes`,
    })
    .from(sql`pg_price_revisions`)
    .where(sql`pg_id = ${pgId}::uuid`)
    .orderBy(sql`created_at desc`)
    .limit(5);
  for (const rev of revisions) {
    const changes = rev.bedChanges as Array<{ bedId: string; newRentPaise: number; oldRentPaise: number }> | null;
    const hit = changes?.find((c) => c.bedId === bedId);
    if (hit) return hit;
  }
  return null;
}

async function main() {
  const runDate = argRunDate() ?? todayInBillingTimezone();
  const conn = getDatabaseConnectionInfo();
  console.log('═'.repeat(80));
  console.log('BILLING CORRECTNESS AUDIT — Latest rent generation cycle');
  console.log('═'.repeat(80));
  console.log(`DB host: ${conn.host ?? 'unknown'}`);
  console.log(`Audit run date (IST): ${runDate}`);
  console.log('');

  const latestRun = await getLatestBillingGenerationRun();
  if (latestRun) {
    console.log('Latest billing_generation_runs:');
    console.log(
      `  id=${latestRun.id} run_date=${latestRun.runDate} status=${latestRun.status} created=${latestRun.createdCount} skipped=${latestRun.skippedCount} failed=${latestRun.failedCount}`,
    );
    console.log(`  started=${latestRun.startedAt?.toISOString()} finished=${latestRun.finishedAt?.toISOString() ?? 'n/a'}`);
  } else {
    console.log('No billing_generation_runs rows found.');
  }
  console.log('');

  const invoices = await listTodayGeneratedInvoices(runDate);
  console.log(`Invoices generated on ${runDate} (IST): ${invoices.length}`);
  console.log('');

  if (invoices.length === 0) {
    const recentRuns = await db
      .select()
      .from(billingGenerationRuns)
      .orderBy(desc(billingGenerationRuns.startedAt))
      .limit(5);
    console.log('No invoices for run date. Recent scheduler runs:');
    for (const r of recentRuns) {
      console.log(
        `  ${r.runDate} status=${r.status} created=${r.createdCount} started=${r.startedAt?.toISOString()}`,
      );
    }
    if (recentRuns[0]?.runDate) {
      const alt = await listTodayGeneratedInvoices(recentRuns[0].runDate);
      console.log(`\nInvoices on latest run date ${recentRuns[0].runDate}: ${alt.length}`);
      if (alt.length > 0) {
        console.log('Re-run with: --run-date', recentRuns[0].runDate);
      }
    }
    await closeDb();
    return;
  }

  const discrepancies: Discrepancy[] = [];
  const summaryRows: Array<Record<string, unknown>> = [];

  for (const inv of invoices) {
    const [booking] = await db
      .select({
        bookingCode: bookings.bookingCode,
        depositPaise: bookings.depositPaise,
        depositDuePaise: bookings.depositDuePaise,
        depositCollectionStatus: bookings.depositCollectionStatus,
        pricingSnapshot: bookings.pricingSnapshot,
      })
      .from(bookings)
      .where(eq(bookings.id, inv.bookingId))
      .limit(1);

    const [profile] = await db
      .select({
        rentAmountPaise: residentBillingProfiles.rentAmountPaise,
        billingDay: residentBillingProfiles.billingDay,
      })
      .from(residentBillingProfiles)
      .where(eq(residentBillingProfiles.bookingId, inv.bookingId))
      .limit(1);

    const [bedRow] = await db
      .select({ bedId: beds.id, roomId: beds.roomId, bedCode: beds.bedCode })
      .from(beds)
      .innerJoin(rentInvoices, eq(rentInvoices.bedId, beds.id))
      .where(eq(rentInvoices.id, inv.invoiceId))
      .limit(1);

    const bedId = bedRow?.bedId ?? '';
    const roomId = bedRow?.roomId ?? '';

    const resolved = await resolveMonthlyRentPaiseForBooking(inv.bookingId, inv.billingMonth);
    const expectedRentPaise = fullMonthlyRentPaise(resolved.rentPaise);
    const bedPrice = bedId ? await loadBedPrice(bedId, inv.billingMonth) : null;
    const revision = bedId ? await latestBedPriceRevision(bedId, inv.pgId) : null;
    const roomConfig = bedId ? await getRoomBillingConfigForBed(bedId) : null;
    const depositCollected = await depositCollectedPaise(inv.bookingId);

    const [fin] = await db
      .select({
        id: financialInvoices.id,
        amountPaise: financialInvoices.amountPaise,
        breakdown: financialInvoices.breakdown,
      })
      .from(financialInvoices)
      .where(
        and(
          eq(financialInvoices.sourceTable, 'rent_invoices'),
          eq(financialInvoices.sourceId, inv.invoiceId),
        ),
      )
      .limit(1);

    const breakdown = fin?.breakdown;
    const depositOnInvoice = breakdown?.depositPaise ?? 0;
    const depositOutstandingOnInvoice = breakdown?.depositOutstandingPaise ?? 0;

    const [roomMeta] = roomId
      ? await db
          .select({
            roomNumber: rooms.roomNumber,
            roomTypeName: roomTypes.name,
            billingMode: rooms.billingMode,
          })
          .from(rooms)
          .innerJoin(roomTypes, eq(roomTypes.id, rooms.roomTypeId))
          .where(eq(rooms.id, roomId))
          .limit(1)
      : [];

    const activeOccupants = roomId ? await countActiveResidentsInRoom(roomId, runDate) : [];
    const bedCounts = roomId ? await countRoomBeds(roomId) : null;
    const billableSharingCount = Math.max(1, activeOccupants.length);
    const roomSharingCapacity = bedCounts?.total ?? null;
    const roomTypeLabel = roomMeta?.roomTypeName ?? '';

    summaryRows.push({
      resident: inv.customerName,
      booking: booking?.bookingCode,
      room: inv.roomNumber,
      bed: inv.bedCode,
      pg: inv.pgName,
      billingMonth: inv.billingMonth,
      invoice: inv.invoiceNumber,
      generatedRent: paise(inv.rentPaise),
      expectedRent: paise(expectedRentPaise),
      rentSource: resolved.source,
      profileRent: profile?.rentAmountPaise ? paise(profile.rentAmountPaise) : 'n/a',
      bedPriceRent: bedPrice ? paise(bedPrice.monthlyRatePaise) : 'n/a',
      revisionRent: revision ? paise(revision.newRentPaise) : 'n/a',
      revisionOldRent: revision ? paise(revision.oldRentPaise) : 'n/a',
      depositRequired: paise(booking?.depositPaise ?? 0),
      depositCollected: paise(depositCollected),
      depositDue: paise(booking?.depositDuePaise ?? 0),
      depositStatus: booking?.depositCollectionStatus,
      depositOnUnifiedInvoice: depositOnInvoice > 0 ? paise(depositOnInvoice) : 'none',
      roomSharingCapacity,
      roomTypeLabel,
      activeOccupants: activeOccupants.length,
      occupantNames: activeOccupants.map((o) => o.customer_name).join(', '),
      privateRoom: roomConfig?.billingMode === 'private_room',
    });

    if (expectedRentPaise !== inv.rentPaise) {
      discrepancies.push({
        category: 'rent',
        resident: inv.customerName,
        bookingCode: booking?.bookingCode ?? '',
        bookingId: inv.bookingId,
        room: inv.roomNumber,
        bed: inv.bedCode,
        pg: inv.pgName,
        billingMonth: inv.billingMonth,
        invoiceNumber: inv.invoiceNumber,
        expected: paise(expectedRentPaise),
        generated: paise(inv.rentPaise),
        reason: `SSOT resolveMonthlyRentPaiseForBooking (${resolved.source}) differs from rent_invoices.rent_paise`,
        codePath:
          'evaluateAnniversaryRentGenerationEligibility → resolveMonthlyRentPaiseForBooking → rent_invoices.rent_paise',
        dbFields:
          'bed_prices.monthly_rate_paise, resident_billing_profiles.rent_amount_paise, bookings.pricing_snapshot, pg_price_revisions',
        fixRequired:
          'Investigate whether invoice was generated before price revision sync, or profile/snapshot stale vs bed_price',
      });
    }

    if (depositOnInvoice > 0 || depositOutstandingOnInvoice > 0) {
      discrepancies.push({
        category: 'deposit',
        resident: inv.customerName,
        bookingCode: booking?.bookingCode ?? '',
        bookingId: inv.bookingId,
        room: inv.roomNumber,
        bed: inv.bedCode,
        pg: inv.pgName,
        billingMonth: inv.billingMonth,
        invoiceNumber: inv.invoiceNumber,
        expected: '₹0 deposit on monthly rent invoice',
        generated: `depositPaise=${paise(depositOnInvoice)} outstanding=${paise(depositOutstandingOnInvoice)}`,
        reason: `Monthly rent syncRentInvoiceToUnified should be rent-only; deposit appears on financial_invoices.breakdown`,
        codePath: 'syncRentInvoiceToUnified OR enrichExpressWalkInUnifiedBreakdown OR generateInvoiceFromSsot',
        dbFields:
          'financial_invoices.breakdown.depositPaise, bookings.deposit_due_paise, deposit_ledger',
        fixRequired:
          'Trace why deposit line was attached; cron rent invoices must not re-request collected deposit',
      });
    }

    if ((booking?.depositDuePaise ?? 0) > 0 && depositCollected >= (booking?.depositPaise ?? 0)) {
      discrepancies.push({
        category: 'deposit',
        resident: inv.customerName,
        bookingCode: booking?.bookingCode ?? '',
        bookingId: inv.bookingId,
        room: inv.roomNumber,
        bed: inv.bedCode,
        pg: inv.pgName,
        billingMonth: inv.billingMonth,
        invoiceNumber: inv.invoiceNumber,
        expected: 'deposit_due_paise = 0 (fully collected)',
        generated: `deposit_due_paise=${paise(booking?.depositDuePaise ?? 0)} collected=${paise(depositCollected)}`,
        reason: 'Booking shows outstanding deposit despite ledger showing full collection',
        codePath: 'bookings.deposit_due_paise not reconciled after deposit_ledger collection',
        dbFields: 'bookings.deposit_due_paise, bookings.deposit_collection_status, deposit_ledger',
        fixRequired: 'Reconcile deposit_due_paise from ledger; may cause deposit prompts in UI/overview',
      });
    }

    if (
      roomSharingCapacity != null &&
      billableSharingCount !== roomSharingCapacity &&
      roomConfig?.billingMode !== 'private_room'
    ) {
      discrepancies.push({
        category: 'sharing',
        resident: inv.customerName,
        bookingCode: booking?.bookingCode ?? '',
        bookingId: inv.bookingId,
        room: inv.roomNumber,
        bed: inv.bedCode,
        pg: inv.pgName,
        billingMonth: inv.billingMonth,
        invoiceNumber: inv.invoiceNumber,
        expected: `Active occupants on ${runDate}: ${billableSharingCount}`,
        generated: `Room active bed capacity: ${roomSharingCapacity} (room type: ${roomTypeLabel})`,
        reason:
          'Room bed capacity (active beds in inventory) differs from active confirmed residents on run date',
        codePath:
          'roomTypes.defaultCapacity / active bed count vs bed_reservations; electricity uses billable occupants',
        dbFields: 'beds.status, bed_reservations.stay_range, room_types.name',
        fixRequired:
          'Clarify display SSOT: rent uses per-bed pricing; sharing label may be room capacity not occupancy',
      });
    }

    if (profile?.rentAmountPaise && profile.rentAmountPaise !== resolved.rentPaise && resolved.source === 'bed_price') {
      discrepancies.push({
        category: 'profile',
        resident: inv.customerName,
        bookingCode: booking?.bookingCode ?? '',
        bookingId: inv.bookingId,
        room: inv.roomNumber,
        bed: inv.bedCode,
        pg: inv.pgName,
        billingMonth: inv.billingMonth,
        invoiceNumber: inv.invoiceNumber,
        expected: paise(resolved.rentPaise),
        generated: paise(profile.rentAmountPaise),
        reason: 'resident_billing_profiles.rent_amount_paise out of sync with bed_prices SSOT',
        codePath: 'syncBillingProfileRentFromSsot should run pre-generation',
        dbFields: 'resident_billing_profiles.rent_amount_paise, bed_prices.monthly_rate_paise',
        fixRequired: 'Run syncBillingProfileRentFromSsot or investigate why sync did not update profile',
      });
    }
  }

  console.log('INVOICE SUMMARY (all generated today)');
  console.log('-'.repeat(80));
  for (const row of summaryRows) {
    console.log(
      `${row.invoice} | ${row.resident} | ${row.booking} | ${row.room}-${row.bed} | ${row.pg}`,
    );
    console.log(
      `  rent: generated=${row.generatedRent} expected=${row.expectedRent} source=${row.rentSource} profile=${row.profileRent} bed_price=${row.bedPriceRent} revision=${row.revisionRent}`,
    );
    console.log(
      `  deposit: required=${row.depositRequired} collected=${row.depositCollected} due=${row.depositDue} status=${row.depositStatus} on_invoice=${row.depositOnUnifiedInvoice}`,
    );
    console.log(
      `  sharing: room_capacity=${row.roomSharingCapacity} room_type=${row.roomTypeLabel} active_occupants=${row.activeOccupants} [${row.occupantNames}] private=${row.privateRoom}`,
    );
    console.log('');
  }

  console.log('═'.repeat(80));
  console.log(`DISCREPANCIES: ${discrepancies.length}`);
  console.log('═'.repeat(80));
  if (discrepancies.length === 0) {
    console.log('No discrepancies detected against SSOT checks.');
  } else {
    for (const d of discrepancies) {
      console.log(`\n[${d.category.toUpperCase()}] ${d.resident} (${d.bookingCode}) — ${d.invoiceNumber}`);
      console.log(`  Location: ${d.pg} / Room ${d.room} / Bed ${d.bed}`);
      console.log(`  Expected: ${d.expected}`);
      console.log(`  Generated: ${d.generated}`);
      console.log(`  Reason: ${d.reason}`);
      console.log(`  Code: ${d.codePath}`);
      console.log(`  DB fields: ${d.dbFields}`);
      console.log(`  Fix: ${d.fixRequired}`);
    }
  }

  await closeDb();
}

main().catch(async (err) => {
  console.error(err);
  await closeDb();
  process.exit(1);
});
