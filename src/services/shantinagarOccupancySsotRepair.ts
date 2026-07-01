/**
 * Shantinagar occupancy SSOT repair — room-by-room occupancy truth, then billing regeneration.
 *
 * Order: fix occupancy → regenerate affected June electricity → July rent for active residents only.
 */
import { and, eq, ilike, inArray, isNull, ne, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  bedReservations,
  beds,
  bookings,
  checkoutSettlements,
  customers,
  electricityBills,
  electricityInvoices,
  floors,
  pgs,
  rentInvoices,
  residentBillingProfiles,
  rooms,
  vacatingRequests,
} from '@/src/db/schema';
import type { AdminSession } from '@/src/lib/auth/session';
import { DEFAULT_ELECTRICITY_RATE_PER_UNIT_PAISE } from '@/src/lib/billing/constants';
import { paiseToInr } from '@/src/lib/format';
import { todayString } from '@/src/lib/dates';
import { reconcileBookingOccupancy } from '@/src/lib/occupancySync';
import {
  ROOM_SPECS,
  type RoomContext,
  type RoomSpec,
} from '@/src/services/generateJune2026ElectricityBills';
import {
  cancelElectricityInvoicesForBooking,
  createElectricityBill,
  voidRoomElectricityBillsForMonth,
} from '@/src/services/electricityBilling';
import { auditOccupancyMismatches, rebuildOccupancyState } from '@/src/services/occupancyDiagnostics';
import { countActiveElectricityInvoiceDuplicates } from '@/src/services/electricityInvoiceDuplicates';
import { runGhostBookingAudit } from '@/src/services/ghostBookingAudit';
import { syncActionItems } from '@/src/services/actionItems';
import { cancelFutureRentInvoices } from '@/src/services/rentInvoices';
import {
  formatShantinagarJulyRentReport,
  runShantinagarJulyRentProduction,
} from '@/src/services/shantinagarJulyRentProduction';
import { repairMisassignedElectricityInvoices } from '@/src/services/electricityInvoiceOwnership';
import { listCheckoutElectricityLedgerForRoomMonth } from '@/src/services/electricitySettlementLedger';
import { resolveMonthlyRentPaiseForBooking } from '@/src/lib/billing/rentPricingSsot';
import {
  getRoomBillingConfigForBed,
  shouldSkipPrivateRoomDuplicate,
} from '@/src/lib/billing/roomBilling';

const JUNE_MONTH = '2026-06-01';
const JULY_MONTH = '2026-07-01';
const RATE_PAISE = DEFAULT_ELECTRICITY_RATE_PER_UNIT_PAISE;
const ROOM_203_EXPECTED_RESIDENT_PAISE_MIN = 118_000;
const ROOM_203_EXPECTED_RESIDENT_PAISE_MAX = 122_000;
const NEGOTIATED_RENT_PAISE = 721_140; // ₹7,211.40 — rooms 101 & 201 private

export type RoomOccupancySpec = {
  roomNumber: string;
  /** Empty = room must have no active occupants. */
  allowedNamePatterns: string[];
  /** Skip occupancy mutations (e.g. room 302). */
  skipOccupancyRepair?: boolean;
  /** Skip allowed/vacant certification (room unchanged). */
  skipOccupancyCert?: boolean;
  /** Void June electricity; do not regenerate (empty room). */
  voidElectricityOnly?: boolean;
  /** Regenerate June electricity after occupancy fix. */
  regenerateJuneElectricity?: boolean;
  /** Fixed June invoice amounts by resident name pattern (room 202). */
  fixedJuneInvoiceAmounts?: Array<{ namePattern: string; amountPaise: number }>;
};

export const SHANTINAGAR_OCCUPANCY_SPECS: RoomOccupancySpec[] = [
  {
    roomNumber: '101',
    allowedNamePatterns: ['laxminarayana', 'laxmi'],
    regenerateJuneElectricity: true,
  },
  {
    roomNumber: '102',
    allowedNamePatterns: [],
    voidElectricityOnly: true,
    regenerateJuneElectricity: false,
  },
  {
    roomNumber: '201',
    allowedNamePatterns: ['dhairya'],
    regenerateJuneElectricity: true,
  },
  {
    roomNumber: '202',
    allowedNamePatterns: ['angatra', 'anuj', 'ishan'],
    regenerateJuneElectricity: true,
    fixedJuneInvoiceAmounts: [
      { namePattern: 'angatra', amountPaise: 82_700 },
      { namePattern: 'anuj', amountPaise: 82_700 },
      { namePattern: 'ishan', amountPaise: 82_600 },
    ],
  },
  {
    roomNumber: '203',
    allowedNamePatterns: ['krishna', 'vijay', 'waqar'],
    regenerateJuneElectricity: true,
  },
  {
    roomNumber: '204',
    allowedNamePatterns: ['rishik'],
    regenerateJuneElectricity: true,
  },
  {
    roomNumber: '301',
    allowedNamePatterns: [],
    voidElectricityOnly: true,
    regenerateJuneElectricity: false,
  },
  {
    roomNumber: '302',
    allowedNamePatterns: [],
    skipOccupancyRepair: true,
    skipOccupancyCert: true,
    regenerateJuneElectricity: false,
  },
];

