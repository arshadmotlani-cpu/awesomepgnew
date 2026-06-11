import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  bedReservations,
  beds,
  bookings,
  customers,
  floors,
  pgs,
  rooms,
} from '@/src/db/schema';
import { adminCanAccessPg } from '@/src/lib/auth/roles';
import type { AdminSession } from '@/src/lib/auth/session';
import { nextBookingCode, utcYear } from '@/src/lib/bookingCode';
import { formatDate } from '@/src/lib/dates';
import { countBookingsInYear } from '@/src/db/queries/customer';

const PLACEHOLDER_PHONE = '+910000000001';
const OCCUPANCY_END = '2099-01-01';

/** PG name substrings matched case-insensitively for bulk “fully occupied” admin actions. */
export const FULLY_OCCUPIED_PG_NAME_PATTERNS = ['central', 'trimurti'] as const;

function assertPgAccess(session: AdminSession, pgId: string) {
  if (!adminCanAccessPg({ role: session.role, pgScope: session.pgScope }, pgId)) {
    throw new Error('You do not have access to this PG.');
  }
}

async function upsertPlaceholderCustomer() {
  const [row] = await db
    .insert(customers)
    .values({
      fullName: 'Occupancy placeholder',
      email: 'occupancy@awesomepg.internal',
      phone: PLACEHOLDER_PHONE,
      gender: 'other',
      authProvider: 'email',
      kycStatus: 'pending',
    })
    .onConflictDoUpdate({
      target: customers.phone,
      set: { updatedAt: new Date() },
    })
    .returning({ id: customers.id });
  return row;
}

/**
 * Mark every vacant bed in a PG as occupied (active reservation through 2099).
 * Used when tenants are on-site but not yet entered as individual bookings.
 */
export async function markPgFullyOccupied(
  session: AdminSession,
  pgId: string,
): Promise<{ bedsMarked: number; bookingCode: string }> {
  assertPgAccess(session, pgId);

  const [pg] = await db
    .select({ id: pgs.id, name: pgs.name })
    .from(pgs)
    .where(and(eq(pgs.id, pgId), isNull(pgs.archivedAt)))
    .limit(1);
  if (!pg) throw new Error('PG not found.');

  const vacantBeds = await db
    .select({ bedId: beds.id })
    .from(beds)
    .innerJoin(rooms, eq(rooms.id, beds.roomId))
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .where(
      and(
        eq(floors.pgId, pgId),
        isNull(beds.archivedAt),
        isNull(rooms.archivedAt),
        isNull(floors.archivedAt),
        sql`NOT EXISTS (
          SELECT 1 FROM ${bedReservations} r
          WHERE r.bed_id = ${beds.id}
            AND r.status = 'active'
            AND CURRENT_DATE <@ r.stay_range
        )`,
      ),
    );

  if (vacantBeds.length === 0) {
    return { bedsMarked: 0, bookingCode: '' };
  }

  const customer = await upsertPlaceholderCustomer();
  const year = utcYear();
  const yearPrefix = `APG-${year}-`;
  const baseCount = await countBookingsInYear(yearPrefix);
  const bookingCode = nextBookingCode(year, baseCount);
  const today = formatDate(new Date());

  await db.transaction(async (tx) => {
    const [booking] = await tx
      .insert(bookings)
      .values({
        bookingCode,
        customerId: customer.id,
        status: 'confirmed',
        durationMode: 'monthly',
        subtotalPaise: 0,
        discountPaise: 0,
        taxPaise: 0,
        totalPaise: 0,
        depositPaise: 0,
        pricingSnapshot: {
          perBed: [],
          computedAt: new Date().toISOString(),
          notes: `Occupancy placeholder for ${pg.name}`,
        },
        notes: `Full occupancy marker — beds show occupied in dashboard until real bookings replace this.`,
        createdVia: 'admin',
        createdByAdminId: session.adminId,
      })
      .returning({ id: bookings.id });

    for (const { bedId } of vacantBeds) {
      await tx.insert(bedReservations).values({
        bookingId: booking.id,
        bedId,
        stayRange: sql`daterange(${today}::date, ${OCCUPANCY_END}::date, '[)')` as unknown as string,
        kind: 'primary',
        status: 'active',
      });
    }
  });

  return { bedsMarked: vacantBeds.length, bookingCode };
}

export type ClearPgOccupancyResult = {
  pgId: string;
  pgName: string;
  bedsReleased: number;
  bookingsCancelled: number;
};

/**
 * Cancel admin "occupancy placeholder" bookings for a PG so beds show
 * available again on the website. Only touches bookings created by
 * {@link markPgFullyOccupied} (placeholder customer / marker notes) — not
 * real tenant assignments.
 */
