/**
 * Loads room occupancy timeline and builds checkout electricity allocation.
 */
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { beds, bookings, customers } from '@/src/db/schema';
import { formatDate, parseDate } from '@/src/lib/dates';
import {
  allocateRoomElectricityCheckout,
  type RoomElectricityCheckoutAllocation,
  type RoomOccupantSlice,
} from '@/src/lib/checkout/roomElectricityAllocation';
import { firstOfMonth, monthBounds } from '@/src/services/billing';

export type { RoomElectricityCheckoutAllocation };

export async function loadRoomOccupantsForBillingPeriod(
  roomId: string,
  periodStart: string,
  periodEndExclusive: string,
): Promise<RoomOccupantSlice[]> {
  const rows = await db
    .select({
      bookingId: bookings.id,
      customerId: bookings.customerId,
      customerName: customers.fullName,
      lower: sql<string>`lower(bed_reservations.stay_range)::text`,
      upper: sql<string | null>`upper(bed_reservations.stay_range)::text`,
    })
    .from(bookings)
    .innerJoin(sql`bed_reservations`, sql`bed_reservations.booking_id = ${bookings.id}`)
    .innerJoin(beds, sql`${beds.id} = bed_reservations.bed_id`)
    .innerJoin(customers, eq(customers.id, bookings.customerId))
    .where(
      and(
        eq(beds.roomId, roomId),
        eq(bookings.status, 'confirmed'),
        sql`bed_reservations.status = 'active'`,
        sql`bed_reservations.kind = 'primary'`,
        sql`bed_reservations.stay_range && daterange(${periodStart}::date, ${periodEndExclusive}::date, '[)')`,
      ),
    );

  const byBooking = new Map<string, RoomOccupantSlice>();
  for (const row of rows) {
    const existing = byBooking.get(row.bookingId);
    const stayStart = existing
      ? row.lower < existing.stayStart
        ? row.lower
        : existing.stayStart
      : row.lower;
    const stayEndExclusive = (() => {
      if (!row.upper && !existing?.stayEndExclusive) return null;
      if (!row.upper) return existing!.stayEndExclusive;
      if (!existing?.stayEndExclusive) return row.upper;
      return row.upper > existing.stayEndExclusive ? row.upper : existing.stayEndExclusive;
    })();
    byBooking.set(row.bookingId, {
      bookingId: row.bookingId,
      customerId: row.customerId,
      customerName: row.customerName,
      stayStart,
      stayEndExclusive,
    });
  }

  return [...byBooking.values()];
}

export type RoomElectricityCollectionRow = {
  customerId: string;
  amountPaise: number;
  checkoutSettlementId?: string | null;
};

/** Build per-customer collected map — SSOT for checkout electricity remaining pool. */
export function buildCollectedByCustomerIdForCheckout(input: {
  contributions: RoomElectricityCollectionRow[];
  ledgerRows: RoomElectricityCollectionRow[];
  excludeCheckoutSettlementId?: string | null;
}): Map<string, number> {
  const collectedByCustomerId = new Map<string, number>();
  if (input.contributions.length > 0) {
    for (const row of input.contributions) {
      if (
        input.excludeCheckoutSettlementId &&
        row.checkoutSettlementId === input.excludeCheckoutSettlementId
      ) {
        continue;
      }
      collectedByCustomerId.set(
        row.customerId,
        (collectedByCustomerId.get(row.customerId) ?? 0) + row.amountPaise,
      );
    }
    return collectedByCustomerId;
  }

  for (const entry of input.ledgerRows) {
    if (
      input.excludeCheckoutSettlementId &&
      entry.checkoutSettlementId === input.excludeCheckoutSettlementId
    ) {
      continue;
    }
    collectedByCustomerId.set(
      entry.customerId,
      (collectedByCustomerId.get(entry.customerId) ?? 0) + entry.amountPaise,
    );
  }
  return collectedByCustomerId;
}

export async function buildRoomElectricityCheckoutAllocation(input: {
  roomId: string;
  customerId: string;
  vacatingDate: string;
  totalBillPaise: number;
  unitsConsumed?: number | null;
  excludeCheckoutSettlementId?: string | null;
}): Promise<RoomElectricityCheckoutAllocation> {
  const billingMonth = firstOfMonth(input.vacatingDate);
  const { start: monthStart, end: monthEnd } = monthBounds(billingMonth);
  const vacatingExclusive = formatDate(
    new Date(parseDate(input.vacatingDate).getTime() + 86_400_000),
  );
  const periodEndExclusive =
    vacatingExclusive < formatDate(monthEnd) ? vacatingExclusive : formatDate(monthEnd);
  const periodStart = formatDate(monthStart);

  const occupants = await loadRoomOccupantsForBillingPeriod(
    input.roomId,
    periodStart,
    periodEndExclusive,
  );

  const { loadRoomElectricityCollectedByCustomerForMonth } = await import(
    '@/src/services/electricityRoomContributions'
  );
  const collectedByCustomerId = await loadRoomElectricityCollectedByCustomerForMonth(
    input.roomId,
    billingMonth,
    { excludeCheckoutSettlementId: input.excludeCheckoutSettlementId },
  );

  return allocateRoomElectricityCheckout({
    billingMonth,
    periodStart,
    periodEndExclusive,
    totalBillPaise: input.totalBillPaise,
    unitsConsumed: input.unitsConsumed ?? null,
    occupants,
    collectedByCustomerId,
    currentCustomerId: input.customerId,
  });
}