export type ShantinagarOccupancySsotReport = {
  occupancyActions: string[];
  electricityActions: string[];
  rentActions: string[];
  certification: {
    activeResidents: Array<{ name: string; room: string; bed: string }>;
    roomOccupancy: Array<{ room: string; occupants: string[]; vacant: boolean }>;
    room203: {
      totalRoomBillPaise: number;
      checkoutCollectedPaise: number;
      remainingBillPaise: number;
      residents: Array<{
        name: string;
        amountPaise: number;
        invoiceNumber: string | null;
        status: string | null;
      }>;
      invalidInvoices: string[];
      pass: boolean;
    } | null;
    julyRentByResident: Array<{
      name: string;
      room: string;
      bed: string;
      rentPaise: number | null;
      invoiceNumber: string | null;
      status: string | null;
      issue: 'ok' | 'missing' | 'duplicate' | 'wrong_amount' | 'skipped_private_room';
    }>;
    julyRentInvoices: string[];
    juneElectricityInvoices: Array<{ room: string; name: string; amountPaise: number; invoiceNumber: string }>;
    operationsQueueCount: number;
    duplicateInvoiceCount: number;
    julyRentDuplicateCount: number;
    orphanResidentCount: number;
    occupancyMismatchCount: number;
    pass: boolean;
  };
  errors: string[];
};

function nameMatches(fullName: string, patterns: string[]): boolean {
  const lower = fullName.toLowerCase();
  if (patterns.length === 0) return false;
  return patterns.some((p) => lower.includes(p.toLowerCase()));
}

function logLine(lines: string[], msg: string, onLog?: (line: string) => void) {
  lines.push(msg);
  onLog?.(msg);
}

async function resolveShantinagarPg() {
  const [pg] = await db
    .select({ id: pgs.id, name: pgs.name })
    .from(pgs)
    .where(ilike(pgs.name, '%shanti%'))
    .limit(1);
  return pg ?? null;
}

