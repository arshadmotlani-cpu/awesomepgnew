/**
 * Availability service.
 *
 * Reads `bed_reservations` to answer the questions the customer side needs
 * before a booking can even be attempted:
 *
 *   - "Is this bed free for [start, end)?"
 *   - "When is the next time this bed is free?"
 *   - "What free windows does this bed have in the next N days?"
 *   - "For this PG, how many beds are available vs occupied between dates X
 *      and Y, and which beds are which?"  (powers /api/availability)
 *
 * Overlap rules respect the same `[start, end)` half-open daterange
 * convention enforced by the GiST EXCLUDE constraint
 * `bed_reservations_no_overlap_per_bed`. Only `active` reservations block
 * the public calendar; unpaid `hold` rows are soft interest until admin
 * approves payment proof.
 *
 * Pure helpers (`parseDaterange`, `computeFreeWindows`) are exported
 * separately from DB-touching code so the math is easy to unit-test
 * without a database.
 */

import { and, asc, eq, sql } from 'drizzle-orm';
import { db } from '../db/client';
import {
  bedReservations,
  beds,
  bookings,
  floors,
  pgs,
  rooms,
  roomTypes,
} from '../db/schema';
import {
  checkoutCapMessage,
  extensionCapMessage,
  validateStayAgainstReservations,
  type StayWindowValidation,
} from '../lib/bedAvailabilityWindows';
import {
  addDays,
  diffDays,
  formatDate,
  isBefore,
  maxDate,
  minDate,
  parseDate,
  todayString,
  type DateLike,
} from '../lib/dates';
import { BLOCKING_RESERVATION_STATUS_SQL } from '../lib/reservationBlocking';

// ───────────────────────────────────────────────────────────────────────────
// Pure helpers
// ───────────────────────────────────────────────────────────────────────────

export type ParsedRange = {
  lower: Date | null;
  upper: Date | null;
  lowerInc: boolean;
  upperInc: boolean;
};

/**
 * Parse a Postgres `daterange` string such as `[2026-06-01,2026-06-10)`.
 * Empty ranges (`empty`) collapse to `{ lower: null, upper: null }`. Unbounded
 * ends (`[2026-06-01,)`) become `upper: null`. Always returns a normalized
 * shape that downstream code can reason about without re-parsing.
 */
export function parseDaterange(value: string): ParsedRange {
  if (value === 'empty') {
    return { lower: null, upper: null, lowerInc: false, upperInc: false };
  }
  const match = value.match(/^([\[(])\s*"?([^",)\]]*)"?\s*,\s*"?([^",)\]]*)"?\s*([\])])$/);
  if (!match) throw new Error(`Cannot parse daterange: ${JSON.stringify(value)}`);
  const [, openBracket, lowerStr, upperStr, closeBracket] = match;
  return {
    lower: lowerStr ? parseDate(lowerStr) : null,
    upper: upperStr ? parseDate(upperStr) : null,
    lowerInc: openBracket === '[',
    upperInc: closeBracket === ']',
  };
}

export type Busy = { start: Date; end: Date };
export type FreeWindow = { startDate: string; endDate: string; nights: number };

/**
 * Given a sorted-or-unsorted list of busy intervals (already normalized to
 * the half-open `[start, end)` form), produce the free windows inside
 * `[windowStart, windowEnd)`. Result is always sorted ascending and never
 * contains zero-night windows.
 */
