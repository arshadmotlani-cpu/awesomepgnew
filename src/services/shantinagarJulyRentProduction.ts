/**
 * Shantinagar production run — room-scoped +1% pricing (skip 101) + July 2026 rent generation.
 */
import { and, eq, ilike, inArray, ne, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
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
} from '@/src/db/schema';
import type { PricingSnapshot } from '@/src/db/schema/bookings';
import type { AdminSession } from '@/src/lib/auth/session';
import {
  isProductionBookingFilter,
  isProductionCustomerFilter,
  isActiveResidentFilter,
} from '@/src/lib/billing/productionDataFilter';
import {
  getRoomBillingConfigForBed,
  shouldSkipPrivateRoomDuplicate,
} from '@/src/lib/billing/roomBilling';
import { paiseToInr } from '@/src/lib/format';
import { applyPgPricingAdjustment } from '@/src/services/pgInventory';
import { getPgInventory } from '@/src/services/pgInventory';
import {
  generateRentInvoicesForMonth,
  _internals as rentInvoiceInternals,
} from '@/src/services/rentInvoices';
import {
  findStaleBillingProfile,
  listStaleBillingProfilesForPg,
  resolveMonthlyRentPaiseForBooking,
  syncAllBillingProfilesForPg,
  syncBillingProfileRentFromSsot,
  syncPendingRentInvoicesFromSsot,
  type RentPricingSource,
} from '@/src/lib/billing/rentPricingSsot';
import { ensureBillingProfileForBooking } from '@/src/services/residentBillingProfiles';

export const SHANTINAGAR_PRICING_TARGET_ROOMS = [
  '102',
  '202',
  '203',
  '204',
  '301',
  '302',
] as const;

/** Rooms with negotiated / finalized catalog pricing — skip bulk +1% apply. */
export const SHANTINAGAR_PRICING_SKIP_ROOMS = ['101', '201'] as const;

export const JULY_BILLING_MONTH = '2026-07-01';

export type ShantinagarJulyRentReport = {
  roomsUpdated: string[];
  bedsUpdated: number;
  residentsBilled: Array<{
    name: string;
    room: string;
    amountPaise: number;
    invoiceNumber: string;
    pricingSource?: RentPricingSource;
  }>;
  residentsSkipped: Array<{ name: string; room: string; reason: string }>;
  duplicateInvoices: Array<{ bookingId: string; customerName: string; count: number }>;
  errors: string[];
  missingJulyInvoice: Array<{ name: string; room: string; bookingId: string }>;
  staleProfiles: Array<{
    name: string;
    room: string;
    profileRentPaise: number;
    expectedRentPaise: number;
    expectedSource: RentPricingSource;
  }>;
  complete: boolean;
};

function monthlyRentFromSnapshot(snapshot: PricingSnapshot | null): number {
  return rentInvoiceInternals.monthlyRentFromSnapshot(snapshot);
}

function plusOnePaise(base: number): number {
  return Math.round(base * 1.01);
}

async function resolveShantinagarPg(_pgSlug = 'shantinagar-awesome-pg') {
  const [pg] = await db
    .select({ id: pgs.id, name: pgs.name, slug: pgs.slug })
    .from(pgs)
    .where(ilike(pgs.name, '%shanti%'))
    .limit(1);
  return pg ?? null;
}

type BedPricingAuditRow = {
  bed_id: string;
  room_number: string;
  bed_code: string;
  current_monthly: number;
  prior_monthly: number | null;
};

async function auditBedPricing(pgId: string): Promise<BedPricingAuditRow[]> {
  const rows = (await db.execute(sql`
    SELECT DISTINCT ON (bp.bed_id)
      bp.bed_id::text AS bed_id,
      r.room_number,
      b.bed_code,
      bp.monthly_rate_paise::int AS current_monthly,
      (
        SELECT bp2.monthly_rate_paise::int
        FROM bed_prices bp2
        WHERE bp2.bed_id = bp.bed_id
          AND bp2.id <> bp.id
        ORDER BY bp2.effective_from DESC, bp2.created_at DESC
        LIMIT 1
      ) AS prior_monthly
    FROM bed_prices bp
    JOIN beds b ON b.id = bp.bed_id
    JOIN rooms r ON r.id = b.room_id
    JOIN floors f ON f.id = r.floor_id
    WHERE f.pg_id = ${pgId}::uuid
      AND (bp.effective_to IS NULL OR bp.effective_to > CURRENT_DATE)
    ORDER BY bp.bed_id, bp.effective_from DESC, bp.created_at DESC
  `)) as BedPricingAuditRow[];

  return rows;
}