async function resolveRoom(pgId: string, roomNumber: string) {
  const [row] = await db
    .select({ roomId: rooms.id, roomNumber: rooms.roomNumber, pgName: pgs.name })
    .from(rooms)
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .innerJoin(pgs, eq(pgs.id, floors.pgId))
    .where(
      and(
        eq(floors.pgId, pgId),
        eq(rooms.roomNumber, roomNumber),
        isNull(rooms.archivedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

type RoomBookingRow = {
  bookingId: string;
  bookingCode: string;
  bookingStatus: string;
  customerId: string;
  customerName: string;
  bedId: string;
  bedCode: string;
  reservationId: string;
  reservationStatus: string;
};

async function listBookingsInRoom(roomId: string): Promise<RoomBookingRow[]> {
  return db
    .select({
      bookingId: bookings.id,
      bookingCode: bookings.bookingCode,
      bookingStatus: bookings.status,
      customerId: customers.id,
      customerName: customers.fullName,
      bedId: beds.id,
      bedCode: beds.bedCode,
      reservationId: bedReservations.id,
      reservationStatus: bedReservations.status,
    })
    .from(bedReservations)
    .innerJoin(bookings, eq(bookings.id, bedReservations.bookingId))
    .innerJoin(customers, eq(customers.id, bookings.customerId))
    .innerJoin(beds, eq(beds.id, bedReservations.bedId))
    .where(
      and(
        eq(beds.roomId, roomId),
        eq(bedReservations.kind, 'primary'),
        inArray(bedReservations.status, ['active', 'hold', 'completed']),
        inArray(bookings.status, ['confirmed', 'completed', 'pending_payment', 'pending_approval']),
        eq(bookings.isTest, false),
        eq(customers.isTest, false),
      ),
    );
}

async function listActiveSsotOccupants(pgId: string) {
  return db
    .select({
      customerId: customers.id,
      customerName: customers.fullName,
      roomNumber: rooms.roomNumber,
      bedCode: beds.bedCode,
      bedId: beds.id,
      bookingId: bookings.id,
      bookingCode: bookings.bookingCode,
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
        eq(bookings.status, 'confirmed'),
        eq(bedReservations.status, 'active'),
        eq(bedReservations.kind, 'primary'),
        sql`CURRENT_DATE <@ ${bedReservations.stayRange}`,
        eq(bookings.isTest, false),
        eq(customers.isTest, false),
        sql`${customers.residencyStatus} NOT IN ('vacated', 'blocked')`,
        inArray(bookings.durationMode, ['monthly', 'open_ended']),
      ),
    );
}

async function cancelPendingRentForBooking(bookingId: string, reason: string, dryRun: boolean) {
  if (dryRun) return;
  await cancelFutureRentInvoices(bookingId, reason);
  await db
    .update(rentInvoices)
    .set({ status: 'cancelled', updatedAt: new Date() })
    .where(
      and(
        eq(rentInvoices.bookingId, bookingId),
        eq(rentInvoices.status, 'pending'),
      ),
    );
}

async function forceCloseBookingOccupancy(input: {
  bookingId: string;
  customerId: string;
  endDate: string;
  adminId: string;
  reason: string;
  dryRun: boolean;
}): Promise<void> {
  if (input.dryRun) return;

  await db.execute(sql`
    UPDATE bed_reservations
    SET
      stay_range = daterange(lower(stay_range), ${input.endDate}::date, '[)'),
      status = 'completed',
      updated_at = now()
    WHERE booking_id = ${input.bookingId}::uuid
      AND kind = 'primary'
      AND status IN ('active', 'hold', 'completed')
  `);

  await db
    .update(bookings)
    .set({ status: 'completed', updatedAt: new Date() })
    .where(eq(bookings.id, input.bookingId));

  await db
    .update(customers)
    .set({ residencyStatus: 'vacated', updatedAt: new Date() })
    .where(eq(customers.id, input.customerId));

  await db
    .update(residentBillingProfiles)
    .set({ autoGenerate: false, updatedAt: new Date() })
    .where(eq(residentBillingProfiles.bookingId, input.bookingId));

  await cancelPendingRentForBooking(input.bookingId, input.reason, false);
  await cancelElectricityInvoicesForBooking(input.bookingId);
  await reconcileBookingOccupancy(input.bookingId);
}

async function forceDepartGlobalInvalidResidents(input: {
  pgId: string;
  adminId: string;
  dryRun: boolean;
  log: string[];
  onLog?: (line: string) => void;
}): Promise<void> {
  const rows = await db
    .select({
      bookingId: bookings.id,
      bookingCode: bookings.bookingCode,
      customerId: customers.id,
      customerName: customers.fullName,
      roomNumber: rooms.roomNumber,
    })
    .from(bookings)
    .innerJoin(customers, eq(customers.id, bookings.customerId))
    .innerJoin(bedReservations, eq(bedReservations.bookingId, bookings.id))
    .innerJoin(beds, eq(beds.id, bedReservations.bedId))
    .innerJoin(rooms, eq(rooms.id, beds.roomId))
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .where(
      and(
        eq(floors.pgId, input.pgId),
        eq(bookings.status, 'confirmed'),
        inArray(bedReservations.status, ['active', 'hold']),
        sql`(
          ${customers.fullName} ILIKE '%harshad%'
          OR ${customers.fullName} ILIKE '%harish%'
        )`,
      ),
    );

  for (const row of rows) {
    logLine(
      input.log,
      `Global depart — ${row.customerName} (${row.bookingCode}) room ${row.roomNumber}`,
      input.onLog,
    );
    await forceCloseBookingOccupancy({
      bookingId: row.bookingId,
      customerId: row.customerId,
      endDate: todayString(),
      adminId: input.adminId,
      reason: 'Shantinagar SSOT — departed resident must not remain billable',
      dryRun: input.dryRun,
    });
  }
}

async function completeOfflineSettledCheckout(input: {
  bookingId: string;
  customerId: string;
  adminId: string;
  refundPaise: number;
  dryRun: boolean;
}): Promise<void> {
  const today = todayString();
  if (input.dryRun) return;

  await cancelPendingRentForBooking(input.bookingId, 'Room 301 offline settlement closure', false);
  await cancelElectricityInvoicesForBooking(input.bookingId);

  await db.execute(sql`
    UPDATE bed_reservations
    SET
      stay_range = daterange(lower(stay_range), ${today}::date, '[)'),
      status = 'completed',
      updated_at = now()
    WHERE booking_id = ${input.bookingId}::uuid
      AND kind = 'primary'
  `);

  await db
    .update(bookings)
    .set({
      status: 'completed',
      adminDepositRefundStatus: 'refunded',
      updatedAt: new Date(),
    })
    .where(eq(bookings.id, input.bookingId));

  await db
    .update(customers)
    .set({ residencyStatus: 'vacated', updatedAt: new Date() })
    .where(eq(customers.id, input.customerId));

  await db
    .update(residentBillingProfiles)
    .set({ autoGenerate: false, updatedAt: new Date() })
    .where(eq(residentBillingProfiles.bookingId, input.bookingId));

  await db
    .update(vacatingRequests)
    .set({
      status: 'completed',
      depositRefundPaise: input.refundPaise,
      resolvedAt: new Date(),
      resolvedByAdminId: input.adminId,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(vacatingRequests.bookingId, input.bookingId),
        inArray(vacatingRequests.status, ['pending', 'approved']),
      ),
    );

  const [settlement] = await db
    .select({ id: checkoutSettlements.id })
    .from(checkoutSettlements)
    .where(eq(checkoutSettlements.bookingId, input.bookingId))
    .limit(1);

  if (settlement) {
    await db
      .update(checkoutSettlements)
      .set({
        status: 'completed',
        finalRefundPaise: input.refundPaise,
        refundMethod: 'offline',
        refundReference: 'offline-settled-shantinagar-301',
        refundNotes: 'Deposit refunded offline — occupancy SSOT repair (no ledger adjustment)',
        refundPaidAt: new Date(),
        refundPaidByAdminId: input.adminId,
        approvedAt: new Date(),
        approvedByAdminId: input.adminId,
        amountsLocked: true,
        updatedAt: new Date(),
      })
      .where(eq(checkoutSettlements.id, settlement.id));
  }

  await reconcileBookingOccupancy(input.bookingId);
}

async function cancelUpcomingReservationsInRoom(roomId: string, adminId: string, dryRun: boolean) {
  const rows = await db
    .select({
      bookingId: bookings.id,
      bookingCode: bookings.bookingCode,
      customerName: customers.fullName,
    })
    .from(bedReservations)
    .innerJoin(bookings, eq(bookings.id, bedReservations.bookingId))
    .innerJoin(customers, eq(customers.id, bookings.customerId))
    .innerJoin(beds, eq(beds.id, bedReservations.bedId))
    .where(
      and(
        eq(beds.roomId, roomId),
        eq(bedReservations.kind, 'primary'),
        inArray(bedReservations.status, ['active', 'hold']),
        inArray(bookings.status, ['confirmed', 'pending_payment', 'pending_approval']),
        sql`lower(${bedReservations.stayRange}) > CURRENT_DATE`,
      ),
    );

  const { cancelBooking } = await import('@/src/services/bookingLifecycle');
  for (const row of rows) {
    if (dryRun) continue;
    await cancelBooking({
      bookingCode: row.bookingCode,
      reason: '[occupancy SSOT] Cancelled upcoming reservation — resident not moving in',
      actor: { kind: 'admin', adminId },
    });
  }
  return rows.map((r) => `${r.customerName} (${r.bookingCode})`);
}

async function repairRoomOccupancy(input: {
  pgId: string;
  spec: RoomOccupancySpec;
  adminId: string;
  dryRun: boolean;
  log: string[];
  onLog?: (line: string) => void;
}): Promise<void> {
  const room = await resolveRoom(input.pgId, input.spec.roomNumber);
  if (!room) {
    logLine(input.log, `Room ${input.spec.roomNumber}: NOT FOUND`, input.onLog);
    return;
  }

  if (input.spec.skipOccupancyRepair) {
    logLine(input.log, `Room ${input.spec.roomNumber}: skip (no occupancy changes)`, input.onLog);
    return;
  }

  if (input.spec.roomNumber === '301') {
    const bookings = await listBookingsInRoom(room.roomId);
    const activeOrConfirmed = bookings.filter((b) =>
      ['confirmed', 'pending_payment'].includes(b.bookingStatus),
    );
    for (const row of activeOrConfirmed) {
      logLine(
        input.log,
        `Room 301 — offline close ${row.customerName} (${row.bookingCode})`,
        input.onLog,
      );
      await completeOfflineSettledCheckout({
        bookingId: row.bookingId,
        customerId: row.customerId,
        adminId: input.adminId,
        refundPaise: 250_000,
        dryRun: input.dryRun,
      });
    }
    const cancelled = await cancelUpcomingReservationsInRoom(
      room.roomId,
      input.adminId,
      input.dryRun,
    );
    for (const c of cancelled) {
      logLine(input.log, `Room 301 — cancelled upcoming reservation: ${c}`, input.onLog);
    }
    return;
  }

  const bookings = await listBookingsInRoom(room.roomId);
  const seenBookingIds = new Set<string>();

  for (const row of bookings) {
    if (seenBookingIds.has(row.bookingId)) continue;
    seenBookingIds.add(row.bookingId);

    const allowed = nameMatches(row.customerName, input.spec.allowedNamePatterns);
    const isActiveBooking = row.bookingStatus === 'confirmed' || row.reservationStatus === 'active';

    if (input.spec.allowedNamePatterns.length === 0) {
      if (!isActiveBooking && row.bookingStatus === 'completed') continue;
      logLine(
        input.log,
        `Room ${input.spec.roomNumber} — remove ${row.customerName} (${row.bookingCode})`,
        input.onLog,
      );
      await forceCloseBookingOccupancy({
        bookingId: row.bookingId,
        customerId: row.customerId,
        endDate: todayString(),
        adminId: input.adminId,
        reason: `Room ${input.spec.roomNumber} occupancy SSOT — room must be empty`,
        dryRun: input.dryRun,
      });
      continue;
    }

    if (!allowed && (isActiveBooking || row.bookingStatus === 'confirmed')) {
      logLine(
        input.log,
        `Room ${input.spec.roomNumber} — remove invalid occupant ${row.customerName} (${row.bookingCode})`,
        input.onLog,
      );
      await forceCloseBookingOccupancy({
        bookingId: row.bookingId,
        customerId: row.customerId,
        endDate: todayString(),
        adminId: input.adminId,
        reason: `Room ${input.spec.roomNumber} occupancy SSOT — not an allowed resident`,
        dryRun: input.dryRun,
      });
    }
  }
}

function roomSpecForNumber(roomNumber: string): RoomSpec | undefined {
  return ROOM_SPECS.find((s) => s.roomNumber === roomNumber);
}

async function applyFixedJuneInvoiceAmounts(input: {
  roomId: string;
  billingMonth: string;
  fixed: Array<{ namePattern: string; amountPaise: number }>;
  dryRun: boolean;
}): Promise<string[]> {
  const actions: string[] = [];
  const invoices = await db
    .select({
      invoiceId: electricityInvoices.id,
      invoiceNumber: electricityInvoices.invoiceNumber,
      amountPaise: electricityInvoices.amountPaise,
      customerName: customers.fullName,
      status: electricityInvoices.status,
    })
    .from(electricityInvoices)
    .innerJoin(electricityBills, eq(electricityBills.id, electricityInvoices.electricityBillId))
    .innerJoin(customers, eq(customers.id, electricityInvoices.customerId))
    .where(
      and(
        eq(electricityBills.roomId, input.roomId),
        eq(electricityBills.billingMonth, input.billingMonth),
        ne(electricityInvoices.status, 'cancelled'),
      ),
    );

  for (const inv of invoices) {
    const match = input.fixed.find((f) =>
      inv.customerName.toLowerCase().includes(f.namePattern.toLowerCase()),
    );
    if (!match || inv.amountPaise === match.amountPaise) continue;
    actions.push(
      `${inv.customerName}: ${paiseToInr(inv.amountPaise)} → ${paiseToInr(match.amountPaise)} (${inv.invoiceNumber})`,
    );
    if (!input.dryRun) {
      await db
        .update(electricityInvoices)
        .set({ amountPaise: match.amountPaise, updatedAt: new Date() })
        .where(eq(electricityInvoices.id, inv.invoiceId));
      const { syncElectricityInvoiceToUnified } = await import('@/src/services/unifiedInvoices');
      await syncElectricityInvoiceToUnified(inv.invoiceId).catch(() => undefined);
    }
  }
  return actions;
}

async function regenerateJuneElectricityForRoom(input: {
  roomNumber: string;
  spec: RoomOccupancySpec;
  dryRun: boolean;
  log: string[];
  onLog?: (line: string) => void;
}): Promise<void> {
  const pg = await resolveShantinagarPg();
  if (!pg) return;
  const room = await resolveRoom(pg.id, input.roomNumber);
  if (!room) return;

  if (input.spec.voidElectricityOnly) {
    logLine(
      input.log,
      `Room ${input.roomNumber} — void June electricity (empty room)`,
      input.onLog,
    );
    if (!input.dryRun) {
      await voidRoomElectricityBillsForMonth(room.roomId, JUNE_MONTH);
    }
    return;
  }

  if (!input.spec.regenerateJuneElectricity) return;

  const meterSpec = roomSpecForNumber(input.roomNumber);
  if (!meterSpec) {
    logLine(input.log, `Room ${input.roomNumber} — no meter spec; skip electricity`, input.onLog);
    return;
  }

  logLine(input.log, `Room ${input.roomNumber} — regenerate June electricity`, input.onLog);
  if (input.dryRun) return;

  const ctx: RoomContext = {
    roomId: room.roomId,
    roomNumber: input.roomNumber,
    pgName: room.pgName,
    billingMonth: JUNE_MONTH,
    dryRun: false,
  };
  if (meterSpec.prepare) await meterSpec.prepare(ctx);
  await voidRoomElectricityBillsForMonth(room.roomId, JUNE_MONTH);
  const result = await createElectricityBill({
    roomId: room.roomId,
    billingMonth: JUNE_MONTH,
    previousReadingUnits: meterSpec.previousReadingUnits,
    currentReadingUnits: meterSpec.currentReadingUnits,
    ratePerUnitPaise: RATE_PAISE,
    useProRataByActiveDays: true,
    includeFixedStayOccupants: true,
    notes: 'Shantinagar occupancy SSOT repair — June 2026',
  });
  if (!result.ok && result.kind !== 'already_exists') {
    throw new Error(`Room ${input.roomNumber} electricity failed: ${result.kind}`);
  }

  if (input.spec.fixedJuneInvoiceAmounts?.length) {
    const fixes = await applyFixedJuneInvoiceAmounts({
      roomId: room.roomId,
      billingMonth: JUNE_MONTH,
      fixed: input.spec.fixedJuneInvoiceAmounts,
      dryRun: false,
    });
    for (const fix of fixes) {
      logLine(input.log, `Room ${input.roomNumber} — fixed invoice: ${fix}`, input.onLog);
    }
  }
}

async function buildRoom203Certification(
  pgId: string,
): Promise<NonNullable<ShantinagarOccupancySsotReport['certification']['room203']>> {
  const room = await resolveRoom(pgId, '203');
  const meterSpec = roomSpecForNumber('203');
  const grossFromMeter =
    meterSpec != null
      ? Math.round((meterSpec.currentReadingUnits - meterSpec.previousReadingUnits) * RATE_PAISE)
      : 0;

  let totalRoomBillPaise = grossFromMeter;
  let checkoutCollectedPaise = 0;

  if (room) {
    const checkoutRows = await listCheckoutElectricityLedgerForRoomMonth(room.roomId, JUNE_MONTH, {
      status: 'collected',
    });
    checkoutCollectedPaise = checkoutRows.reduce((sum, row) => sum + row.amountPaise, 0);

    const [bill] = await db
      .select({
        totalPaise: electricityBills.totalPaise,
        checkoutCreditAppliedPaise: electricityBills.checkoutCreditAppliedPaise,
      })
      .from(electricityBills)
      .where(
        and(
          eq(electricityBills.roomId, room.roomId),
          eq(electricityBills.billingMonth, JUNE_MONTH),
          eq(electricityBills.isPipelineTest, false),
        ),
      )
      .limit(1);
    if (bill) {
      totalRoomBillPaise = bill.totalPaise;
      if (bill.checkoutCreditAppliedPaise > 0) {
        checkoutCollectedPaise = Math.max(checkoutCollectedPaise, bill.checkoutCreditAppliedPaise);
      }
    }
  }

  const remainingBillPaise = Math.max(0, totalRoomBillPaise - checkoutCollectedPaise);

  const room203Invoices = await db
    .select({
      customerName: customers.fullName,
      amountPaise: electricityInvoices.amountPaise,
      invoiceNumber: electricityInvoices.invoiceNumber,
      status: electricityInvoices.status,
    })
    .from(electricityInvoices)
    .innerJoin(electricityBills, eq(electricityBills.id, electricityInvoices.electricityBillId))
    .innerJoin(rooms, eq(rooms.id, electricityBills.roomId))
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .innerJoin(customers, eq(customers.id, electricityInvoices.customerId))
    .where(
      and(
        eq(floors.pgId, pgId),
        eq(rooms.roomNumber, '203'),
        eq(electricityBills.billingMonth, JUNE_MONTH),
        ne(electricityInvoices.status, 'cancelled'),
      ),
    );

  const allowedPatterns = ['krishna', 'vijay', 'waqar'];
  const invalidInvoices: string[] = [];
  const residents: Array<{
    name: string;
    amountPaise: number;
    invoiceNumber: string | null;
    status: string | null;
  }> = [];

  for (const pattern of allowedPatterns) {
    const match = room203Invoices.find((i) =>
      i.customerName.toLowerCase().includes(pattern),
    );
    residents.push({
      name: match?.customerName ?? pattern,
      amountPaise: match?.amountPaise ?? 0,
      invoiceNumber: match?.invoiceNumber ?? null,
      status: match?.status ?? null,
    });
    if (!match) {
      invalidInvoices.push(`Missing invoice for ${pattern}`);
    } else if (
      match.amountPaise < ROOM_203_EXPECTED_RESIDENT_PAISE_MIN ||
      match.amountPaise > ROOM_203_EXPECTED_RESIDENT_PAISE_MAX
    ) {
      invalidInvoices.push(
        `${match.customerName}: ${paiseToInr(match.amountPaise)} (expected ~₹1,200 after ₹990 adjustment)`,
      );
    }
  }

  for (const inv of room203Invoices) {
    const lower = inv.customerName.toLowerCase();
    if (lower.includes('harshad') || lower.includes('harish')) {
      invalidInvoices.push(`Invalid occupant invoice: ${inv.customerName} (${inv.invoiceNumber})`);
    }
    if (!allowedPatterns.some((p) => lower.includes(p))) {
      invalidInvoices.push(`Unexpected occupant invoice: ${inv.customerName} (${inv.invoiceNumber})`);
    }
  }

  const billableCount = residents.filter((r) => r.invoiceNumber).length;
  const pass =
    invalidInvoices.length === 0 &&
    billableCount === 3 &&
    checkoutCollectedPaise >= 99_000 &&
    residents.every(
      (r) =>
        r.amountPaise >= ROOM_203_EXPECTED_RESIDENT_PAISE_MIN &&
        r.amountPaise <= ROOM_203_EXPECTED_RESIDENT_PAISE_MAX,
    );

  return {
    totalRoomBillPaise,
    checkoutCollectedPaise,
    remainingBillPaise,
    residents,
    invalidInvoices,
    pass,
  };
}

async function buildJulyRentCertification(pgId: string) {
  const activeResidents = await listActiveSsotOccupants(pgId);
  const byBooking = new Map<string, (typeof activeResidents)[number]>();
  for (const row of activeResidents) {
    if (!byBooking.has(row.bookingId)) byBooking.set(row.bookingId, row);
  }

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
        eq(rentInvoices.pgId, pgId),
        eq(rentInvoices.billingMonth, JULY_MONTH),
        eq(rentInvoices.isAdhoc, false),
        ne(rentInvoices.status, 'cancelled'),
      ),
    );

  const invoicesByBooking = new Map<string, typeof julyInvoices>();
  for (const inv of julyInvoices) {
    const list = invoicesByBooking.get(inv.bookingId) ?? [];
    list.push(inv);
    invoicesByBooking.set(inv.bookingId, list);
  }

  const julyRentByResident: ShantinagarOccupancySsotReport['certification']['julyRentByResident'] =
    [];

  for (const resident of byBooking.values()) {
    const roomConfig = await getRoomBillingConfigForBed(resident.bedId);
    const isPrivateSkip =
      roomConfig?.billingMode === 'private_room' &&
      (
        await shouldSkipPrivateRoomDuplicate({
          roomId: roomConfig.roomId,
          billingMonth: JULY_MONTH,
          bookingId: resident.bookingId,
          bedId: resident.bedId,
        })
      ).skip;

    if (isPrivateSkip) {
      julyRentByResident.push({
        name: resident.customerName,
        room: resident.roomNumber,
        bed: resident.bedCode,
        rentPaise: null,
        invoiceNumber: null,
        status: null,
        issue: 'skipped_private_room',
      });
      continue;
    }

    const invoices = invoicesByBooking.get(resident.bookingId) ?? [];
    if (invoices.length === 0) {
      julyRentByResident.push({
        name: resident.customerName,
        room: resident.roomNumber,
        bed: resident.bedCode,
        rentPaise: null,
        invoiceNumber: null,
        status: null,
        issue: 'missing',
      });
      continue;
    }
    if (invoices.length > 1) {
      julyRentByResident.push({
        name: resident.customerName,
        room: resident.roomNumber,
        bed: resident.bedCode,
        rentPaise: invoices[0]!.rentPaise,
        invoiceNumber: invoices.map((i) => i.invoiceNumber).join(', '),
        status: invoices.map((i) => i.status).join(', '),
        issue: 'duplicate',
      });
      continue;
    }

    const inv = invoices[0]!;
    const resolved = await resolveMonthlyRentPaiseForBooking(
      resident.bookingId,
      JULY_MONTH,
    );
    const isNegotiatedPrivate =
      (resident.roomNumber === '101' &&
        resident.customerName.toLowerCase().includes('laxmi')) ||
      (resident.roomNumber === '201' &&
        resident.customerName.toLowerCase().includes('dhairya'));
    const expectedPaise = isNegotiatedPrivate ? NEGOTIATED_RENT_PAISE : resolved.rentPaise;
    const wrongAmount = inv.rentPaise !== expectedPaise;

    julyRentByResident.push({
      name: resident.customerName,
      room: resident.roomNumber,
      bed: resident.bedCode,
      rentPaise: inv.rentPaise,
      invoiceNumber: inv.invoiceNumber,
      status: inv.status,
      issue: wrongAmount ? 'wrong_amount' : 'ok',
    });
  }

  const julyRentDuplicateCount = [...invoicesByBooking.values()].filter(
    (list) => list.length > 1,
  ).length;

  return { julyRentByResident, julyRentDuplicateCount };
}

export async function getShantinagarOccupancyCertification(
  pgId: string,
  session: AdminSession,
): Promise<ShantinagarOccupancySsotReport['certification']> {
  return buildCertification(pgId, session);
}

async function buildCertification(pgId: string, session: AdminSession): Promise<ShantinagarOccupancySsotReport['certification']> {
  const activeResidents = await listActiveSsotOccupants(pgId);
  const roomNumbers = ['101', '102', '201', '202', '203', '204', '301', '302'];
  const roomOccupancy: ShantinagarOccupancySsotReport['certification']['roomOccupancy'] = [];

  for (const roomNumber of roomNumbers) {
    const room = await resolveRoom(pgId, roomNumber);
    if (!room) continue;
    const occupants = activeResidents
      .filter((r) => r.roomNumber === roomNumber)
      .map((r) => r.customerName);
    roomOccupancy.push({
      room: roomNumber,
      occupants,
      vacant: occupants.length === 0,
    });
  }

  const juneElectricityInvoices = await db
    .select({
      roomNumber: rooms.roomNumber,
      customerName: customers.fullName,
      amountPaise: electricityInvoices.amountPaise,
      invoiceNumber: electricityInvoices.invoiceNumber,
    })
    .from(electricityInvoices)
    .innerJoin(electricityBills, eq(electricityBills.id, electricityInvoices.electricityBillId))
    .innerJoin(rooms, eq(rooms.id, electricityBills.roomId))
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .innerJoin(customers, eq(customers.id, electricityInvoices.customerId))
    .where(
      and(
        eq(floors.pgId, pgId),
        eq(electricityBills.billingMonth, JUNE_MONTH),
        ne(electricityInvoices.status, 'cancelled'),
        inArray(rooms.roomNumber, roomNumbers),
      ),
    );

  const julyRentInvoices = await db
    .select({ invoiceNumber: rentInvoices.invoiceNumber })
    .from(rentInvoices)
    .where(
      and(
        eq(rentInvoices.pgId, pgId),
        eq(rentInvoices.billingMonth, JULY_MONTH),
        ne(rentInvoices.status, 'cancelled'),
      ),
    );

  const room203 = await buildRoom203Certification(pgId);
  const { julyRentByResident, julyRentDuplicateCount } = await buildJulyRentCertification(pgId);

  const mismatches = await auditOccupancyMismatches(session);
  const mismatchCount = mismatches.filter((m) => m.mismatch).length;
  const ghost = await runGhostBookingAudit();
  const duplicateInvoiceCount = await countActiveElectricityInvoiceDuplicates();

  const { count: opsCount } = (
    await db.execute<{ count: number }>(sql`
      SELECT count(*)::int AS count FROM action_items WHERE status = 'open'
    `)
  )[0] ?? { count: 0 };

  const invalidOccupants: string[] = [];
  for (const spec of SHANTINAGAR_OCCUPANCY_SPECS) {
    if (spec.skipOccupancyCert) continue;
    const occ = roomOccupancy.find((r) => r.room === spec.roomNumber);
    if (!occ) continue;
    if (spec.allowedNamePatterns.length === 0) {
      if (!occ.vacant) invalidOccupants.push(`Room ${spec.roomNumber} should be vacant`);
      continue;
    }
    for (const name of occ.occupants) {
      if (!nameMatches(name, spec.allowedNamePatterns)) {
        invalidOccupants.push(`${name} in room ${spec.roomNumber}`);
      }
    }
    if (spec.allowedNamePatterns.length > 0 && occ.occupants.length === 0 && spec.roomNumber !== '102') {
      // room 102 intentionally vacant
    }
  }

  const harshadInvoices = juneElectricityInvoices.filter((i) =>
    i.customerName.toLowerCase().includes('harshad'),
  );
  const harishInvoices = juneElectricityInvoices.filter((i) =>
    i.customerName.toLowerCase().includes('harish'),
  );
  const room102Invoices = juneElectricityInvoices.filter((i) => i.roomNumber === '102');

  const julyRentIssues = julyRentByResident.filter(
    (r) => r.issue !== 'ok' && r.issue !== 'skipped_private_room',
  );

  const pass =
    invalidOccupants.length === 0 &&
    harshadInvoices.length === 0 &&
    harishInvoices.length === 0 &&
    room102Invoices.length === 0 &&
    mismatchCount === 0 &&
    duplicateInvoiceCount === 0 &&
    julyRentDuplicateCount === 0 &&
    julyRentIssues.length === 0 &&
    room203.pass &&
    ghost.summary.totalIssues === 0;

  return {
    activeResidents: activeResidents.map((r) => ({
      name: r.customerName,
      room: r.roomNumber,
      bed: r.bedCode,
    })),
    roomOccupancy,
    room203,
    julyRentByResident,
    julyRentInvoices: julyRentInvoices.map((r) => r.invoiceNumber),
    juneElectricityInvoices: juneElectricityInvoices.map((i) => ({
      room: i.roomNumber,
      name: i.customerName,
      amountPaise: i.amountPaise,
      invoiceNumber: i.invoiceNumber,
    })),
    operationsQueueCount: opsCount,
    duplicateInvoiceCount,
    julyRentDuplicateCount,
    orphanResidentCount: ghost.summary.totalIssues,
    occupancyMismatchCount: mismatchCount,
    pass,
  };
}

export async function runShantinagarOccupancySsotRepair(input: {
  session: AdminSession;
  dryRun?: boolean;
  onLog?: (line: string) => void;
}): Promise<ShantinagarOccupancySsotReport> {
  const dryRun = input.dryRun ?? false;
  const log: string[] = [];
  const onLog = input.onLog;
  const report: ShantinagarOccupancySsotReport = {
    occupancyActions: log,
    electricityActions: [],
    rentActions: [],
    certification: {
      activeResidents: [],
      roomOccupancy: [],
      room203: null,
      julyRentByResident: [],
      julyRentInvoices: [],
      juneElectricityInvoices: [],
      operationsQueueCount: 0,
      duplicateInvoiceCount: 0,
      julyRentDuplicateCount: 0,
      orphanResidentCount: 0,
      occupancyMismatchCount: 0,
      pass: false,
    },
    errors: [],
  };

  const pg = await resolveShantinagarPg();
  if (!pg) {
    report.errors.push('Shantinagar PG not found');
    return report;
  }

  logLine(log, `=== Shantinagar occupancy SSOT repair (${dryRun ? 'DRY RUN' : 'EXECUTE'}) ===`, onLog);
  logLine(log, `PG: ${pg.name}`, onLog);

  // Phase 1 — global departed residents, then per-room occupancy
  logLine(log, '\n--- Phase 1: Occupancy SSOT ---', onLog);
  await forceDepartGlobalInvalidResidents({
    pgId: pg.id,
    adminId: input.session.adminId,
    dryRun,
    log,
    onLog,
  });
  for (const spec of SHANTINAGAR_OCCUPANCY_SPECS) {
    await repairRoomOccupancy({
      pgId: pg.id,
      spec,
      adminId: input.session.adminId,
      dryRun,
      log,
      onLog,
    });
  }

  if (!dryRun) {
    await rebuildOccupancyState();
    await repairMisassignedElectricityInvoices(input.session, JUNE_MONTH, {
      pgNamePattern: 'shanti',
    });
  }

  // Phase 2 — June electricity (affected rooms only)
  logLine(log, '\n--- Phase 2: June electricity (affected rooms) ---', onLog);
  for (const spec of SHANTINAGAR_OCCUPANCY_SPECS) {
    if (!spec.regenerateJuneElectricity && !spec.voidElectricityOnly) continue;
    await regenerateJuneElectricityForRoom({
      roomNumber: spec.roomNumber,
      spec,
      dryRun,
      log: report.electricityActions,
      onLog,
    });
  }

  // Phase 3 — July rent for active residents only
  logLine(log, '\n--- Phase 3: July rent (active residents) ---', onLog);
  const rentReport = await runShantinagarJulyRentProduction({
    session: input.session,
    dryRun,
    onLog,
  });
  report.rentActions.push(formatShantinagarJulyRentReport(rentReport));
  if (!rentReport.complete) {
    report.errors.push('July rent generation incomplete — see rent report');
  }

  if (!dryRun) {
    await syncActionItems(input.session);
  }

  report.certification = await buildCertification(pg.id, input.session);
  report.occupancyActions = [...log];

  logLine(log, '\n--- Certification ---', onLog);
  logLine(
    log,
    `Active residents: ${report.certification.activeResidents.map((r) => `${r.name} (${r.room})`).join(', ') || 'none'}`,
    onLog,
  );
  for (const room of report.certification.roomOccupancy) {
    logLine(
      log,
      `Room ${room.room}: ${room.vacant ? 'VACANT' : room.occupants.join(', ')}`,
      onLog,
    );
  }
  logLine(log, `July rent invoices: ${report.certification.julyRentInvoices.length}`, onLog);
  logLine(
    log,
    `June electricity invoices: ${report.certification.juneElectricityInvoices.length}`,
    onLog,
  );
  logLine(log, `Operations queue (open): ${report.certification.operationsQueueCount}`, onLog);
  logLine(log, `Duplicate electricity invoices: ${report.certification.duplicateInvoiceCount}`, onLog);
  logLine(log, `Orphan resident issues: ${report.certification.orphanResidentCount}`, onLog);
  logLine(log, `Occupancy mismatches: ${report.certification.occupancyMismatchCount}`, onLog);
  logLine(
    log,
    report.certification.pass ? '✓ ALL CHECKS PASSED' : '✗ CERTIFICATION FAILED — review errors',
    onLog,
  );

  return report;
}

export function formatShantinagarOccupancySsotReport(report: ShantinagarOccupancySsotReport): string {
  const lines: string[] = [];
  lines.push('=== Shantinagar Occupancy SSOT Repair ===\n');
  if (report.errors.length) {
    lines.push('ERRORS:');
    for (const e of report.errors) lines.push(`  • ${e}`);
    lines.push('');
  }
  lines.push('OCCUPANCY ACTIONS:');
  for (const a of report.occupancyActions) lines.push(a);
  lines.push('\nELECTRICITY ACTIONS:');
  for (const a of report.electricityActions) lines.push(a || '(none)');
  lines.push('\nRENT:');
  lines.push(report.rentActions.join('\n') || '(none)');
  lines.push('\n--- FINAL CERTIFICATION ---');

  if (report.certification.room203) {
    const r203 = report.certification.room203;
    lines.push('\n### Room 203 (June Electricity)');
    lines.push(`  Total room bill: ${paiseToInr(r203.totalRoomBillPaise)}`);
    lines.push(`  Already collected adjustment: ${paiseToInr(r203.checkoutCollectedPaise)}`);
    lines.push(`  Remaining bill: ${paiseToInr(r203.remainingBillPaise)}`);
    for (const r of r203.residents) {
      const inv = r.invoiceNumber ? ` · ${r.invoiceNumber} · ${r.status}` : ' · MISSING';
      lines.push(`  ${r.name}: ${paiseToInr(r.amountPaise)}${inv}`);
    }
    if (r203.invalidInvoices.length > 0) {
      lines.push('  Issues:');
      for (const issue of r203.invalidInvoices) lines.push(`    ✗ ${issue}`);
    } else {
      lines.push(`  ${r203.pass ? '✓' : '✗'} Room 203 electricity`);
    }
  }

  lines.push('\n### July Rent (active residents)');
  for (const r of report.certification.julyRentByResident) {
    const flag =
      r.issue === 'missing'
        ? ' ✗ MISSING'
        : r.issue === 'duplicate'
          ? ' ✗ DUPLICATE'
          : r.issue === 'wrong_amount'
            ? ' ✗ WRONG AMOUNT'
            : r.issue === 'skipped_private_room'
              ? ' (private room skip)'
              : '';
    const rent = r.rentPaise != null ? paiseToInr(r.rentPaise) : '—';
    const inv = r.invoiceNumber ?? '—';
    const status = r.status ?? '—';
    lines.push(
      `  ${r.name} · Room ${r.room} · ${r.bed} · ${rent} · ${inv} · ${status}${flag}`,
    );
  }
  if (report.certification.julyRentDuplicateCount > 0) {
    lines.push(
      `  ✗ July rent duplicate groups: ${report.certification.julyRentDuplicateCount}`,
    );
  }

  lines.push(`\n✓ Active residents (${report.certification.activeResidents.length}):`);
  for (const r of report.certification.activeResidents) {
    lines.push(`    ${r.name} · Room ${r.room} · ${r.bed}`);
  }
  lines.push('✓ Room occupancy (101–302):');
  for (const r of report.certification.roomOccupancy) {
    lines.push(`    ${r.room}: ${r.vacant ? 'VACANT' : r.occupants.join(', ')}`);
  }
  lines.push(`✓ July rent invoices generated: ${report.certification.julyRentInvoices.length}`);
  lines.push('✓ June electricity invoices:');
  for (const i of report.certification.juneElectricityInvoices) {
    lines.push(`    Room ${i.room} · ${i.name} · ${paiseToInr(i.amountPaise)} · ${i.invoiceNumber}`);
  }
  lines.push(`✓ Operations queue count: ${report.certification.operationsQueueCount}`);
  lines.push(`✓ Duplicate electricity invoice count: ${report.certification.duplicateInvoiceCount}`);
  lines.push(`✓ Orphan resident count: ${report.certification.orphanResidentCount}`);
  lines.push(`✓ Occupancy mismatch count: ${report.certification.occupancyMismatchCount}`);
  lines.push(
    report.certification.pass
      ? '\n✓ PASS — production synchronized with occupancy SSOT'
      : '\n✗ FAIL — manual review required',
  );
  return lines.join('\n');
}