export function computeFreeWindows(
  busy: Busy[],
  windowStart: DateLike,
  windowEnd: DateLike,
): FreeWindow[] {
  const ws = parseDate(windowStart);
  const we = parseDate(windowEnd);
  if (!isBefore(ws, we)) return [];

  // Clip busy intervals to the lookup window so downstream math is clean.
  const clipped = busy
    .map(({ start, end }) => ({
      start: maxDate(start, ws),
      end: minDate(end, we),
    }))
    .filter(({ start, end }) => isBefore(start, end))
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  // Merge overlapping busy intervals so the cursor walk is straightforward.
  const merged: Busy[] = [];
  for (const b of clipped) {
    const tail = merged[merged.length - 1];
    if (tail && b.start.getTime() <= tail.end.getTime()) {
      tail.end = b.end.getTime() > tail.end.getTime() ? b.end : tail.end;
    } else {
      merged.push({ start: b.start, end: b.end });
    }
  }

  const out: FreeWindow[] = [];
  let cursor = ws;
  for (const b of merged) {
    if (isBefore(cursor, b.start)) {
      out.push(materializeWindow(cursor, b.start));
    }
    if (b.end.getTime() > cursor.getTime()) cursor = b.end;
  }
  if (isBefore(cursor, we)) {
    out.push(materializeWindow(cursor, we));
  }
  return out;
}

function materializeWindow(start: Date, end: Date): FreeWindow {
  return {
    startDate: formatDate(start),
    endDate: formatDate(end),
    nights: diffDays(start, end),
  };
}

export {
  checkoutCapMessage,
  extensionCapMessage,
  validateStayAgainstReservations,
  validateStayWithinFreeWindows,
  maxCheckoutForCheckIn,
  type StayWindowValidation,
} from '../lib/bedAvailabilityWindows';
export {
  stayRangesOverlap,
  isStayRangeAvailable,
  findOverlappingReservations,
  maxCheckoutBeforeOverlap,
  type ReservationSpan,
} from '../lib/bedStayOverlap';

// ───────────────────────────────────────────────────────────────────────────
// DB-backed queries
// ───────────────────────────────────────────────────────────────────────────

export type IsBedAvailableInput = {
  bedId: string;
  startDate: DateLike;
  endDate: DateLike;
};

/**
 * `true` iff the bed has no confirmed (`active`) reservation overlapping
 * [startDate, endDate). Unpaid holds do not block. Also checks that the
 * bed itself isn't blocked / archived. Returns `false` for unknown beds
 * (rather than throwing) so the caller can treat "unknown" identically to
 * "unavailable".
 */
export type IsBedAvailableOptions = {
  /** Admin assignment clears manual marks first; listing assignable beds skips this flag. */
  ignoreManualOccupied?: boolean;
};

export async function isBedAvailable(
  input: IsBedAvailableInput,
  options?: IsBedAvailableOptions,
): Promise<boolean> {
  const start = formatDate(parseDate(input.startDate));
  const end = formatDate(parseDate(input.endDate));

  const [bed] = await db
    .select({
      status: beds.status,
      manualOccupied: beds.manualOccupied,
      archivedAt: beds.archivedAt,
    })
    .from(beds)
    .where(eq(beds.id, input.bedId))
    .limit(1);
  if (!bed || bed.archivedAt || bed.status !== 'available') return false;
  // Reservations are SSOT — manualOccupied is legacy admin mark only, not operational.

  const [conflict] = await db
    .select({ id: bedReservations.id })
    .from(bedReservations)
    .innerJoin(bookings, eq(bookings.id, bedReservations.bookingId))
    .where(
      and(
        eq(bedReservations.bedId, input.bedId),
        sql`${bedReservations.status} IN ${sql.raw(BLOCKING_RESERVATION_STATUS_SQL)}`,
        eq(bookings.status, 'confirmed'),
        sql`${bedReservations.stayRange} && daterange(${start}::date, ${end}::date, '[)')`,
      ),
    )
    .limit(1);
  return !conflict;
}

export type NextAvailableInput = {
  bedId: string;
  fromDate: DateLike;
  lookAheadDays?: number; // default 365
};

/**
 * The earliest date >= `fromDate` at which the bed is free for at least one
 * night, within the next `lookAheadDays`. Returns `null` if the bed stays
 * fully occupied through the look-ahead window.
 */
