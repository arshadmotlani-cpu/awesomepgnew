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
): Promise<MarkPgOccupancyResult[]> {
  const matches = await findPgIdsByNamePatterns(patterns);
  const results: MarkPgOccupancyResult[] = [];
  for (const pg of matches) {
    const { bedsMarked, bookingCode } = await markPgFullyOccupied(session, pg.id);
    results.push({ pgId: pg.id, pgName: pg.name, bedsMarked, bookingCode });
  }
  return results;
}

/** Match PGs by partial name (case-insensitive). */
export async function findPgIdsByNamePatterns(patterns: string[]): Promise<
  Array<{ id: string; name: string }>
> {
  const rows = await db
    .select({ id: pgs.id, name: pgs.name })
    .from(pgs)
    .where(isNull(pgs.archivedAt))
    .orderBy(asc(pgs.name));

  const normalized = patterns.map((p) => p.toLowerCase());
  return rows.filter((r) =>
    normalized.some((p) => r.name.toLowerCase().includes(p)),
  );
}