function roomNeedsPricingFix(
  audit: BedPricingAuditRow[],
  roomNumber: string,
): boolean {
  const beds = audit.filter((r) => r.room_number === roomNumber);
  return beds.some((row) => {
    const prior = row.prior_monthly ?? row.current_monthly;
    if (prior <= 0) return false;
    return row.current_monthly !== plusOnePaise(prior);
  });
}

async function syncBillingProfilesFromBedPrices(
  pgId: string,
  billingMonth: string,
  dryRun: boolean,
): Promise<number> {
  if (dryRun) {
    const stale = await listStaleBillingProfilesForPg(pgId, billingMonth);
    return stale.length;
  }
  const result = await syncAllBillingProfilesForPg(pgId, billingMonth);
  return result.synced;
}

export async function listActiveShantinagarResidents(pgId: string) {
  return db
    .select({
      bookingId: bookings.id,
      customerId: customers.id,
      customerName: customers.fullName,
      roomNumber: rooms.roomNumber,
      bedCode: beds.bedCode,
      bedId: beds.id,
    })
    .from(bookings)
    .innerJoin(customers, eq(customers.id, bookings.customerId))
    .innerJoin(bedReservations, eq(bedReservations.bookingId, bookings.id))
    .innerJoin(beds, eq(beds.id, bedReservations.bedId))
    .innerJoin(rooms, eq(rooms.id, beds.roomId))
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .where(
      and(
        eq(floors.pgId, pgId),
        eq(bedReservations.status, 'active'),
        eq(bedReservations.kind, 'primary'),
        eq(bookings.status, 'confirmed'),
        isProductionBookingFilter(),
        isProductionCustomerFilter(),
        isActiveResidentFilter(),
        sql`${customers.residencyStatus} NOT IN ('vacated', 'blocked')`,
        inArray(bookings.durationMode, ['monthly', 'open_ended']),
      ),
    );
}

async function countDuplicateJulyRentInvoices(pgId: string) {
  const rows = await db
    .select({
      bookingId: rentInvoices.bookingId,
      customerName: customers.fullName,
      count: sql<number>`count(*)::int`,
    })
    .from(rentInvoices)
    .innerJoin(customers, eq(customers.id, rentInvoices.customerId))
    .where(
      and(
        eq(rentInvoices.pgId, pgId),
        eq(rentInvoices.billingMonth, JULY_BILLING_MONTH),
        eq(rentInvoices.isAdhoc, false),
        ne(rentInvoices.status, 'cancelled'),
      ),
    )
    .groupBy(rentInvoices.bookingId, customers.fullName)
    .having(sql`count(*) > 1`);

  return rows.map((r) => ({
    bookingId: r.bookingId,
    customerName: r.customerName,
    count: r.count,
  }));
}

async function ensureJulyRentInvoiceForBooking(input: {
  pgId: string;
  bookingId: string;
  customerName: string;
  log: (line: string) => void;
}): Promise<boolean> {
  await syncBillingProfileRentFromSsot(input.bookingId, JULY_BILLING_MONTH);
  const profile = await ensureBillingProfileForBooking(input.bookingId);
  if (profile && !profile.autoGenerate) {
    await db
      .update(residentBillingProfiles)
      .set({ autoGenerate: true, updatedAt: new Date() })
      .where(eq(residentBillingProfiles.bookingId, input.bookingId));
  }

  const gen = await generateRentInvoicesForMonth({
    billingMonth: JULY_BILLING_MONTH,
    pgId: input.pgId,
    bookingIds: [input.bookingId],
    forceAll: true,
    asOf: JULY_BILLING_MONTH,
    collectionDueDay: 15,
  });
  input.log(
    `  Retry ${input.customerName}: created=${gen.invoicesCreated} skipped=${gen.invoicesSkipped}`,
  );
  return gen.invoicesCreated > 0;
}