export async function getNextAvailableDate(input: NextAvailableInput): Promise<string | null> {
  const lookAhead = input.lookAheadDays ?? 365;
  const windowStart = parseDate(input.fromDate);
  const windowEnd = addDays(windowStart, lookAhead);

  const [bed] = await db
    .select({
      status: beds.status,
      manualOccupied: beds.manualOccupied,
      archivedAt: beds.archivedAt,
    })
    .from(beds)
    .where(eq(beds.id, input.bedId))
    .limit(1);
  if (!bed || bed.archivedAt || bed.status !== 'available') return null;

  const busy = await loadBusyRanges(input.bedId, windowStart, windowEnd);
  const free = computeFreeWindows(busy, windowStart, windowEnd);
  return free.length > 0 ? free[0].startDate : null;
}

export type AvailableRangesInput = {
  bedId: string;
  fromDate: DateLike;
  lookAheadDays?: number; // default 90
};

/**
 * Materialize the bed's free windows inside the look-ahead horizon. Used
 * by the customer bed calendar UI in Phase 3.
 */
export async function getAvailableDateRanges(
  input: AvailableRangesInput,
): Promise<FreeWindow[]> {
  const lookAhead = input.lookAheadDays ?? 90;
  const windowStart = parseDate(input.fromDate);
  const windowEnd = addDays(windowStart, lookAhead);

  const [bed] = await db
    .select({
      status: beds.status,
      manualOccupied: beds.manualOccupied,
      archivedAt: beds.archivedAt,
    })
    .from(beds)
    .where(eq(beds.id, input.bedId))
    .limit(1);
  if (!bed || bed.archivedAt || bed.status !== 'available') return [];

  const busy = await loadBusyRanges(input.bedId, windowStart, windowEnd);
  return computeFreeWindows(busy, windowStart, windowEnd);
}

export type BedFutureReservation = {
  startDate: string;
  endDate: string;
  status: 'active';
  bookingCode: string | null;
};

export type BedAvailabilityTimeline = {
  bedId: string;
  bedCode: string;
  bedStatus: 'available' | 'maintenance' | 'blocked';
  windowStart: string;
  windowEnd: string;
  lookAheadDays: number;
  /** Earliest bookable check-in within the look-ahead window. */
  earliestCheckIn: string | null;
  freeWindows: FreeWindow[];
  futureReservations: BedFutureReservation[];
};

export type GetBedAvailabilityTimelineInput = {
  bedId: string;
  fromDate?: DateLike;
  lookAheadDays?: number;
};

/**
 * Per-bed availability timeline for the booking modal: free windows,
 * future reservations, and the earliest check-in date.
 */
export async function getBedAvailabilityTimeline(
  input: GetBedAvailabilityTimelineInput,
): Promise<BedAvailabilityTimeline | null> {
  const lookAhead = input.lookAheadDays ?? 365;
  const windowStart = parseDate(input.fromDate ?? todayString());
  const windowEnd = addDays(windowStart, lookAhead);

  const [bed] = await db
    .select({
      id: beds.id,
      bedCode: beds.bedCode,
      status: beds.status,
      archivedAt: beds.archivedAt,
    })
    .from(beds)
    .where(eq(beds.id, input.bedId))
    .limit(1);
  if (!bed || bed.archivedAt) return null;

  const ws = formatDate(windowStart);
  const we = formatDate(windowEnd);

  const reservationRows = await db
    .select({
      stayRange: bedReservations.stayRange,
      status: bedReservations.status,
      bookingCode: bookings.bookingCode,
    })
    .from(bedReservations)
    .innerJoin(bookings, eq(bookings.id, bedReservations.bookingId))
    .where(
      and(
        eq(bedReservations.bedId, input.bedId),
        sql`${bedReservations.status} IN ${sql.raw(BLOCKING_RESERVATION_STATUS_SQL)}`,
        eq(bookings.status, 'confirmed'),
        sql`${bedReservations.stayRange} && daterange(${ws}::date, ${we}::date, '[)')`,
      ),
    )
    .orderBy(asc(bedReservations.stayRange));

  const futureReservations: BedFutureReservation[] = [];
  for (const row of reservationRows) {
    const parsed = parseDaterange(row.stayRange as unknown as string);
    if (!parsed.lower || !parsed.upper) continue;
    futureReservations.push({
      startDate: formatDate(parsed.lower),
      endDate: formatDate(parsed.upper),
      status: 'active',
      bookingCode: row.bookingCode,
    });
  }

  if (bed.status !== 'available') {
    return {
      bedId: bed.id,
      bedCode: bed.bedCode,
      bedStatus: bed.status,
      windowStart: ws,
      windowEnd: we,
      lookAheadDays: lookAhead,
      earliestCheckIn: null,
      freeWindows: [],
      futureReservations,
    };
  }

  const busy = futureReservations.map((r) => ({
    start: parseDate(r.startDate),
    end: parseDate(r.endDate),
  }));
  const freeWindows = computeFreeWindows(busy, windowStart, windowEnd);

  return {
    bedId: bed.id,
    bedCode: bed.bedCode,
    bedStatus: bed.status,
    windowStart: ws,
    windowEnd: we,
    lookAheadDays: lookAhead,
    earliestCheckIn: freeWindows.length > 0 ? freeWindows[0]!.startDate : null,
    freeWindows,
    futureReservations,
  };
}

