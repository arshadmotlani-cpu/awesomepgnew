/**
 * Rent pricing SSOT: bed_prices / negotiated room config → billing profile → invoice.
 * Booking pricing snapshots are historical — never preferred over current catalog.
 */
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  bedReservations,
  beds,
  bookings,
  customers,
  floors,
  residentBillingProfiles,
  rooms,
} from '@/src/db/schema';
import type { PricingSnapshot } from '@/src/db/schema/bookings';
import {
  getRoomBillingConfig,
  getRoomBillingConfigForBed,
  resolvePrivateRoomRentPaise,
} from '@/src/lib/billing/roomBilling';
import {
  isActiveResidentFilter,
  isProductionBookingFilter,
  isProductionCustomerFilter,
} from '@/src/lib/billing/productionDataFilter';
import { firstOfMonth } from '@/src/services/billing';
import { loadBedPrice } from '@/src/services/pricing';
import { getBillingProfileForBooking } from '@/src/services/residentBillingProfiles';

export type RentPricingSource =
  | 'bed_price'
  | 'private_room_config'
  | 'billing_profile'
  | 'pricing_snapshot'
  | 'none';

function monthlyRentFromSnapshot(snapshot: PricingSnapshot | null): number {
  if (!snapshot || !Array.isArray(snapshot.perBed)) return 0;
  return snapshot.perBed.reduce((acc, bed) => acc + (bed.monthlyRatePaise ?? 0), 0);
}

async function activeBedIdForBooking(bookingId: string): Promise<string | null> {
  const [row] = await db
    .select({ bedId: beds.id })
    .from(bedReservations)
    .innerJoin(beds, eq(beds.id, bedReservations.bedId))
    .where(
      and(
        eq(bedReservations.bookingId, bookingId),
        eq(bedReservations.kind, 'primary'),
        eq(bedReservations.status, 'active'),
      ),
    )
    .limit(1);
  return row?.bedId ?? null;
}

/** Resolve monthly rent from the canonical pricing chain for a billing month. */
export async function resolveMonthlyRentPaiseForBooking(
  bookingId: string,
  billingMonth: string,
): Promise<{ rentPaise: number; source: RentPricingSource }> {
  const month = firstOfMonth(billingMonth);
  const bedId = await activeBedIdForBooking(bookingId);

  const [booking] = await db
    .select({ pricingSnapshot: bookings.pricingSnapshot })
    .from(bookings)
    .where(eq(bookings.id, bookingId))
    .limit(1);
  const snapshotRent = monthlyRentFromSnapshot(
    (booking?.pricingSnapshot as PricingSnapshot | null) ?? null,
  );

  const profile = await getBillingProfileForBooking(bookingId);
  const profileRent = profile?.rentAmountPaise ?? 0;

  if (bedId) {
    const roomConfig = await getRoomBillingConfigForBed(bedId);
    if (roomConfig?.billingMode === 'private_room') {
      const fullConfig = await getRoomBillingConfig(roomConfig.roomId);
      if (fullConfig) {
        const configRent = fullConfig.privateRoomMonthlyRentPaise ?? 0;
        if (configRent > 0) {
          return { rentPaise: configRent, source: 'private_room_config' };
        }
        const negotiated = resolvePrivateRoomRentPaise(
          fullConfig,
          profileRent,
          snapshotRent,
        );
        if (negotiated > 0) {
          return { rentPaise: negotiated, source: 'private_room_config' };
        }
      }
    }

    const bedPrice = await loadBedPrice(bedId, month);
    if (bedPrice && bedPrice.monthlyRatePaise > 0) {
      return { rentPaise: bedPrice.monthlyRatePaise, source: 'bed_price' };
    }
  }

  if (profileRent > 0) {
    return { rentPaise: profileRent, source: 'billing_profile' };
  }

  if (snapshotRent > 0) {
    return { rentPaise: snapshotRent, source: 'pricing_snapshot' };
  }

  return { rentPaise: 0, source: 'none' };
}

function isCanonicalSource(source: RentPricingSource): boolean {
  return source === 'bed_price' || source === 'private_room_config';
}