export async function runShantinagarJulyRentProduction(input: {
  session: AdminSession;
  pgSlug?: string;
  dryRun?: boolean;
  onLog?: (line: string) => void;
}): Promise<ShantinagarJulyRentReport> {
  const dryRun = input.dryRun ?? false;
  const log = input.onLog ?? ((line: string) => console.log(line));

  const report: ShantinagarJulyRentReport = {
    roomsUpdated: [],
    bedsUpdated: 0,
    residentsBilled: [],
    residentsSkipped: [],
    duplicateInvoices: [],
    errors: [],
    missingJulyInvoice: [],
    staleProfiles: [],
    complete: false,
  };

  const pg = await resolveShantinagarPg(input.pgSlug);
  if (!pg) {
    report.errors.push('Shantinagar PG not found');
    return report;
  }

  log(`=== Shantinagar pricing + July rent (${dryRun ? 'DRY RUN' : 'EXECUTE'}) ===`);
  log(`PG: ${pg.name}`);

  const inv = await getPgInventory(input.session, pg.id);
  const roomIdByNumber = new Map(inv.beds.map((b) => [b.roomNumber, b.roomId]));
  const audit = await auditBedPricing(pg.id);

  for (const roomNumber of SHANTINAGAR_PRICING_TARGET_ROOMS) {
    if ((SHANTINAGAR_PRICING_SKIP_ROOMS as readonly string[]).includes(roomNumber)) {
      log(`Room ${roomNumber}: SKIP (already updated)`);
      continue;
    }

    if (!roomNeedsPricingFix(audit, roomNumber)) {
      log(`Room ${roomNumber}: beds already at +1% — skip pricing apply`);
      continue;
    }

    const roomId = roomIdByNumber.get(roomNumber);
    if (!roomId) {
      report.errors.push(`Room ${roomNumber} not found in inventory`);
      continue;
    }

    log(`Room ${roomNumber}: applying +1% to all beds (room-scoped, not PG-wide)`);
    if (!dryRun) {
      const summary = await applyPgPricingAdjustment(input.session, {
        pgId: pg.id,
        roomId,
        tiers: ['monthly'],
        mode: 'percent',
        value: 1,
      });
      report.roomsUpdated.push(roomNumber);
      report.bedsUpdated += summary.bedsAffected;
    } else {
      const bedCount = inv.beds.filter((b) => b.roomNumber === roomNumber).length;
      report.roomsUpdated.push(`${roomNumber} (dry-run)`);
      report.bedsUpdated += bedCount;
    }
  }

  log('\n=== Sync billing profiles ===');
  const profilesSynced = await syncBillingProfilesFromBedPrices(pg.id, JULY_BILLING_MONTH, dryRun);
  log(`Profiles synced from bed_prices / room config: ${profilesSynced}`);

  const staleAfterSync = await listStaleBillingProfilesForPg(pg.id, JULY_BILLING_MONTH);
  if (!dryRun) {
    for (const stale of staleAfterSync) {
      await syncBillingProfileRentFromSsot(stale.bookingId, JULY_BILLING_MONTH);
    }
  }
  const staleRemaining = dryRun
    ? staleAfterSync
    : await listStaleBillingProfilesForPg(pg.id, JULY_BILLING_MONTH);
  for (const stale of staleRemaining) {
    report.staleProfiles.push({
      name: stale.customerName,
      room: `Room ${stale.roomNumber}`,
      profileRentPaise: stale.profileRentPaise,
      expectedRentPaise: stale.expectedRentPaise,
      expectedSource: stale.expectedSource,
    });
    if (!dryRun) {
      report.errors.push(
        `Stale profile: ${stale.customerName} (Room ${stale.roomNumber}) profile=${paiseToInr(stale.profileRentPaise)} expected=${paiseToInr(stale.expectedRentPaise)} source=${stale.expectedSource}`,
      );
    }
  }

  log('\n=== July 2026 rent generation ===');
  const activeResidents = await listActiveShantinagarResidents(pg.id);
  const byBooking = new Map<string, (typeof activeResidents)[number]>();
  for (const row of activeResidents) {
    if (!byBooking.has(row.bookingId)) byBooking.set(row.bookingId, row);
  }

  for (const resident of byBooking.values()) {
    const roomConfig = await getRoomBillingConfigForBed(resident.bedId);
    if (roomConfig?.billingMode === 'private_room') {
      const dup = await shouldSkipPrivateRoomDuplicate({
        roomId: roomConfig.roomId,
        billingMonth: JULY_BILLING_MONTH,
        bookingId: resident.bookingId,
        bedId: resident.bedId,
      });
      if (dup.skip) {
        report.residentsSkipped.push({
          name: resident.customerName,
          room: `Room ${resident.roomNumber} ${resident.bedCode}`,
          reason: dup.reason ?? 'private_room_skip',
        });
        continue;
      }
    }

    if (dryRun) {
      const resolved = await resolveMonthlyRentPaiseForBooking(
        resident.bookingId,
        JULY_BILLING_MONTH,
      );
      const stale = await findStaleBillingProfile(resident.bookingId, JULY_BILLING_MONTH, {
        customerName: resident.customerName,
        roomNumber: resident.roomNumber,
      });
      if (stale) {
        report.staleProfiles.push({
          name: stale.customerName,
          room: `Room ${stale.roomNumber}`,
          profileRentPaise: stale.profileRentPaise,
          expectedRentPaise: stale.expectedRentPaise,
          expectedSource: stale.expectedSource,
        });
      }
      report.residentsBilled.push({
        name: resident.customerName,
        room: `Room ${resident.roomNumber} ${resident.bedCode}`,
        amountPaise: resolved.rentPaise,
        invoiceNumber: `(preview · ${resolved.source})`,
        pricingSource: resolved.source,
      });
      continue;
    }
  }

  if (!dryRun && report.staleProfiles.length > 0) {
    log('BLOCKED: billing profiles still stale — fix sync before generating July rent');
    return report;
  }

  if (!dryRun) {
    const gen = await generateRentInvoicesForMonth({
      billingMonth: JULY_BILLING_MONTH,
      pgId: pg.id,
      forceAll: true,
      asOf: JULY_BILLING_MONTH,
      collectionDueDay: 15,
    });
    log(
      `Generated: ${gen.invoicesCreated} created, ${gen.invoicesSkipped} skipped (${gen.candidateBookings} candidates)`,
    );

    const julyInvoices = await db
      .select({
        bookingId: rentInvoices.bookingId,
        customerName: customers.fullName,
        roomNumber: rooms.roomNumber,
        bedCode: beds.bedCode,
        invoiceNumber: rentInvoices.invoiceNumber,
        rentPaise: rentInvoices.rentPaise,
        status: rentInvoices.status,
      })
      .from(rentInvoices)
      .innerJoin(customers, eq(customers.id, rentInvoices.customerId))
      .innerJoin(beds, eq(beds.id, rentInvoices.bedId))
      .innerJoin(rooms, eq(rooms.id, beds.roomId))
      .where(
        and(
          eq(rentInvoices.pgId, pg.id),
          eq(rentInvoices.billingMonth, JULY_BILLING_MONTH),
          eq(rentInvoices.isAdhoc, false),
          ne(rentInvoices.status, 'cancelled'),
        ),
      );

    const invoicesByBooking = new Map<string, typeof julyInvoices>();
    for (const invRow of julyInvoices) {
      const list = invoicesByBooking.get(invRow.bookingId) ?? [];
      list.push(invRow);
      invoicesByBooking.set(invRow.bookingId, list);
    }

    for (const resident of byBooking.values()) {
      const roomConfig = await getRoomBillingConfigForBed(resident.bedId);
      const isPrivateSkip =
        roomConfig?.billingMode === 'private_room' &&
        (await shouldSkipPrivateRoomDuplicate({
          roomId: roomConfig.roomId,
          billingMonth: JULY_BILLING_MONTH,
          bookingId: resident.bookingId,
          bedId: resident.bedId,
        })).skip;

      if (isPrivateSkip) continue;

      const invoices = invoicesByBooking.get(resident.bookingId) ?? [];
      if (invoices.length === 0) {
        report.missingJulyInvoice.push({
          name: resident.customerName,
          room: `Room ${resident.roomNumber}`,
          bookingId: resident.bookingId,
        });
        const created = await ensureJulyRentInvoiceForBooking({
          pgId: pg.id,
          bookingId: resident.bookingId,
          customerName: resident.customerName,
          log,
        });
        if (created) {
          const [inv] = await db
            .select({
              customerName: customers.fullName,
              roomNumber: rooms.roomNumber,
              bedCode: beds.bedCode,
              invoiceNumber: rentInvoices.invoiceNumber,
              rentPaise: rentInvoices.rentPaise,
            })
            .from(rentInvoices)
            .innerJoin(customers, eq(customers.id, rentInvoices.customerId))
            .innerJoin(beds, eq(beds.id, rentInvoices.bedId))
            .innerJoin(rooms, eq(rooms.id, beds.roomId))
            .where(
              and(
                eq(rentInvoices.bookingId, resident.bookingId),
                eq(rentInvoices.billingMonth, JULY_BILLING_MONTH),
                eq(rentInvoices.isAdhoc, false),
                ne(rentInvoices.status, 'cancelled'),
              ),
            )
            .limit(1);
          if (inv) {
            report.missingJulyInvoice.pop();
            const resolved = await resolveMonthlyRentPaiseForBooking(
              resident.bookingId,
              JULY_BILLING_MONTH,
            );
            report.residentsBilled.push({
              name: inv.customerName,
              room: `Room ${inv.roomNumber} ${inv.bedCode}`,
              amountPaise: inv.rentPaise,
              invoiceNumber: inv.invoiceNumber,
              pricingSource: resolved.source,
            });
          }
        }
        continue;
      }
      if (invoices.length === 1) {
        const inv = invoices[0]!;
        const resolved = await resolveMonthlyRentPaiseForBooking(
          resident.bookingId,
          JULY_BILLING_MONTH,
        );
        if (inv.rentPaise !== resolved.rentPaise) {
          const synced = await syncPendingRentInvoicesFromSsot(
            resident.bookingId,
            JULY_BILLING_MONTH,
          );
          if (synced.updated > 0) {
            const fixed = synced.changes[0];
            report.residentsBilled.push({
              name: inv.customerName,
              room: `Room ${inv.roomNumber} ${inv.bedCode}`,
              amountPaise: fixed?.toPaise ?? resolved.rentPaise,
              invoiceNumber: inv.invoiceNumber,
              pricingSource: resolved.source,
            });
            continue;
          }
          report.errors.push(
            `Wrong invoice amount: ${inv.customerName} invoice=${paiseToInr(inv.rentPaise)} expected=${paiseToInr(resolved.rentPaise)} source=${resolved.source}`,
          );
        }
        report.residentsBilled.push({
          name: inv.customerName,
          room: `Room ${inv.roomNumber} ${inv.bedCode}`,
          amountPaise: inv.rentPaise,
          invoiceNumber: inv.invoiceNumber,
          pricingSource: resolved.source,
        });
      }
    }
  }

  report.duplicateInvoices = await countDuplicateJulyRentInvoices(pg.id);

  report.complete =
    report.errors.length === 0 &&
    report.missingJulyInvoice.length === 0 &&
    report.duplicateInvoices.length === 0 &&
    report.staleProfiles.length === 0 &&
    (dryRun ? report.residentsBilled.length > 0 : true);

  return report;
}