/**
 * Validate a proposed stay against per-bed free windows. Used by createBooking
 * before opening a transaction.
 */
export async function validateBedStayRange(input: {
  bedId: string;
  startDate: DateLike;
  endDate: DateLike;
  lookAheadDays?: number;
}): Promise<
  | { ok: true }
  | { ok: false; message: string; maxCheckout: string | null }
> {
  const [bed] = await db
    .select({
      bedCode: beds.bedCode,
      status: beds.status,
      archivedAt: beds.archivedAt,
    })
    .from(beds)
    .where(eq(beds.id, input.bedId))
    .limit(1);
  if (!bed || bed.archivedAt) {
    return { ok: false, message: 'Bed not found.', maxCheckout: null };
  }
  if (bed.status !== 'available') {
    return {
      ok: false,
      message: `Bed ${bed.bedCode} is ${bed.status} and cannot be booked.`,
      maxCheckout: null,
    };
  }

  const available = await isBedAvailable({
    bedId: input.bedId,
    startDate: input.startDate,
    endDate: input.endDate,
  });
  if (available) return { ok: true };

  const lookAhead = input.lookAheadDays ?? 365;
  const timeline = await getBedAvailabilityTimeline({
    bedId: input.bedId,
    fromDate: input.startDate,
    lookAheadDays: lookAhead,
  });
  if (!timeline) {
    return { ok: false, message: 'Bed not found.', maxCheckout: null };
  }

  const result = validateStayAgainstReservations(
    input.startDate,
    input.endDate,
    timeline.futureReservations,
    timeline.windowEnd,
  );
  if (result.ok) {
    return {
      ok: false,
      message: 'This bed is not available for the selected dates.',
      maxCheckout: null,
    };
  }
  if (result.reason === 'no_window') {
    return {
      ok: false,
      message: 'The selected dates overlap an existing reservation for this bed.',
      maxCheckout: null,
    };
  }
  return {
    ok: false,
    message: checkoutCapMessage(result.maxCheckout!),
    maxCheckout: result.maxCheckout,
  };
}