/** Write profile rent from bed_prices / room config (never from stale snapshot). */
export async function syncBillingProfileRentFromSsot(
  bookingId: string,
  billingMonth: string,
): Promise<{ rentPaise: number; source: RentPricingSource; updated: boolean }> {
  const resolved = await resolveMonthlyRentPaiseForBooking(bookingId, billingMonth);
  if (!isCanonicalSource(resolved.source) || resolved.rentPaise <= 0) {
    return { ...resolved, updated: false };
  }

  const profile = await getBillingProfileForBooking(bookingId);
  if (!profile) {
    return { ...resolved, updated: false };
  }

  if (profile.rentAmountPaise === resolved.rentPaise) {
    return { ...resolved, updated: false };
  }

  await db
    .update(residentBillingProfiles)
    .set({ rentAmountPaise: resolved.rentPaise, updatedAt: new Date() })
    .where(eq(residentBillingProfiles.bookingId, bookingId));

  return { ...resolved, updated: true };
}

export type StaleBillingProfileRow = {
  bookingId: string;
  customerName: string;
  roomNumber: string;
  profileRentPaise: number;
  expectedRentPaise: number;
  expectedSource: RentPricingSource;
};

/** One resident whose profile rent diverges from bed_prices / room config. */
export async function findStaleBillingProfile(
  bookingId: string,
  billingMonth: string,
  meta?: { customerName: string; roomNumber: string },
): Promise<StaleBillingProfileRow | null> {
  const resolved = await resolveMonthlyRentPaiseForBooking(bookingId, billingMonth);
  if (!isCanonicalSource(resolved.source) || resolved.rentPaise <= 0) {
    return null;
  }

  const profile = await getBillingProfileForBooking(bookingId);
  if (!profile || profile.rentAmountPaise === resolved.rentPaise) {
    return null;
  }

  let customerName = meta?.customerName ?? '';
  let roomNumber = meta?.roomNumber ?? '';
  if (!customerName || !roomNumber) {
    const [row] = await db
      .select({
        customerName: customers.fullName,
        roomNumber: rooms.roomNumber,
      })
      .from(bookings)
      .innerJoin(customers, eq(customers.id, bookings.customerId))
      .innerJoin(bedReservations, eq(bedReservations.bookingId, bookings.id))
      .innerJoin(beds, eq(beds.id, bedReservations.bedId))
      .innerJoin(rooms, eq(rooms.id, beds.roomId))
      .where(
        and(
          eq(bookings.id, bookingId),
          eq(bedReservations.kind, 'primary'),
          eq(bedReservations.status, 'active'),
        ),
      )
      .limit(1);
    customerName = row?.customerName ?? customerName;
    roomNumber = row?.roomNumber ?? roomNumber;
  }

  return {
    bookingId,
    customerName,
    roomNumber,
    profileRentPaise: profile.rentAmountPaise,
    expectedRentPaise: resolved.rentPaise,
    expectedSource: resolved.source,
  };
}

/** All active residents in a PG with stale billing profile rent. */
export async function listStaleBillingProfilesForPg(
  pgId: string,
  billingMonth: string,
): Promise<StaleBillingProfileRow[]> {
  const rows = await db
    .select({
      bookingId: bookings.id,
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
        eq(floors.pgId, pgId),
        eq(bookings.status, 'confirmed'),
        eq(bedReservations.status, 'active'),
        eq(bedReservations.kind, 'primary'),
        isProductionBookingFilter(),
        isProductionCustomerFilter(),
        isActiveResidentFilter(),
        inArray(bookings.durationMode, ['monthly', 'open_ended']),
      ),
    );

  const stale: StaleBillingProfileRow[] = [];
  for (const row of rows) {
    const hit = await findStaleBillingProfile(row.bookingId, billingMonth, {
      customerName: row.customerName,
      roomNumber: row.roomNumber,
    });
    if (hit) stale.push(hit);
  }
  return stale;
}

/** Sync every active resident billing profile in a PG from bed_prices / room config. */
export async function syncAllBillingProfilesForPg(
  pgId: string,
  billingMonth: string,
): Promise<{ synced: number; skipped: number }> {
  const rows = await db
    .select({ bookingId: bookings.id })
    .from(bookings)
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
        isProductionBookingFilter(),
        isProductionCustomerFilter(),
        isActiveResidentFilter(),
        inArray(bookings.durationMode, ['monthly', 'open_ended']),
      ),
    );

  let synced = 0;
  let skipped = 0;
  const seen = new Set<string>();
  for (const row of rows) {
    if (seen.has(row.bookingId)) continue;
    seen.add(row.bookingId);
    const result = await syncBillingProfileRentFromSsot(row.bookingId, billingMonth);
    if (result.updated) synced += 1;
    else skipped += 1;
  }
  return { synced, skipped };
}