export function formatShantinagarJulyRentReport(report: ShantinagarJulyRentReport): string {
  const lines: string[] = [];
  lines.push('Rooms updated:');
  for (const r of report.roomsUpdated) lines.push(`  · ${r}`);
  lines.push(`Beds updated: ${report.bedsUpdated}`);
  lines.push('\nResidents billed:');
  for (const r of report.residentsBilled) {
    const source = r.pricingSource ? ` · ${r.pricingSource}` : '';
    lines.push(`  · ${r.name} (${r.room}): ${paiseToInr(r.amountPaise)} — ${r.invoiceNumber}${source}`);
  }
  if (report.staleProfiles.length > 0) {
    lines.push('\nStale billing profiles:');
    for (const s of report.staleProfiles) {
      lines.push(
        `  · ${s.name} (${s.room}): profile=${paiseToInr(s.profileRentPaise)} expected=${paiseToInr(s.expectedRentPaise)} source=${s.expectedSource}`,
      );
    }
  }
  lines.push('\nResidents skipped:');
  if (report.residentsSkipped.length === 0) lines.push('  (none)');
  for (const r of report.residentsSkipped) {
    lines.push(`  · ${r.name} (${r.room}): ${r.reason}`);
  }
  lines.push('\nDuplicate invoices:');
  if (report.duplicateInvoices.length === 0) lines.push('  (none)');
  for (const d of report.duplicateInvoices) {
    lines.push(`  · ${d.customerName}: ${d.count} invoices`);
  }
  lines.push('\nErrors:');
  if (report.errors.length === 0) lines.push('  (none)');
  for (const e of report.errors) lines.push(`  · ${e}`);
  if (report.missingJulyInvoice.length > 0) {
    lines.push('\nMissing July invoice:');
    for (const m of report.missingJulyInvoice) {
      lines.push(`  · ${m.name} (${m.room})`);
    }
  }
  lines.push(`\n${report.complete ? '✓ JULY RENT GENERATION COMPLETE' : '✗ JULY RENT GENERATION INCOMPLETE'}`);
  return lines.join('\n');
}