async function loadBusyRanges(
  bedId: string,
  windowStart: Date,
  windowEnd: Date,
): Promise<Busy[]> {
  const ws = formatDate(windowStart);
  const we = formatDate(windowEnd);
  const rows = await db
    .select({ stayRange: bedReservations.stayRange })
    .from(bedReservations)
    .innerJoin(bookings, eq(bookings.id, bedReservations.bookingId))
    .where(
      and(
        eq(bedReservations.bedId, bedId),
        sql`${bedReservations.status} IN ${sql.raw(BLOCKING_RESERVATION_STATUS_SQL)}`,
        eq(bookings.status, 'confirmed'),
        sql`${bedReservations.stayRange} && daterange(${ws}::date, ${we}::date, '[)')`,
      ),
    );
  const out: Busy[] = [];
  for (const r of rows) {
    const parsed = parseDaterange(r.stayRange as unknown as string);
    if (!parsed.lower || !parsed.upper) continue; // ignore unbounded reservations (we don't create any)
    out.push({ start: parsed.lower, end: parsed.upper });
  }
  return out;
}

// ───────────────────────────────────────────────────────────────────────────
// PG-wide availability  — powers /api/availability and admin dashboard
// ───────────────────────────────────────────────────────────────────────────

export type PgAvailabilityBed = {
  bedId: string;
  bedCode: string;
  status: 'available' | 'maintenance' | 'blocked';
  roomNumber: string;
  roomType: string;
  floorNumber: number;
  floorLabel: string;
  /** True iff the bed is free for the entire requested [startDate, endDate). */
  isAvailable: boolean;
  /** True iff at least one day in the requested range is already held/booked. */
  isOccupied: boolean;
  /**
   * If the requested range is not fully available, the soonest date the bed
   * frees up. Looks ahead up to `lookAheadDays` past `endDate` (default 90).
   */
  nextAvailableDate: string | null;
};

export type PgAvailability = {
  pgId: string;
  pgName: string;
  startDate: string;
  endDate: string;
  nights: number;
  summary: {
    totalBeds: number;
    availableBeds: number;
    occupiedBeds: number;
    blockedBeds: number;
    maintenanceBeds: number;
    occupancyPct: number;
  };
  beds: PgAvailabilityBed[];
};

export type GetPgAvailabilityInput = {
  pgId: string;
  startDate: DateLike;
  endDate: DateLike;
  lookAheadDays?: number;
};

/**
 * Compute availability for every bed in a PG across the requested range.
 *
 * Strategy:
 *   1. Pull all beds in the PG (one round-trip).
 *   2. Pull all reservations on those beds that overlap the look-ahead
 *      window (one more round-trip).
 *   3. Pivot in memory — much cheaper than N+1 queries per bed.
 */