export async function clearPgOccupancyPlaceholders(
  session: AdminSession,
  pgId: string,
): Promise<{ bedsReleased: number; bookingsCancelled: number }> {
  assertPgAccess(session, pgId);

  const [pg] = await db
    .select({ id: pgs.id, name: pgs.name })
    .from(pgs)
    .where(and(eq(pgs.id, pgId), isNull(pgs.archivedAt)))
    .limit(1);
  if (!pg) throw new Error('PG not found.');

  const rows = await db
    .selectDistinct({ bookingId: bookings.id })
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
        sql`${bedReservations.status} IN ('hold', 'active')`,
        sql`(
          ${customers.phone} = ${PLACEHOLDER_PHONE}
          OR ${customers.email} = 'occupancy@awesomepg.internal'
          OR ${bookings.notes} ILIKE '%occupancy placeholder%'
          OR ${bookings.notes} ILIKE '%Full occupancy marker%'
          OR ${bookings.notes} ILIKE '%full occupancy%'
          OR ${bookings.pricingSnapshot}::text ILIKE '%Occupancy placeholder%'
          OR (
            ${bookings.createdVia} = 'admin'
            AND ${bookings.subtotalPaise} = 0
            AND ${bookings.depositPaise} = 0
            AND ${bookings.notes} ILIKE '%occupancy%'
          )
        )`,
      ),
    );

  let bedsReleased = 0;
  const now = new Date();
  for (const { bookingId } of rows) {
    const released = await db.transaction(async (tx) => {
      const cancelled = await tx
        .update(bedReservations)
        .set({ status: 'cancelled', updatedAt: now })
        .where(
          and(
            eq(bedReservations.bookingId, bookingId),
            sql`${bedReservations.status} IN ('hold', 'active')`,
          ),
        )
        .returning({ id: bedReservations.id });

      await tx
        .update(bookings)
        .set({
          status: 'cancelled',
          cancelledAt: now,
          cancellationReason: 'Occupancy placeholder cleared — beds available for assignment.',
          updatedAt: now,
        })
        .where(eq(bookings.id, bookingId));

      return cancelled.length;
    });
    bedsReleased += released;
  }

  return { bedsReleased, bookingsCancelled: rows.length };
}

type PgNamePatternOptions = {
  excludePatterns?: string[];
};

/** Clear occupancy placeholders on every PG matching name patterns. */
export async function clearPgOccupancyPlaceholdersByPatterns(
  session: AdminSession,
  patterns: string[],
  options?: PgNamePatternOptions,
): Promise<ClearPgOccupancyResult[]> {
  const matches = await findPgIdsByNamePatterns(patterns, options);
  const results: ClearPgOccupancyResult[] = [];
  for (const pg of matches) {
    const { bedsReleased, bookingsCancelled } = await clearPgOccupancyPlaceholders(
      session,
      pg.id,
    );
    results.push({
      pgId: pg.id,
      pgName: pg.name,
      bedsReleased,
      bookingsCancelled,
    });
  }
  return results;
}

export type MarkPgOccupancyResult = {
  pgId: string;
  pgName: string;
  bedsMarked: number;
  bookingCode: string;
};

/** Mark every PG whose name matches any pattern (case-insensitive). */
export async function markPgsFullyOccupiedByPatterns(
  session: AdminSession,
  patterns: string[],
  options?: PgNamePatternOptions,
): Promise<MarkPgOccupancyResult[]> {
  const matches = await findPgIdsByNamePatterns(patterns, options);
  const results: MarkPgOccupancyResult[] = [];
  for (const pg of matches) {
    const { bedsMarked, bookingCode } = await markPgFullyOccupied(session, pg.id);
    results.push({ pgId: pg.id, pgName: pg.name, bedsMarked, bookingCode });
  }
  return results;
}

/** Match PGs by partial name (case-insensitive). */
export async function findPgIdsByNamePatterns(
  patterns: string[],
  options?: PgNamePatternOptions,
): Promise<Array<{ id: string; name: string }>> {
  const rows = await db
    .select({ id: pgs.id, name: pgs.name })
    .from(pgs)
    .where(isNull(pgs.archivedAt))
    .orderBy(asc(pgs.name));

  const normalized = patterns.map((p) => p.toLowerCase());
  const excluded = (options?.excludePatterns ?? []).map((p) => p.toLowerCase());
  return rows.filter((r) => {
    const name = r.name.toLowerCase();
    const included = normalized.some((p) => name.includes(p));
    const rejected = excluded.some((p) => name.includes(p));
    return included && !rejected;
  });
}