export async function getPgAvailability(
  input: GetPgAvailabilityInput,
): Promise<PgAvailability | null> {
  const start = parseDate(input.startDate);
  const end = parseDate(input.endDate);
  if (!isBefore(start, end)) {
    throw new Error('endDate must be strictly after startDate');
  }
  const lookAhead = input.lookAheadDays ?? 90;
  const horizonEnd = addDays(end, lookAhead);

  // Verify the PG exists and capture its display name.
  const [pgRow] = await db
    .select({ id: pgs.id, name: pgs.name })
    .from(pgs)
    .where(and(eq(pgs.id, input.pgId), sql`${pgs.archivedAt} IS NULL`))
    .limit(1);
  if (!pgRow) return null;

  const bedRows = await db
    .select({
      bedId: beds.id,
      bedCode: beds.bedCode,
      bedStatus: beds.status,
      roomNumber: rooms.roomNumber,
      roomType: roomTypes.name,
      floorNumber: floors.floorNumber,
      floorLabel: sql<string>`coalesce(${floors.label}, 'Floor ' || ${floors.floorNumber})`,
    })
    .from(beds)
    .innerJoin(rooms, eq(rooms.id, beds.roomId))
    .innerJoin(roomTypes, eq(roomTypes.id, rooms.roomTypeId))
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .where(
      and(
        eq(floors.pgId, pgRow.id),
        sql`${beds.archivedAt} IS NULL`,
        sql`${rooms.archivedAt} IS NULL`,
        sql`${floors.archivedAt} IS NULL`,
      ),
    )
    .orderBy(asc(floors.floorNumber), asc(rooms.roomNumber), asc(beds.bedCode));

  // One query for every reservation that could possibly matter — anything
  // overlapping the requested range OR the look-ahead horizon used for the
  // "next available" hint.
  const bedIds = bedRows.map((b) => b.bedId);
  let reservations: Array<{ bedId: string; stayRange: string }> = [];
  if (bedIds.length > 0) {
    const startIso = formatDate(start);
    const horizonIso = formatDate(horizonEnd);
    reservations = (await db
      .select({
        bedId: bedReservations.bedId,
        stayRange: bedReservations.stayRange,
      })
      .from(bedReservations)
      .innerJoin(bookings, eq(bookings.id, bedReservations.bookingId))
      .where(
        and(
          sql`${bedReservations.bedId} = ANY(${sql.raw(`'{${bedIds.join(',')}}'::uuid[]`)})`,
          sql`${bedReservations.status} IN ${sql.raw(BLOCKING_RESERVATION_STATUS_SQL)}`,
          eq(bookings.status, 'confirmed'),
          sql`${bedReservations.stayRange} && daterange(${startIso}::date, ${horizonIso}::date, '[)')`,
        ),
      )) as Array<{ bedId: string; stayRange: string }>;
  }

  // Pivot reservations by bed for cheap lookup.
  const busyByBed = new Map<string, Busy[]>();
  for (const r of reservations) {
    const parsed = parseDaterange(r.stayRange);
    if (!parsed.lower || !parsed.upper) continue;
    let list = busyByBed.get(r.bedId);
    if (!list) {
      list = [];
      busyByBed.set(r.bedId, list);
    }
    list.push({ start: parsed.lower, end: parsed.upper });
  }

  const beds_: PgAvailabilityBed[] = bedRows.map((b) => {
    const busyAll = busyByBed.get(b.bedId) ?? [];
    const bedBookable = b.bedStatus === 'available';

    // "Available" for the requested range = bed is bookable AND no busy
    // interval overlaps [start, end).
    let isAvailable = bedBookable;
    let isOccupied = false;
    if (bedBookable) {
      for (const busy of busyAll) {
        // Half-open overlap: a && b iff a.start < b.end AND b.start < a.end
        if (busy.start.getTime() < end.getTime() && start.getTime() < busy.end.getTime()) {
          isAvailable = false;
          isOccupied = true;
          break;
        }
      }
    }

    let nextAvailableDate: string | null = null;
    if (!isAvailable) {
      if (bedBookable) {
        // Walk the free windows in [start, horizon) to find the first one.
        const free = computeFreeWindows(busyAll, start, horizonEnd);
        nextAvailableDate = free.length > 0 ? free[0].startDate : null;
      }
    } else {
      nextAvailableDate = formatDate(start);
    }

    return {
      bedId: b.bedId,
      bedCode: b.bedCode,
      status: b.bedStatus,
      roomNumber: b.roomNumber,
      roomType: b.roomType,
      floorNumber: b.floorNumber,
      floorLabel: b.floorLabel,
      isAvailable,
      isOccupied,
      nextAvailableDate,
    };
  });

  const totalBeds = beds_.length;
  const availableBeds = beds_.filter((b) => b.isAvailable).length;
  const occupiedBeds = beds_.filter((b) => b.isOccupied).length;
  const blockedBeds = beds_.filter((b) => b.status === 'blocked').length;
  const maintenanceBeds = beds_.filter((b) => b.status === 'maintenance').length;
  const occupancyPct =
    totalBeds === 0 ? 0 : Math.round((occupiedBeds / totalBeds) * 1000) / 10;

  return {
    pgId: pgRow.id,
    pgName: pgRow.name,
    startDate: formatDate(start),
    endDate: formatDate(end),
    nights: diffDays(start, end),
    summary: {
      totalBeds,
      availableBeds,
      occupiedBeds,
      blockedBeds,
      maintenanceBeds,
      occupancyPct,
    },
    beds: beds_,
  };
}
