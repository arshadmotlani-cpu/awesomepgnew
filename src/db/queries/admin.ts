import { and, asc, desc, eq, gt, inArray, isNull, ne, or, sql } from 'drizzle-orm';
import { db } from '../client';
import { hasDatabaseUrl } from '@/src/lib/db/env';
import { resolveBillingMonth } from '@/src/lib/dateDefaults';
import {
  OCCUPANCY_PLACEHOLDER_EMAIL,
  OCCUPANCY_PLACEHOLDER_NAME,
  OCCUPANCY_PLACEHOLDER_PHONE,
} from '@/src/lib/occupancySqlFilters';
import { productionInvoiceBookingFilters } from '@/src/lib/billing/invoiceOnlyFinancials';
import { collectibleResidentFilters } from '@/src/lib/billing/productionDataFilter';
import { bedOccupiedTodayExistsSql } from '@/src/lib/occupancySsot';
import { aggregateOccupancyCounts } from '@/src/lib/bedOccupancyResolve';
import {
  fetchBedOccupancyRows,
  getGlobalOccupancyCounts,
  getOccupancyCountsByPg,
  resolveBedOccupancyRows,
} from '@/src/services/bedOccupancyBatch';
import { guardDepositPaise } from '@/src/lib/deposits/paiseSafety';
import { normalizeIsoDateOnly, todayString } from '@/src/lib/dates';
import { asPlainNumber } from '@/src/lib/format';
import { sanitizeAdminQueryError } from '@/src/lib/admin/productionDbError';
import { isProductionElectricityBillFilter } from '@/src/lib/billing/electricityProductionFilter';
import { operationsElectricityInvoiceFilter } from '@/src/lib/billing/electricityOperationsFilter';
import {
  buildPaidElectricityBookingMonthKeys,
  isElectricityAwaitingResidentPayment,
} from '@/src/lib/billing/electricityCollectibility';
import {
  asElectricityInvoiceRow,
  electricityInvoiceLegacySelect,
} from '@/src/lib/db/electricityInvoiceSelect';
import {
  beds,
  bedPrices,
  bedReservations,
  bookings,
  customers,
  depositLedger,
  electricityBills,
  electricityInvoices,
  floors,
  payments,
  pgs,
  rentInvoices,
  rooms,
  roomTypes,
  stayExtensions,
  vacatingRequests,
} from '../schema';
import type { PricingSnapshot } from '../schema/bookings';

/**
 * All admin read queries return a discriminated union so pages can render a
 * "database not configured / unreachable" state without crashing. The shape
 * is intentionally simple — Phase 6 will replace this with a proper service
 * layer plus suspense streaming.
 */
export type QueryResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

async function guard<T>(fn: () => Promise<T>): Promise<QueryResult<T>> {
  if (!hasDatabaseUrl()) {
    return {
      ok: false,
      error: sanitizeAdminQueryError(
        'DATABASE_URL is not set. Add it to your environment and restart.',
      ),
    };
  }
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[admin query]', message);
    return { ok: false, error: sanitizeAdminQueryError(message) };
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Dashboard
// ───────────────────────────────────────────────────────────────────────────

export type DashboardStats = {
  totalPgs: number;
  totalFloors: number;
  totalRooms: number;
  totalBeds: number;
  occupiedBeds: number;
  availableBeds: number;
  blockedBeds: number;
  maintenanceBeds: number;
  /** Occupied / total, rounded to one decimal (0 when totalBeds === 0). */
  occupancyPct: number;
};

export function getDashboardStats(): Promise<QueryResult<DashboardStats>> {
  return guard(async () => {
    const [pgRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(pgs)
      .where(sql`${pgs.archivedAt} IS NULL`);
    const [floorRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(floors)
      .where(sql`${floors.archivedAt} IS NULL`);
    const [roomRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(rooms)
      .where(sql`${rooms.archivedAt} IS NULL`);

    const bedRows = await db
      .select({
        status: beds.status,
        count: sql<number>`count(*)::int`,
      })
      .from(beds)
      .where(sql`${beds.archivedAt} IS NULL`)
      .groupBy(beds.status);

    const totalBeds = bedRows.reduce((acc, r) => acc + r.count, 0);
    const occupancy = await getGlobalOccupancyCounts();

    return {
      totalPgs: pgRow?.count ?? 0,
      totalFloors: floorRow?.count ?? 0,
      totalRooms: roomRow?.count ?? 0,
      totalBeds,
      occupiedBeds: occupancy.occupiedBeds,
      availableBeds: occupancy.openNowBeds,
      blockedBeds: occupancy.blockedBeds,
      maintenanceBeds: occupancy.maintenanceBeds,
      occupancyPct: occupancy.occupancyPct,
    };
  });
}

// ───────────────────────────────────────────────────────────────────────────
// PGs
// ───────────────────────────────────────────────────────────────────────────

export type PgListRow = {
  id: string;
  name: string;
  slug: string;
  city: string;
  state: string;
  pincode: string;
  genderPolicy: 'male' | 'female' | 'coed';
  isActive: boolean;
  floorCount: number;
  roomCount: number;
  bedCount: number;
};

export function listPgs(): Promise<QueryResult<PgListRow[]>> {
  return guard(async () => {
    const rows = await db
      .select({
        id: pgs.id,
        name: pgs.name,
        slug: pgs.slug,
        city: pgs.city,
        state: pgs.state,
        pincode: pgs.pincode,
        genderPolicy: pgs.genderPolicy,
        isActive: pgs.isActive,
        // Correlated subqueries — `pgs.id` must be a qualified literal
        // (see notes above). The previous form `${pgs.id}` rendered as bare
        // `"id"`, which Postgres bound to the *inner* `floors.id` and made
        // every count silently 0.
        floorCount: sql<number>`(
          SELECT count(*)::int FROM ${floors}
          WHERE floors.pg_id = pgs.id AND floors.archived_at IS NULL
        )`,
        roomCount: sql<number>`(
          SELECT count(*)::int FROM ${rooms}
          JOIN ${floors} ON floors.id = rooms.floor_id
          WHERE floors.pg_id = pgs.id AND rooms.archived_at IS NULL
        )`,
        bedCount: sql<number>`(
          SELECT count(*)::int FROM ${beds}
          JOIN ${rooms} ON rooms.id = beds.room_id
          JOIN ${floors} ON floors.id = rooms.floor_id
          WHERE floors.pg_id = pgs.id AND beds.archived_at IS NULL
        )`,
      })
      .from(pgs)
      .where(sql`${pgs.archivedAt} IS NULL`)
      .orderBy(asc(pgs.name));
    return rows;
  });
}

// ───────────────────────────────────────────────────────────────────────────
// Floors
// ───────────────────────────────────────────────────────────────────────────

export type FloorListRow = {
  id: string;
  floorNumber: number;
  label: string | null;
  pgName: string;
  roomCount: number;
  bedCount: number;
};

export function listFloors(): Promise<QueryResult<FloorListRow[]>> {
  return guard(async () => {
    return await db
      .select({
        id: floors.id,
        floorNumber: floors.floorNumber,
        label: floors.label,
        pgName: pgs.name,
        roomCount: sql<number>`(
          SELECT count(*)::int FROM ${rooms}
          WHERE rooms.floor_id = floors.id AND rooms.archived_at IS NULL
        )`,
        bedCount: sql<number>`(
          SELECT count(*)::int FROM ${beds}
          JOIN ${rooms} ON rooms.id = beds.room_id
          WHERE rooms.floor_id = floors.id AND beds.archived_at IS NULL
        )`,
      })
      .from(floors)
      .innerJoin(pgs, eq(pgs.id, floors.pgId))
      .where(sql`${floors.archivedAt} IS NULL`)
      .orderBy(asc(pgs.name), asc(floors.floorNumber));
  });
}

// ───────────────────────────────────────────────────────────────────────────
// Rooms
// ───────────────────────────────────────────────────────────────────────────

export type RoomListRow = {
  id: string;
  roomNumber: string;
  roomType: string;
  capacity: number;
  hasAc: boolean;
  floorLabel: string;
  pgName: string;
  bedCount: number;
};

export function listRooms(): Promise<QueryResult<RoomListRow[]>> {
  return guard(async () => {
    return await db
      .select({
        id: rooms.id,
        roomNumber: rooms.roomNumber,
        roomType: roomTypes.name,
        capacity: roomTypes.defaultCapacity,
        hasAc: roomTypes.hasAc,
        floorLabel: sql<string>`coalesce(${floors.label}, 'Floor ' || ${floors.floorNumber})`,
        pgName: pgs.name,
        bedCount: sql<number>`(
          SELECT count(*)::int FROM ${beds}
          WHERE beds.room_id = rooms.id AND beds.archived_at IS NULL
        )`,
      })
      .from(rooms)
      .innerJoin(roomTypes, eq(roomTypes.id, rooms.roomTypeId))
      .innerJoin(floors, eq(floors.id, rooms.floorId))
      .innerJoin(pgs, eq(pgs.id, floors.pgId))
      .where(sql`${rooms.archivedAt} IS NULL`)
      .orderBy(asc(pgs.name), asc(floors.floorNumber), asc(rooms.roomNumber));
  });
}

// ───────────────────────────────────────────────────────────────────────────
// Beds
// ───────────────────────────────────────────────────────────────────────────

export type BedListRow = {
  id: string;
  bedCode: string;
  status: 'available' | 'maintenance' | 'blocked';
  isOccupiedToday: boolean;
  roomNumber: string;
  roomType: string;
  floorLabel: string;
  pgName: string;
};

export function listBeds(): Promise<QueryResult<BedListRow[]>> {
  return guard(async () => {
    return await db
      .select({
        id: beds.id,
        bedCode: beds.bedCode,
        status: beds.status,
        isOccupiedToday: sql<boolean>`EXISTS (
          SELECT 1 FROM ${bedReservations} r
          WHERE r.bed_id = beds.id
            AND r.status = 'active'
            AND CURRENT_DATE <@ r.stay_range
        )`,
        roomNumber: rooms.roomNumber,
        roomType: roomTypes.name,
        floorLabel: sql<string>`coalesce(${floors.label}, 'Floor ' || ${floors.floorNumber})`,
        pgName: pgs.name,
      })
      .from(beds)
      .innerJoin(rooms, eq(rooms.id, beds.roomId))
      .innerJoin(roomTypes, eq(roomTypes.id, rooms.roomTypeId))
      .innerJoin(floors, eq(floors.id, rooms.floorId))
      .innerJoin(pgs, eq(pgs.id, floors.pgId))
      .where(sql`${beds.archivedAt} IS NULL`)
      .orderBy(asc(pgs.name), asc(floors.floorNumber), asc(rooms.roomNumber), asc(beds.bedCode));
  });
}

// ───────────────────────────────────────────────────────────────────────────
// Pricing
// ───────────────────────────────────────────────────────────────────────────

export type PricingListRow = {
  id: string;
  bedCode: string;
  roomNumber: string;
  roomType: string;
  pgName: string;
  dailyRatePaise: number;
  weeklyRatePaise: number;
  monthlyRatePaise: number;
  securityDepositPaise: number;
  effectiveFrom: string;
  effectiveTo: string | null;
};

export function listPricing(): Promise<QueryResult<PricingListRow[]>> {
  return guard(async () => {
    return await db
      .select({
        id: bedPrices.id,
        bedCode: beds.bedCode,
        roomNumber: rooms.roomNumber,
        roomType: roomTypes.name,
        pgName: pgs.name,
        dailyRatePaise: bedPrices.dailyRatePaise,
        weeklyRatePaise: bedPrices.weeklyRatePaise,
        monthlyRatePaise: bedPrices.monthlyRatePaise,
        securityDepositPaise: bedPrices.securityDepositPaise,
        effectiveFrom: bedPrices.effectiveFrom,
        effectiveTo: bedPrices.effectiveTo,
      })
      .from(bedPrices)
      .innerJoin(beds, eq(beds.id, bedPrices.bedId))
      .innerJoin(rooms, eq(rooms.id, beds.roomId))
      .innerJoin(roomTypes, eq(roomTypes.id, rooms.roomTypeId))
      .innerJoin(floors, eq(floors.id, rooms.floorId))
      .innerJoin(pgs, eq(pgs.id, floors.pgId))
      .orderBy(asc(pgs.name), asc(rooms.roomNumber), asc(beds.bedCode));
  });
}

/**
 * Pricing summary used by the Pricing page header — gives a per-room-type
 * "from ₹X/mo" so admins can see tier structure at a glance without scrolling
 * through 48 rows.
 */
export type PricingTierRow = {
  roomType: string;
  capacity: number;
  hasAc: boolean;
  bedCount: number;
  dailyRatePaise: number;
  weeklyRatePaise: number;
  monthlyRatePaise: number;
};

export function listPricingTiers(): Promise<QueryResult<PricingTierRow[]>> {
  return guard(async () => {
    return await db
      .select({
        roomType: roomTypes.name,
        capacity: roomTypes.defaultCapacity,
        hasAc: roomTypes.hasAc,
        // Qualify `beds.id` literally — the surrounding LEFT JOIN brings
        // multiple tables with `id` columns into scope.
        bedCount: sql<number>`count(beds.id)::int`,
        dailyRatePaise: sql<number>`min(${bedPrices.dailyRatePaise})::bigint::int`,
        weeklyRatePaise: sql<number>`min(${bedPrices.weeklyRatePaise})::bigint::int`,
        monthlyRatePaise: sql<number>`min(${bedPrices.monthlyRatePaise})::bigint::int`,
      })
      .from(roomTypes)
      .leftJoin(rooms, eq(rooms.roomTypeId, roomTypes.id))
      .leftJoin(beds, and(eq(beds.roomId, rooms.id), sql`${beds.archivedAt} IS NULL`))
      .leftJoin(bedPrices, eq(bedPrices.bedId, beds.id))
      .groupBy(roomTypes.id, roomTypes.name, roomTypes.defaultCapacity, roomTypes.hasAc)
      .orderBy(asc(roomTypes.defaultCapacity));
  });
}

// ───────────────────────────────────────────────────────────────────────────
// Residents / Bookings / Payments / Extensions  (all empty until Phase 3+)
// ───────────────────────────────────────────────────────────────────────────

export type ResidentListRow = {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  gender: 'male' | 'female' | 'other';
  kycStatus: 'pending' | 'approved' | 'rejected';
  createdAt: Date;
};

export function listResidents(): Promise<QueryResult<ResidentListRow[]>> {
  return guard(async () => {
    return await db
      .select({
        id: customers.id,
        fullName: customers.fullName,
        email: customers.email,
        phone: customers.phone,
        gender: customers.gender,
        kycStatus: customers.kycStatus,
        createdAt: customers.createdAt,
      })
      .from(customers)
      .where(
        and(
          ne(customers.phone, OCCUPANCY_PLACEHOLDER_PHONE),
          ne(customers.email, OCCUPANCY_PLACEHOLDER_EMAIL),
          ne(customers.fullName, OCCUPANCY_PLACEHOLDER_NAME),
        ),
      )
      .orderBy(desc(customers.createdAt))
      .limit(100);
  });
}

export type BookingListRow = {
  id: string;
  bookingCode: string;
  customerName: string;
  status: string;
  durationMode: string;
  totalPaise: number;
  expectedCheckoutDate: string | null;
  createdAt: Date;
};

export function listBookings(): Promise<QueryResult<BookingListRow[]>> {
  return guard(async () => {
    return await db
      .select({
        id: bookings.id,
        bookingCode: bookings.bookingCode,
        customerName: customers.fullName,
        status: bookings.status,
        durationMode: bookings.durationMode,
        totalPaise: bookings.totalPaise,
        expectedCheckoutDate: bookings.expectedCheckoutDate,
        createdAt: bookings.createdAt,
      })
      .from(bookings)
      .innerJoin(customers, eq(customers.id, bookings.customerId))
      .orderBy(desc(bookings.createdAt))
      .limit(100);
  });
}

export type AdminBookingDetail = {
  id: string;
  bookingCode: string;
  status: string;
  durationMode: string;
  stayType: string;
  expectedCheckoutDate: string | null;
  subtotalPaise: number;
  depositPaise: number;
  totalPaise: number;
  discountPaise: number;
  pricingSnapshot: PricingSnapshot | null;
  notes: string | null;
  adminDuesStatus: 'unknown' | 'cleared' | 'has_dues';
  adminDepositRefundStatus:
    | 'unknown'
    | 'pending'
    | 'refunded'
    | 'blocked'
    | 'not_applicable';
  adminOpsNotes: string | null;
  cancelledAt: Date | null;
  cancellationReason: string | null;
  createdAt: Date;
  createdVia: string;
  customer: {
    id: string;
    fullName: string;
    email: string;
    phone: string;
    gender: string;
  };
  reservations: Array<{
    id: string;
    bedId: string;
    bedCode: string;
    roomNumber: string;
    floorLabel: string;
    pgName: string;
    stayRange: string;
    status: string;
    bedInventoryStatus: 'available' | 'maintenance' | 'blocked';
    /** Phase 5 — `primary` for original reservations, `extension` for extensions. */
    kind: string;
    parentReservationId: string | null;
    holdExpiresAt: Date | null;
  }>;
  payments: Array<{
    id: string;
    purpose: string;
    provider: string;
    providerPaymentId: string | null;
    amountPaise: number;
    currency: string;
    status: string;
    paidAt: Date | null;
    createdAt: Date;
  }>;
  /** Phase 5 — every extension recorded against this booking, newest first. */
  extensions: Array<{
    id: string;
    status: string;
    requestedBy: string;
    requestedUntilDate: string;
    extensionDurationMode: string;
    quotedTotalPaise: number;
    paymentId: string | null;
    bedCount: number;
    createdAt: Date;
    updatedAt: Date;
  }>;
};

export function getAdminBookingDetail(
  bookingId: string,
): Promise<QueryResult<AdminBookingDetail | null>> {
  return guard(async () => {
    const [b] = await db
      .select({
        id: bookings.id,
        bookingCode: bookings.bookingCode,
        status: bookings.status,
        durationMode: bookings.durationMode,
        stayType: bookings.stayType,
        expectedCheckoutDate: bookings.expectedCheckoutDate,
        subtotalPaise: bookings.subtotalPaise,
        depositPaise: bookings.depositPaise,
        totalPaise: bookings.totalPaise,
        discountPaise: bookings.discountPaise,
        pricingSnapshot: bookings.pricingSnapshot,
        notes: bookings.notes,
        adminDuesStatus: bookings.adminDuesStatus,
        adminDepositRefundStatus: bookings.adminDepositRefundStatus,
        adminOpsNotes: bookings.adminOpsNotes,
        cancelledAt: bookings.cancelledAt,
        cancellationReason: bookings.cancellationReason,
        createdAt: bookings.createdAt,
        createdVia: bookings.createdVia,
        customerId: customers.id,
        customerFullName: customers.fullName,
        customerEmail: customers.email,
        customerPhone: customers.phone,
        customerGender: customers.gender,
      })
      .from(bookings)
      .innerJoin(customers, eq(customers.id, bookings.customerId))
      .where(eq(bookings.id, bookingId))
      .limit(1);
    if (!b) return null;

    const resv = await db
      .select({
        id: bedReservations.id,
        bedId: beds.id,
        bedCode: beds.bedCode,
        bedInventoryStatus: beds.status,
        roomNumber: rooms.roomNumber,
        floorLabel: sql<string>`coalesce(${floors.label}, 'Floor ' || ${floors.floorNumber})`,
        pgName: pgs.name,
        stayRange: bedReservations.stayRange,
        status: bedReservations.status,
        kind: bedReservations.kind,
        parentReservationId: bedReservations.parentReservationId,
        holdExpiresAt: bedReservations.holdExpiresAt,
      })
      .from(bedReservations)
      .innerJoin(beds, eq(beds.id, bedReservations.bedId))
      .innerJoin(rooms, eq(rooms.id, beds.roomId))
      .innerJoin(floors, eq(floors.id, rooms.floorId))
      .innerJoin(pgs, eq(pgs.id, floors.pgId))
      .where(eq(bedReservations.bookingId, bookingId))
      .orderBy(asc(bedReservations.kind), asc(beds.bedCode));

    const exts = await db
      .select({
        id: stayExtensions.id,
        status: stayExtensions.status,
        requestedBy: stayExtensions.requestedBy,
        requestedUntilDate: stayExtensions.requestedUntilDate,
        extensionDurationMode: stayExtensions.extensionDurationMode,
        quotedTotalPaise: stayExtensions.quotedTotalPaise,
        paymentId: stayExtensions.paymentId,
        bedCount: sql<number>`coalesce(array_length(${stayExtensions.newReservationIds}, 1), 0)::int`,
        createdAt: stayExtensions.createdAt,
        updatedAt: stayExtensions.updatedAt,
      })
      .from(stayExtensions)
      .where(eq(stayExtensions.bookingId, bookingId))
      .orderBy(desc(stayExtensions.createdAt));

    const pays = await db
      .select({
        id: payments.id,
        purpose: payments.purpose,
        provider: payments.provider,
        providerPaymentId: payments.providerPaymentId,
        amountPaise: payments.amountPaise,
        currency: payments.currency,
        status: payments.status,
        paidAt: payments.paidAt,
        createdAt: payments.createdAt,
      })
      .from(payments)
      .where(eq(payments.bookingId, bookingId))
      .orderBy(desc(payments.createdAt));

    return {
      id: b.id,
      bookingCode: b.bookingCode,
      status: b.status,
      durationMode: b.durationMode,
      stayType: b.stayType,
      expectedCheckoutDate: b.expectedCheckoutDate,
      subtotalPaise: b.subtotalPaise,
      depositPaise: b.depositPaise,
      totalPaise: b.totalPaise,
      discountPaise: b.discountPaise,
      pricingSnapshot: b.pricingSnapshot,
      notes: b.notes,
      adminDuesStatus: b.adminDuesStatus,
      adminDepositRefundStatus: b.adminDepositRefundStatus,
      adminOpsNotes: b.adminOpsNotes,
      cancelledAt: b.cancelledAt,
      cancellationReason: b.cancellationReason,
      createdAt: b.createdAt,
      createdVia: b.createdVia,
      customer: {
        id: b.customerId,
        fullName: b.customerFullName,
        email: b.customerEmail,
        phone: b.customerPhone,
        gender: b.customerGender,
      },
      reservations: resv.map((r) => ({
        id: r.id,
        bedId: r.bedId,
        bedCode: r.bedCode,
        bedInventoryStatus: r.bedInventoryStatus,
        roomNumber: r.roomNumber,
        floorLabel: r.floorLabel,
        pgName: r.pgName,
        stayRange: r.stayRange as unknown as string,
        status: r.status,
        kind: r.kind,
        parentReservationId: r.parentReservationId,
        holdExpiresAt: r.holdExpiresAt,
      })),
      payments: pays.map((p) => ({
        id: p.id,
        purpose: p.purpose,
        provider: p.provider,
        providerPaymentId: p.providerPaymentId,
        amountPaise: p.amountPaise,
        currency: p.currency,
        status: p.status,
        paidAt: p.paidAt,
        createdAt: p.createdAt,
      })),
      extensions: exts.map((e) => ({
        id: e.id,
        status: e.status,
        requestedBy: e.requestedBy,
        requestedUntilDate: e.requestedUntilDate,
        extensionDurationMode: e.extensionDurationMode,
        quotedTotalPaise: e.quotedTotalPaise,
        paymentId: e.paymentId,
        bedCount: e.bedCount,
        createdAt: e.createdAt,
        updatedAt: e.updatedAt,
      })),
    };
  });
}

export type PaymentListRow = {
  id: string;
  bookingCode: string;
  purpose: string;
  provider: string;
  amountPaise: number;
  currency: string;
  status: string;
  paidAt: Date | null;
};

export function listPayments(): Promise<QueryResult<PaymentListRow[]>> {
  return guard(async () => {
    return await db
      .select({
        id: payments.id,
        bookingCode: bookings.bookingCode,
        purpose: payments.purpose,
        provider: payments.provider,
        amountPaise: payments.amountPaise,
        currency: payments.currency,
        status: payments.status,
        paidAt: payments.paidAt,
      })
      .from(payments)
      .innerJoin(bookings, eq(bookings.id, payments.bookingId))
      .orderBy(desc(payments.createdAt))
      .limit(100);
  });
}

export type ExtensionListRow = {
  id: string;
  bookingId: string;
  bookingCode: string;
  customerFullName: string;
  customerPhone: string;
  requestedBy: string;
  requestedUntilDate: string;
  extensionDurationMode: string;
  status: string;
  quotedTotalPaise: number;
  bedCount: number;
  createdAt: Date;
  updatedAt: Date;
};

export function listStayExtensions(filter?: {
  status?: 'pending' | 'approved' | 'paid' | 'rejected' | 'cancelled';
}): Promise<QueryResult<ExtensionListRow[]>> {
  return guard(async () => {
    const whereClause = filter?.status
      ? eq(stayExtensions.status, filter.status)
      : undefined;
    return await db
      .select({
        id: stayExtensions.id,
        bookingId: stayExtensions.bookingId,
        bookingCode: bookings.bookingCode,
        customerFullName: customers.fullName,
        customerPhone: customers.phone,
        requestedBy: stayExtensions.requestedBy,
        requestedUntilDate: stayExtensions.requestedUntilDate,
        extensionDurationMode: stayExtensions.extensionDurationMode,
        status: stayExtensions.status,
        quotedTotalPaise: stayExtensions.quotedTotalPaise,
        bedCount: sql<number>`coalesce(array_length(${stayExtensions.newReservationIds}, 1), 0)::int`,
        createdAt: stayExtensions.createdAt,
        updatedAt: stayExtensions.updatedAt,
      })
      .from(stayExtensions)
      .innerJoin(bookings, eq(bookings.id, stayExtensions.bookingId))
      .innerJoin(customers, eq(customers.id, bookings.customerId))
      .where(whereClause)
      .orderBy(desc(stayExtensions.createdAt))
      .limit(200);
  });
}

// ───────────────────────────────────────────────────────────────────────────
// Occupancy
// ───────────────────────────────────────────────────────────────────────────

export type OccupancyByPg = {
  pgId: string;
  pgName: string;
  totalBeds: number;
  occupiedBeds: number;
  availableBeds: number;
  blockedBeds: number;
  occupancyPct: number;
};

export function getOccupancyByPg(): Promise<QueryResult<OccupancyByPg[]>> {
  return guard(async () => {
    const pgRows = await db
      .select({
        pgId: pgs.id,
        pgName: pgs.name,
      })
      .from(pgs)
      .where(sql`${pgs.archivedAt} IS NULL`)
      .orderBy(asc(pgs.name));

    const countsByPg = await getOccupancyCountsByPg(pgRows.map((r) => r.pgId));

    return pgRows.map((row) => {
      const counts = countsByPg.get(row.pgId);
      return {
        pgId: row.pgId,
        pgName: row.pgName,
        totalBeds: counts?.totalBeds ?? 0,
        occupiedBeds: counts?.occupiedBeds ?? 0,
        availableBeds: counts?.openNowBeds ?? 0,
        blockedBeds: counts?.blockedBeds ?? 0,
        occupancyPct: counts?.occupancyPct ?? 0,
      };
    });
  });
}

export type PgBusinessMetrics = OccupancyByPg & {
  billingMonth: string;
  /** Approved QR rent/deposit/booking for the billing month. */
  incomeRentQrPaise: number;
  /** Paid rent invoices for the billing month. */
  incomeRentInvoicePaise: number;
  /** Total rent collected (QR + invoices). */
  incomeRentPaise: number;
  /** Approved QR electricity/daily/reservation for the billing month. */
  incomeElectricityQrPaise: number;
  /** Paid electricity invoices for the billing month. */
  incomeElectricityInvoicePaise: number;
  /** Total electricity collected (QR + invoices). */
  incomeElectricityPaise: number;
  incomeTotalPaise: number;
  /** Sum of monthly rent from active booking snapshots (admin overrides included). */
  expectedMonthlyRentPaise: number;
  /** Rent late fees collected (extra income). */
  lateFeePaise: number;
  /** 5-day vacating penalties kept from deposit (pure profit). */
  vacatingDeductionPaise: number;
  /** Other deposit deductions — damages, admin charges, etc. */
  otherDeductionPaise: number;
  /** Distinct bookings with a deposit refund issued this month. */
  depositRefundsCount: number;
  /** Cash returned to residents from deposits this month. */
  depositRefundsPaise: number;
};

export type BusinessMetricsSummary = {
  billingMonth: string;
  totalBeds: number;
  occupiedBeds: number;
  availableBeds: number;
  occupancyPct: number;
  incomeRentQrPaise: number;
  incomeRentInvoicePaise: number;
  incomeRentPaise: number;
  incomeElectricityQrPaise: number;
  incomeElectricityInvoicePaise: number;
  incomeElectricityPaise: number;
  incomeTotalPaise: number;
  expectedMonthlyRentPaise: number;
  lateFeePaise: number;
  vacatingDeductionPaise: number;
  otherDeductionPaise: number;
  depositRefundsCount: number;
  depositRefundsPaise: number;
  /** Late fees on paid rent invoices. */
  extraIncomePaise: number;
};

function normalizePgBusinessMetrics(
  row: Omit<PgBusinessMetrics, 'billingMonth'> & { billingMonth?: string },
  billingMonth: string,
): PgBusinessMetrics {
  return {
    pgId: row.pgId,
    pgName: row.pgName,
    totalBeds: asPlainNumber(row.totalBeds),
    occupiedBeds: asPlainNumber(row.occupiedBeds),
    availableBeds: asPlainNumber(row.availableBeds),
    blockedBeds: asPlainNumber(row.blockedBeds),
    occupancyPct: asPlainNumber(row.occupancyPct),
    billingMonth,
    incomeRentQrPaise: asPlainNumber(row.incomeRentQrPaise),
    incomeRentInvoicePaise: asPlainNumber(row.incomeRentInvoicePaise),
    incomeRentPaise: asPlainNumber(row.incomeRentPaise),
    incomeElectricityQrPaise: asPlainNumber(row.incomeElectricityQrPaise),
    incomeElectricityInvoicePaise: asPlainNumber(row.incomeElectricityInvoicePaise),
    incomeElectricityPaise: asPlainNumber(row.incomeElectricityPaise),
    incomeTotalPaise: asPlainNumber(row.incomeTotalPaise),
    expectedMonthlyRentPaise: asPlainNumber(row.expectedMonthlyRentPaise),
    lateFeePaise: asPlainNumber(row.lateFeePaise),
    vacatingDeductionPaise: asPlainNumber(row.vacatingDeductionPaise),
    otherDeductionPaise: asPlainNumber(row.otherDeductionPaise),
    depositRefundsCount: asPlainNumber(row.depositRefundsCount),
    depositRefundsPaise: asPlainNumber(row.depositRefundsPaise),
  };
}

function normalizeBusinessMetricsSummary(
  summary: Omit<BusinessMetricsSummary, 'extraIncomePaise'> & { extraIncomePaise?: number },
): BusinessMetricsSummary {
  const lateFeePaise = asPlainNumber(summary.lateFeePaise);
  const vacatingDeductionPaise = asPlainNumber(summary.vacatingDeductionPaise);
  const otherDeductionPaise = asPlainNumber(summary.otherDeductionPaise);
  return {
    billingMonth: summary.billingMonth,
    totalBeds: asPlainNumber(summary.totalBeds),
    occupiedBeds: asPlainNumber(summary.occupiedBeds),
    availableBeds: asPlainNumber(summary.availableBeds),
    occupancyPct: asPlainNumber(summary.occupancyPct),
    incomeRentQrPaise: asPlainNumber(summary.incomeRentQrPaise),
    incomeRentInvoicePaise: asPlainNumber(summary.incomeRentInvoicePaise),
    incomeRentPaise: asPlainNumber(summary.incomeRentPaise),
    incomeElectricityQrPaise: asPlainNumber(summary.incomeElectricityQrPaise),
    incomeElectricityInvoicePaise: asPlainNumber(summary.incomeElectricityInvoicePaise),
    incomeElectricityPaise: asPlainNumber(summary.incomeElectricityPaise),
    incomeTotalPaise: asPlainNumber(summary.incomeTotalPaise),
    expectedMonthlyRentPaise: asPlainNumber(summary.expectedMonthlyRentPaise),
    lateFeePaise,
    vacatingDeductionPaise,
    otherDeductionPaise,
    depositRefundsCount: asPlainNumber(summary.depositRefundsCount),
    depositRefundsPaise: asPlainNumber(summary.depositRefundsPaise),
    extraIncomePaise: lateFeePaise,
  };
}

export function getPgBusinessMetrics(
  billingMonthInput?: string,
): Promise<QueryResult<PgBusinessMetrics[]>> {
  return guard(async () => {
    const billingMonth = resolveBillingMonth(billingMonthInput);
    const invoiceFilters = productionInvoiceBookingFilters();

    const [occupancy, rentPaidRows, elecPaidRows, lateFeeRows] = await Promise.all([
      getOccupancyByPg(),
      db
        .select({
          pgId: rentInvoices.pgId,
          total: sql<number>`coalesce(sum(${rentInvoices.paidPrincipalPaise} + ${rentInvoices.paidLateFeePaise}), 0)::bigint::int`,
        })
        .from(rentInvoices)
        .innerJoin(bookings, eq(bookings.id, rentInvoices.bookingId))
        .innerJoin(customers, eq(customers.id, rentInvoices.customerId))
        .where(
          and(
            eq(rentInvoices.status, 'paid'),
            eq(rentInvoices.billingMonth, billingMonth),
            invoiceFilters,
          ),
        )
        .groupBy(rentInvoices.pgId),
      db.execute<{ pg_id: string; total: number }>(sql`
        SELECT
          eb.pg_id::text AS pg_id,
          coalesce(sum(ei.paid_paise), 0)::bigint::int AS total
        FROM electricity_invoices ei
        INNER JOIN electricity_bills eb ON eb.id = ei.electricity_bill_id
        INNER JOIN bookings bk ON bk.id = ei.booking_id
        INNER JOIN customers c ON c.id = ei.customer_id
        WHERE ei.status = 'paid'
          AND ei.billing_month = ${billingMonth}::date
          AND bk.is_test = false
          AND c.is_test = false
        GROUP BY eb.pg_id
      `),
      db
        .select({
          pgId: rentInvoices.pgId,
          total: sql<number>`coalesce(sum(${rentInvoices.paidLateFeePaise}), 0)::bigint::int`,
        })
        .from(rentInvoices)
        .innerJoin(bookings, eq(bookings.id, rentInvoices.bookingId))
        .innerJoin(customers, eq(customers.id, rentInvoices.customerId))
        .where(
          and(
            eq(rentInvoices.status, 'paid'),
            eq(rentInvoices.billingMonth, billingMonth),
            invoiceFilters,
          ),
        )
        .groupBy(rentInvoices.pgId),
    ]);

    if (!occupancy.ok) throw new Error(occupancy.error);

    const rentMap = new Map(rentPaidRows.map((r) => [r.pgId, asPlainNumber(r.total)]));
    const elecMap = new Map(
      Array.from(elecPaidRows).map((r) => [r.pg_id, asPlainNumber(r.total)]),
    );
    const lateFeeMap = new Map(lateFeeRows.map((r) => [r.pgId, r.total]));

    return occupancy.data.map((row) => {
      const incomeRentInvoicePaise = asPlainNumber(rentMap.get(row.pgId));
      const incomeElectricityInvoicePaise = asPlainNumber(elecMap.get(row.pgId));
      return normalizePgBusinessMetrics(
        {
          ...row,
          incomeRentQrPaise: 0,
          incomeRentInvoicePaise,
          incomeRentPaise: incomeRentInvoicePaise,
          incomeElectricityQrPaise: 0,
          incomeElectricityInvoicePaise,
          incomeElectricityPaise: incomeElectricityInvoicePaise,
          incomeTotalPaise: incomeRentInvoicePaise + incomeElectricityInvoicePaise,
          expectedMonthlyRentPaise: 0,
          lateFeePaise: asPlainNumber(lateFeeMap.get(row.pgId)),
          vacatingDeductionPaise: 0,
          otherDeductionPaise: 0,
          depositRefundsCount: 0,
          depositRefundsPaise: 0,
        },
        billingMonth,
      );
    });
  });
}

export function getBusinessMetricsSummary(
  billingMonthInput?: string,
): Promise<QueryResult<BusinessMetricsSummary>> {
  return guard(async () => {
    const billingMonth = resolveBillingMonth(billingMonthInput);
    const [rows, depositRefunds] = await Promise.all([
      getPgBusinessMetrics(billingMonth),
      import('@/src/services/depositLedgerMetrics').then((m) =>
        m.getDepositRefundsForBillingMonth(billingMonth),
      ),
    ]);
    if (!rows.ok) throw new Error(rows.error);

    const totalBeds = rows.data.reduce((a, r) => a + r.totalBeds, 0);
    const occupiedBeds = rows.data.reduce((a, r) => a + r.occupiedBeds, 0);
    const availableBeds = rows.data.reduce((a, r) => a + r.availableBeds, 0);
    const occupancyPct =
      totalBeds === 0 ? 0 : Math.round((occupiedBeds / totalBeds) * 1000) / 10;

    return normalizeBusinessMetricsSummary({
      billingMonth,
      totalBeds,
      occupiedBeds,
      availableBeds,
      occupancyPct,
      incomeRentQrPaise: rows.data.reduce((a, r) => a + r.incomeRentQrPaise, 0),
      incomeRentInvoicePaise: rows.data.reduce((a, r) => a + r.incomeRentInvoicePaise, 0),
      incomeRentPaise: rows.data.reduce((a, r) => a + r.incomeRentPaise, 0),
      incomeElectricityQrPaise: rows.data.reduce((a, r) => a + r.incomeElectricityQrPaise, 0),
      incomeElectricityInvoicePaise: rows.data.reduce(
        (a, r) => a + r.incomeElectricityInvoicePaise,
        0,
      ),
      incomeElectricityPaise: rows.data.reduce((a, r) => a + r.incomeElectricityPaise, 0),
      incomeTotalPaise: rows.data.reduce((a, r) => a + r.incomeTotalPaise, 0),
      expectedMonthlyRentPaise: rows.data.reduce((a, r) => a + r.expectedMonthlyRentPaise, 0),
      lateFeePaise: rows.data.reduce((a, r) => a + r.lateFeePaise, 0),
      vacatingDeductionPaise: rows.data.reduce((a, r) => a + r.vacatingDeductionPaise, 0),
      otherDeductionPaise: rows.data.reduce((a, r) => a + r.otherDeductionPaise, 0),
      depositRefundsCount: depositRefunds.count,
      depositRefundsPaise: depositRefunds.paise,
    });
  });
}

export type CollectionBreakdown = {
  rentPaise: number;
  electricityPaise: number;
  depositPaise: number;
  totalPaise: number;
};

export type CollectionByPaymentMode = {
  upiPaise: number;
  cashPaise: number;
  bankTransferPaise: number;
  otherPaise: number;
  totalPaise: number;
};

function billingMonthDateRange(billingMonthInput?: string): { start: string; end: string } {
  const billingMonth = resolveBillingMonth(billingMonthInput);
  const [y, m] = billingMonth.slice(0, 7).split('-').map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return {
    start: `${billingMonth.slice(0, 7)}-01`,
    end: `${billingMonth.slice(0, 7)}-${String(lastDay).padStart(2, '0')}`,
  };
}

/** MTD collections grouped by payment mode — includes cash; excludes test bookings. */
export function getMtdCollectionByPaymentMode(
  billingMonthInput?: string,
): Promise<QueryResult<CollectionByPaymentMode>> {
  return guard(async () => {
    const { start, end } = billingMonthDateRange(billingMonthInput);

    const rows = await db
      .select({
        provider: payments.provider,
        total: sql<number>`coalesce(sum(${payments.amountPaise}), 0)::bigint::int`,
      })
      .from(payments)
      .innerJoin(bookings, eq(bookings.id, payments.bookingId))
      .innerJoin(customers, eq(customers.id, bookings.customerId))
      .where(
        and(
          eq(payments.status, 'succeeded'),
          sql`${payments.paidAt}::date >= ${start}::date`,
          sql`${payments.paidAt}::date <= ${end}::date`,
          eq(bookings.isTest, false),
          eq(customers.isTest, false),
        ),
      )
      .groupBy(payments.provider);

    let upiPaise = 0;
    let cashPaise = 0;
    let bankTransferPaise = 0;
    let otherPaise = 0;

    for (const row of rows) {
      const amt = asPlainNumber(row.total);
      if (row.provider === 'cash') cashPaise += amt;
      else if (row.provider === 'bank_transfer') bankTransferPaise += amt;
      else if (
        row.provider === 'upi_manual' ||
        row.provider === 'razorpay' ||
        row.provider === 'stripe'
      ) {
        upiPaise += amt;
      } else {
        otherPaise += amt;
      }
    }

    return {
      upiPaise,
      cashPaise,
      bankTransferPaise,
      otherPaise,
      totalPaise: upiPaise + cashPaise + bankTransferPaise + otherPaise,
    };
  });
}

export type DepositCollectedByPgRow = {
  pgId: string;
  collectedPaise: number;
};

/** Calendar-day collections — paid invoices + deposit wallet only (no QR logs). */
export function getDailyCollectionTotals(
  dateInput?: string,
): Promise<QueryResult<CollectionBreakdown>> {
  return guard(async () => {
    const date = dateInput ?? todayString();
    const invoiceFilters = productionInvoiceBookingFilters();

    const [rentInvRow, elecInvRow, depositRow] = await Promise.all([
      db
        .select({
          total: sql<number>`coalesce(sum(${rentInvoices.paidPrincipalPaise} + ${rentInvoices.paidLateFeePaise}), 0)::bigint::int`,
        })
        .from(rentInvoices)
        .innerJoin(bookings, eq(bookings.id, rentInvoices.bookingId))
        .innerJoin(customers, eq(customers.id, rentInvoices.customerId))
        .where(
          and(
            eq(rentInvoices.status, 'paid'),
            sql`${rentInvoices.paidAt}::date = ${date}::date`,
            invoiceFilters,
          ),
        ),
      db
        .select({
          total: sql<number>`coalesce(sum(${electricityInvoices.paidPaise}), 0)::bigint::int`,
        })
        .from(electricityInvoices)
        .innerJoin(bookings, eq(bookings.id, electricityInvoices.bookingId))
        .innerJoin(customers, eq(customers.id, electricityInvoices.customerId))
        .where(
          and(
            eq(electricityInvoices.status, 'paid'),
            sql`${electricityInvoices.paidAt}::date = ${date}::date`,
            invoiceFilters,
          ),
        ),
      db
        .select({
          total: sql<number>`coalesce(sum(${depositLedger.amountPaise}), 0)::bigint::int`,
        })
        .from(depositLedger)
        .innerJoin(bookings, eq(bookings.id, depositLedger.bookingId))
        .innerJoin(customers, eq(customers.id, depositLedger.customerId))
        .where(
          and(
            eq(depositLedger.entryKind, 'collected'),
            sql`${depositLedger.createdAt}::date = ${date}::date`,
            eq(bookings.isTest, false),
            eq(customers.isTest, false),
          ),
        ),
    ]);

    const rentPaise = asPlainNumber(rentInvRow[0]?.total);
    const electricityPaise = asPlainNumber(elecInvRow[0]?.total);
    const depositPaise = asPlainNumber(depositRow[0]?.total);

    return {
      rentPaise,
      electricityPaise,
      depositPaise,
      totalPaise: rentPaise + electricityPaise + depositPaise,
    };
  });
}

/** Deposit collected per PG for a billing month — deposit_ledger only (production). */
export function getDepositCollectedByPgForBillingMonth(
  billingMonthInput?: string,
): Promise<QueryResult<DepositCollectedByPgRow[]>> {
  return guard(async () => {
    const { getDepositCollectedByPgFromLedger } = await import(
      '@/src/services/depositLedgerMetrics'
    );
    return getDepositCollectedByPgFromLedger(billingMonthInput);
  });
}

export type OccupancyByFloor = {
  pgName: string;
  floorNumber: number;
  floorLabel: string;
  totalBeds: number;
  occupiedBeds: number;
  occupancyPct: number;
};

export function getOccupancyByFloor(): Promise<QueryResult<OccupancyByFloor[]>> {
  return guard(async () => {
    const floorRows = await db
      .select({
        floorId: floors.id,
        pgName: pgs.name,
        floorNumber: floors.floorNumber,
        floorLabel: sql<string>`coalesce(${floors.label}, 'Floor ' || ${floors.floorNumber})`,
      })
      .from(floors)
      .innerJoin(pgs, eq(pgs.id, floors.pgId))
      .where(sql`${floors.archivedAt} IS NULL AND ${pgs.archivedAt} IS NULL`)
      .orderBy(asc(pgs.name), asc(floors.floorNumber));

    const bedRows = await fetchBedOccupancyRows({});
    const resolved = resolveBedOccupancyRows(bedRows);
    const byFloor = new Map<string, typeof resolved>();
    for (let i = 0; i < bedRows.length; i += 1) {
      const floorId = bedRows[i].floorId;
      if (!floorId) continue;
      const list = byFloor.get(floorId) ?? [];
      list.push(resolved[i]);
      byFloor.set(floorId, list);
    }

    return floorRows.map((floor) => {
      const counts = aggregateOccupancyCounts(byFloor.get(floor.floorId) ?? []);
      return {
        pgName: floor.pgName,
        floorNumber: floor.floorNumber,
        floorLabel: floor.floorLabel,
        totalBeds: counts.totalBeds,
        occupiedBeds: counts.occupiedBeds,
        occupancyPct: counts.occupancyPct,
      };
    });
  });
}

// ───────────────────────────────────────────────────────────────────────────
// Settings  — read-only view of the seeded PGs
// ───────────────────────────────────────────────────────────────────────────

export type SettingsRow = {
  id: string;
  name: string;
  slug: string;
  city: string;
  state: string;
  pincode: string;
  genderPolicy: 'male' | 'female' | 'coed';
  amenities: Record<string, unknown>;
  description: string | null;
  isActive: boolean;
};

export function listPgSettings(): Promise<QueryResult<SettingsRow[]>> {
  return guard(async () => {
    return await db
      .select({
        id: pgs.id,
        name: pgs.name,
        slug: pgs.slug,
        city: pgs.city,
        state: pgs.state,
        pincode: pgs.pincode,
        genderPolicy: pgs.genderPolicy,
        amenities: pgs.amenities,
        description: pgs.description,
        isActive: pgs.isActive,
      })
      .from(pgs)
      .where(sql`${pgs.archivedAt} IS NULL`)
      .orderBy(asc(pgs.name));
  });
}

// Used by the TopNav to show the active PG name.
export function getPrimaryPgName(): Promise<QueryResult<string | null>> {
  return guard(async () => {
    const [row] = await db
      .select({ name: pgs.name })
      .from(pgs)
      .where(sql`${pgs.archivedAt} IS NULL`)
      .orderBy(asc(pgs.name))
      .limit(1);
    return row?.name ?? null;
  });
}

// ───────────────────────────────────────────────────────────────────────────
// Phase 5.5 — resident billing reads (admin-facing)
// ───────────────────────────────────────────────────────────────────────────

export type AdminRentInvoiceRow = {
  id: string;
  invoiceNumber: string;
  bookingId: string;
  bookingCode: string;
  customerId: string;
  customerFullName: string;
  customerPhone: string;
  pgId: string;
  pgName: string;
  bedCode: string;
  roomNumber: string;
  billingMonth: string;
  dueDate: string;
  rentPaise: number;
  discountPaise: number;
  paidPrincipalPaise: number;
  paidLateFeePaise: number;
  lateFeeLockedPaise: number | null;
  status: 'pending' | 'payment_in_progress' | 'paid' | 'overdue' | 'expired' | 'cancelled';
  paidAt: Date | null;
  createdAt: Date;
  notes: string | null;
  paymentProvider: string | null;
  /** SSOT outstanding including late fees and partial payments */
  outstandingPaise: number;
  effectiveStatus: string;
};

export function listAdminRentInvoices(
  filter?: {
    status?: 'pending' | 'paid' | 'overdue' | 'cancelled';
    pgId?: string;
    billingMonth?: string;
  },
): Promise<QueryResult<AdminRentInvoiceRow[]>> {
  return guard(async () => {
    const conditions = [collectibleResidentFilters()];
    if (filter?.status) conditions.push(eq(rentInvoices.status, filter.status));
    if (filter?.pgId) conditions.push(eq(rentInvoices.pgId, filter.pgId));
    if (filter?.billingMonth) conditions.push(eq(rentInvoices.billingMonth, filter.billingMonth));
    const where = and(...conditions);

    const rows = await db
      .select({
        id: rentInvoices.id,
        invoiceNumber: rentInvoices.invoiceNumber,
        bookingId: rentInvoices.bookingId,
        bookingCode: bookings.bookingCode,
        customerId: rentInvoices.customerId,
        customerFullName: customers.fullName,
        customerPhone: customers.phone,
        pgId: rentInvoices.pgId,
        pgName: pgs.name,
        bedId: rentInvoices.bedId,
        bedCode: beds.bedCode,
        roomNumber: rooms.roomNumber,
        billingMonth: rentInvoices.billingMonth,
        dueDate: rentInvoices.dueDate,
        rentPaise: rentInvoices.rentPaise,
        discountPaise: rentInvoices.discountPaise,
        paidPrincipalPaise: rentInvoices.paidPrincipalPaise,
        paidLateFeePaise: rentInvoices.paidLateFeePaise,
        lateFeeLockedPaise: rentInvoices.lateFeeLockedPaise,
        status: rentInvoices.status,
        paidAt: rentInvoices.paidAt,
        createdAt: rentInvoices.createdAt,
        notes: rentInvoices.notes,
        paymentProvider: payments.provider,
      })
      .from(rentInvoices)
      .innerJoin(bookings, eq(bookings.id, rentInvoices.bookingId))
      .innerJoin(customers, eq(customers.id, rentInvoices.customerId))
      .innerJoin(pgs, eq(pgs.id, rentInvoices.pgId))
      .innerJoin(beds, eq(beds.id, rentInvoices.bedId))
      .innerJoin(rooms, eq(rooms.id, beds.roomId))
      .leftJoin(payments, eq(payments.id, rentInvoices.paymentId))
      .where(where)
      .orderBy(desc(rentInvoices.billingMonth), desc(rentInvoices.createdAt));

    const { projectRentInvoiceAdminView } = await import('@/src/services/residentFinancialEngine');
    return rows.map((r) => {
      const projected = projectRentInvoiceAdminView({
        id: r.id,
        invoiceNumber: r.invoiceNumber,
        bookingId: r.bookingId,
        customerId: r.customerId,
        bedId: r.bedId,
        pgId: r.pgId,
        billingMonth: r.billingMonth,
        dueDate: r.dueDate,
        rentPaise: r.rentPaise,
        discountPaise: r.discountPaise,
        paidPrincipalPaise: r.paidPrincipalPaise,
        paidLateFeePaise: r.paidLateFeePaise,
        lateFeeLockedPaise: r.lateFeeLockedPaise,
        status: r.status,
        paidAt: r.paidAt,
        paymentId: null,
        paymentProofUrl: null,
        notes: null,
        cancelledAt: null,
        cancellationReason: null,
        isAdhoc: false,
        createdAt: r.createdAt,
        updatedAt: r.createdAt,
      });
      return {
        ...r,
        outstandingPaise: projected.outstandingPaise,
        effectiveStatus: projected.effectiveStatus,
      };
    });
  });
}

/** Unpaid rent invoices across pending, overdue, and payment_in_progress (awaiting admin review). */
export function listAdminOpenRentInvoices(filter?: {
  pgId?: string;
  billingMonth?: string;
}): Promise<QueryResult<AdminRentInvoiceRow[]>> {
  return guard(async () => {
    const conditions = [
      collectibleResidentFilters(),
      inArray(rentInvoices.status, ['pending', 'overdue', 'payment_in_progress']),
    ];
    if (filter?.pgId) conditions.push(eq(rentInvoices.pgId, filter.pgId));
    if (filter?.billingMonth) conditions.push(eq(rentInvoices.billingMonth, filter.billingMonth));

    const rows = await db
      .select({
        id: rentInvoices.id,
        invoiceNumber: rentInvoices.invoiceNumber,
        bookingId: rentInvoices.bookingId,
        bookingCode: bookings.bookingCode,
        customerId: rentInvoices.customerId,
        customerFullName: customers.fullName,
        customerPhone: customers.phone,
        pgId: rentInvoices.pgId,
        pgName: pgs.name,
        bedId: rentInvoices.bedId,
        bedCode: beds.bedCode,
        roomNumber: rooms.roomNumber,
        billingMonth: rentInvoices.billingMonth,
        dueDate: rentInvoices.dueDate,
        rentPaise: rentInvoices.rentPaise,
        discountPaise: rentInvoices.discountPaise,
        paidPrincipalPaise: rentInvoices.paidPrincipalPaise,
        paidLateFeePaise: rentInvoices.paidLateFeePaise,
        lateFeeLockedPaise: rentInvoices.lateFeeLockedPaise,
        status: rentInvoices.status,
        paidAt: rentInvoices.paidAt,
        createdAt: rentInvoices.createdAt,
        notes: rentInvoices.notes,
        paymentProvider: payments.provider,
        paymentProofUrl: rentInvoices.paymentProofUrl,
        proofSubmittedAt: rentInvoices.proofSubmittedAt,
        proofSnapshotOutstandingPaise: rentInvoices.proofSnapshotOutstandingPaise,
        proofSnapshotLateFeePaise: rentInvoices.proofSnapshotLateFeePaise,
        proofSnapshotPrincipalDuePaise: rentInvoices.proofSnapshotPrincipalDuePaise,
      })
      .from(rentInvoices)
      .innerJoin(bookings, eq(bookings.id, rentInvoices.bookingId))
      .innerJoin(customers, eq(customers.id, rentInvoices.customerId))
      .innerJoin(pgs, eq(pgs.id, rentInvoices.pgId))
      .innerJoin(beds, eq(beds.id, rentInvoices.bedId))
      .innerJoin(rooms, eq(rooms.id, beds.roomId))
      .leftJoin(payments, eq(payments.id, rentInvoices.paymentId))
      .where(and(...conditions))
      .orderBy(desc(rentInvoices.billingMonth), desc(rentInvoices.createdAt));

    const { projectRentInvoiceAdminView } = await import('@/src/services/residentFinancialEngine');
    return rows.map((r) => {
      const projected = projectRentInvoiceAdminView({
        id: r.id,
        invoiceNumber: r.invoiceNumber,
        bookingId: r.bookingId,
        customerId: r.customerId,
        bedId: r.bedId,
        pgId: r.pgId,
        billingMonth: r.billingMonth,
        dueDate: r.dueDate,
        rentPaise: r.rentPaise,
        discountPaise: r.discountPaise,
        paidPrincipalPaise: r.paidPrincipalPaise,
        paidLateFeePaise: r.paidLateFeePaise,
        lateFeeLockedPaise: r.lateFeeLockedPaise,
        status: r.status,
        paidAt: r.paidAt,
        paymentId: null,
        paymentProofUrl: r.paymentProofUrl,
        proofSubmittedAt: r.proofSubmittedAt,
        proofSnapshotOutstandingPaise: r.proofSnapshotOutstandingPaise,
        proofSnapshotLateFeePaise: r.proofSnapshotLateFeePaise,
        proofSnapshotPrincipalDuePaise: r.proofSnapshotPrincipalDuePaise,
        notes: r.notes,
        cancelledAt: null,
        cancellationReason: null,
        isAdhoc: false,
        createdAt: r.createdAt,
        updatedAt: r.createdAt,
      });
      return {
        ...r,
        outstandingPaise: projected.outstandingPaise,
        effectiveStatus: projected.effectiveStatus,
      };
    });
  });
}

export type RentStats = {
  pendingCount: number;
  overdueCount: number;
  paidCount: number;
  cancelledCount: number;
  totalRentPaise: number;
  collectedPaise: number;
  outstandingPaise: number;
};

export function getRentStats(): Promise<QueryResult<RentStats>> {
  return guard(async () => {
    const { loadRentInvoiceStats } = await import('@/src/services/financialSummaryService');
    return loadRentInvoiceStats();
  });
}

export type AdminElectricityBillRow = {
  id: string;
  pgName: string;
  roomNumber: string;
  billingMonth: string;
  unitsConsumed: string;
  ratePerUnitPaise: number;
  totalPaise: number;
  monthlyOccupantCount: number;
  perResidentPaise: number;
  roundingRemainderPaise: number;
  invoicesCount: number;
  invoicesPaidCount: number;
  createdAt: Date;
};

export function listAdminElectricityBills(filter?: {
  pgId?: string;
}): Promise<QueryResult<AdminElectricityBillRow[]>> {
  return guard(async () => {
    const where = filter?.pgId
      ? and(eq(electricityBills.pgId, filter.pgId), isProductionElectricityBillFilter())
      : isProductionElectricityBillFilter();
    return db
      .select({
        id: electricityBills.id,
        pgName: pgs.name,
        roomNumber: rooms.roomNumber,
        billingMonth: electricityBills.billingMonth,
        unitsConsumed: electricityBills.unitsConsumed,
        ratePerUnitPaise: electricityBills.ratePerUnitPaise,
        totalPaise: electricityBills.totalPaise,
        monthlyOccupantCount: electricityBills.monthlyOccupantCount,
        perResidentPaise: electricityBills.perResidentPaise,
        roundingRemainderPaise: electricityBills.roundingRemainderPaise,
        invoicesCount: sql<number>`(SELECT count(*)::int FROM electricity_invoices WHERE electricity_bill_id = ${electricityBills.id})`,
        invoicesPaidCount: sql<number>`(SELECT count(*)::int FROM electricity_invoices WHERE electricity_bill_id = ${electricityBills.id} AND status = 'paid')`,
        createdAt: electricityBills.createdAt,
      })
      .from(electricityBills)
      .innerJoin(rooms, eq(rooms.id, electricityBills.roomId))
      .innerJoin(pgs, eq(pgs.id, electricityBills.pgId))
      .where(where)
      .orderBy(desc(electricityBills.billingMonth), desc(electricityBills.createdAt));
  });
}

export type AdminElectricityInvoiceReminderRow = {
  id: string;
  invoiceNumber: string;
  customerId: string;
  customerFullName: string;
  customerPhone: string;
  pgId: string;
  pgName: string;
  roomNumber: string;
  billingMonth: string;
  dueDate: string;
  amountPaise: number;
  /** SSOT outstanding including late fees and partial payments */
  outstandingPaise: number;
  effectiveStatus: string;
  isOverdue: boolean;
  paymentProofUrl?: string | null;
  bookingId?: string;
};

/** Pending electricity invoices eligible for WhatsApp / email reminders. */
export function listAdminPaidElectricityInvoicesForMonth(
  billingMonthInput?: string,
  filter?: { pgId?: string },
): Promise<QueryResult<AdminElectricityInvoiceReminderRow[]>> {
  return guard(async () => {
    const billingMonth = resolveBillingMonth(billingMonthInput);
    const conditions = [
      eq(electricityInvoices.status, 'paid'),
      eq(electricityInvoices.billingMonth, billingMonth),
    ];
    if (filter?.pgId) conditions.push(eq(electricityBills.pgId, filter.pgId));

    const rows = await db
      .select({
        id: electricityInvoices.id,
        invoiceNumber: electricityInvoices.invoiceNumber,
        customerId: electricityInvoices.customerId,
        customerFullName: customers.fullName,
        customerPhone: customers.phone,
        pgId: electricityBills.pgId,
        pgName: pgs.name,
        roomNumber: rooms.roomNumber,
        billingMonth: electricityInvoices.billingMonth,
        dueDate: electricityInvoices.dueDate,
        amountPaise: sql<number>`(${electricityInvoices.paidPaise} + coalesce(${electricityInvoices.lateFeeLockedPaise}, 0))::bigint::int`,
      })
      .from(electricityInvoices)
      .innerJoin(electricityBills, eq(electricityBills.id, electricityInvoices.electricityBillId))
      .innerJoin(customers, eq(customers.id, electricityInvoices.customerId))
      .innerJoin(pgs, eq(pgs.id, electricityBills.pgId))
      .innerJoin(rooms, eq(rooms.id, electricityBills.roomId))
      .where(and(...conditions))
      .orderBy(desc(electricityInvoices.paidAt));

    return rows.map((r) => ({
      ...r,
      outstandingPaise: 0,
      effectiveStatus: 'paid',
      isOverdue: false,
    }));
  });
}

export function listAdminElectricityInvoicesForReminders(
  filter?: { pgId?: string },
): Promise<QueryResult<AdminElectricityInvoiceReminderRow[]>> {
  return guard(async () => {
    const conditions = [
      eq(electricityInvoices.status, 'pending'),
      isNull(electricityInvoices.supersededByInvoiceId),
    ];
    if (filter?.pgId) conditions.push(eq(electricityBills.pgId, filter.pgId));

    const paidBookingMonths = await db
      .select({
        bookingId: electricityInvoices.bookingId,
        billingMonth: electricityInvoices.billingMonth,
      })
      .from(electricityInvoices)
      .innerJoin(bookings, eq(bookings.id, electricityInvoices.bookingId))
      .innerJoin(customers, eq(customers.id, electricityInvoices.customerId))
      .where(and(eq(electricityInvoices.status, 'paid'), operationsElectricityInvoiceFilter()));

    const paidBookingMonthKeys = buildPaidElectricityBookingMonthKeys(paidBookingMonths);

    const rows = await db
      .select({
        invoice: electricityInvoiceLegacySelect,
        customerId: electricityInvoices.customerId,
        customerFullName: customers.fullName,
        customerPhone: customers.phone,
        pgId: electricityBills.pgId,
        pgName: pgs.name,
        roomNumber: rooms.roomNumber,
        bedCode: beds.bedCode,
      })
      .from(electricityInvoices)
      .innerJoin(electricityBills, eq(electricityBills.id, electricityInvoices.electricityBillId))
      .innerJoin(bookings, eq(bookings.id, electricityInvoices.bookingId))
      .innerJoin(customers, eq(customers.id, electricityInvoices.customerId))
      .innerJoin(beds, eq(beds.id, electricityInvoices.bedId))
      .innerJoin(rooms, eq(rooms.id, beds.roomId))
      .innerJoin(pgs, eq(pgs.id, electricityBills.pgId))
      .where(and(...conditions, operationsElectricityInvoiceFilter()))
      .orderBy(desc(electricityInvoices.dueDate));

    const today = todayString();
    const { projectElectricityInvoice } = await import('@/src/services/electricityBilling');
    const result: AdminElectricityInvoiceReminderRow[] = [];
    for (const r of rows) {
      const projected = projectElectricityInvoice(asElectricityInvoiceRow(r.invoice), today);
      const invoice = asElectricityInvoiceRow(r.invoice);
      if (
        !isElectricityAwaitingResidentPayment(
          {
            id: invoice.id,
            status: invoice.status,
            paymentProofUrl: invoice.paymentProofUrl,
            outstandingPaise: projected.outstandingPaise,
            effectiveStatus: projected.effectiveStatus,
            supersededByInvoiceId: invoice.supersededByInvoiceId,
            bookingId: invoice.bookingId,
            billingMonth: String(invoice.billingMonth),
          },
          paidBookingMonthKeys,
        )
      ) {
        continue;
      }
      result.push({
        id: r.invoice.id,
        invoiceNumber: r.invoice.invoiceNumber,
        customerId: r.customerId,
        customerFullName: r.customerFullName,
        customerPhone: r.customerPhone,
        pgId: r.pgId,
        pgName: r.pgName,
        roomNumber: r.roomNumber,
        billingMonth: r.invoice.billingMonth,
        dueDate: r.invoice.dueDate,
        amountPaise: r.invoice.amountPaise,
        outstandingPaise: projected.outstandingPaise,
        effectiveStatus: projected.effectiveStatus,
        isOverdue: projected.effectiveStatus === 'overdue',
        paymentProofUrl: r.invoice.paymentProofUrl,
        bookingId: invoice.bookingId,
      });
    }
    return result;
  });
}

export type ElectricityBillDistributionRow = {
  invoiceId: string;
  invoiceNumber: string;
  bookingId: string;
  bookingCode: string;
  customerFullName: string;
  customerPhone: string;
  bedCode: string;
  amountPaise: number;
  status: 'pending' | 'paid' | 'cancelled';
  paidAt: Date | null;
};

export function getElectricityBillDetail(billId: string): Promise<
  QueryResult<{
    bill: AdminElectricityBillRow | null;
    distribution: ElectricityBillDistributionRow[];
  }>
> {
  return guard(async () => {
    const bills = await listAdminElectricityBills();
    const bill =
      bills.ok && bills.data
        ? bills.data.find((b) => b.id === billId) ?? null
        : null;

    const distribution = await db
      .select({
        invoiceId: electricityInvoices.id,
        invoiceNumber: electricityInvoices.invoiceNumber,
        bookingId: electricityInvoices.bookingId,
        bookingCode: bookings.bookingCode,
        customerFullName: customers.fullName,
        customerPhone: customers.phone,
        bedCode: beds.bedCode,
        amountPaise: electricityInvoices.amountPaise,
        status: electricityInvoices.status,
        paidAt: electricityInvoices.paidAt,
      })
      .from(electricityInvoices)
      .innerJoin(bookings, eq(bookings.id, electricityInvoices.bookingId))
      .innerJoin(customers, eq(customers.id, electricityInvoices.customerId))
      .innerJoin(beds, eq(beds.id, electricityInvoices.bedId))
      .where(eq(electricityInvoices.electricityBillId, billId));

    return { bill, distribution };
  });
}

export type AdminVacatingRow = {
  id: string;
  bookingId: string;
  bookingCode: string;
  customerId: string;
  customerFullName: string;
  customerPhone: string;
  pgId: string | null;
  pgName: string;
  bedCode: string;
  roomNumber: string;
  noticeGivenDate: string;
  vacatingDate: string;
  noticeCompliant: boolean;
  deductionPaise: number;
  depositRefundPaise: number;
  monthlyRentPaiseSnapshot: number;
  durationMode: string;
  stayType: string;
  status: 'pending' | 'approved' | 'completed' | 'rejected';
  resolvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export function listAdminVacatingRequests(filter?: {
  status?: 'pending' | 'approved' | 'completed' | 'rejected';
}): Promise<QueryResult<AdminVacatingRow[]>> {
  return guard(async () => {
    /** Latest primary bed location — LEFT JOIN so vacating rows survive cancelled/completed reservations. */
    const rows = await db.execute<{
      id: string;
      booking_id: string;
      booking_code: string;
      customer_id: string;
      customer_full_name: string;
      customer_phone: string;
      pg_id: string | null;
      pg_name: string | null;
      bed_code: string | null;
      room_number: string | null;
      notice_given_date: string;
      vacating_date: string;
      notice_compliant: boolean;
      deduction_paise: number;
      deposit_refund_paise: number;
      monthly_rent_paise_snapshot: number;
      duration_mode: string;
      stay_type: string;
      status: AdminVacatingRow['status'];
      resolved_at: Date | null;
      created_at: Date;
      updated_at: Date;
    }>(sql`
      SELECT
        vr.id,
        vr.booking_id,
        b.booking_code,
        vr.customer_id,
        c.full_name AS customer_full_name,
        c.phone AS customer_phone,
        loc.pg_id,
        loc.pg_name,
        loc.bed_code,
        loc.room_number,
        vr.notice_given_date::text AS notice_given_date,
        vr.vacating_date::text AS vacating_date,
        vr.notice_compliant,
        vr.deduction_paise::bigint::int AS deduction_paise,
        vr.deposit_refund_paise::bigint::int AS deposit_refund_paise,
        vr.monthly_rent_paise_snapshot::bigint::int AS monthly_rent_paise_snapshot,
        b.duration_mode,
        b.stay_type,
        vr.status,
        vr.resolved_at,
        vr.created_at,
        vr.updated_at
      FROM vacating_requests vr
      INNER JOIN bookings b ON b.id = vr.booking_id
      INNER JOIN customers c ON c.id = vr.customer_id
      LEFT JOIN LATERAL (
        SELECT p.id AS pg_id, p.name AS pg_name, r.room_number, bd.bed_code
        FROM bed_reservations br
        INNER JOIN beds bd ON bd.id = br.bed_id
        INNER JOIN rooms r ON r.id = bd.room_id
        INNER JOIN floors f ON f.id = r.floor_id
        INNER JOIN pgs p ON p.id = f.pg_id
        WHERE br.booking_id = vr.booking_id AND br.kind = 'primary'
        ORDER BY
          CASE
            WHEN br.status IN ('hold', 'active') AND CURRENT_DATE <@ br.stay_range THEN 0
            ELSE 1
          END,
          br.created_at DESC
        LIMIT 1
      ) loc ON true
      WHERE vr.checkout_settlement_suppressed = false
      ${filter?.status ? sql`AND vr.status = ${filter.status}` : sql``}
      ORDER BY vr.created_at DESC
    `);

    return Array.from(rows).flatMap((r) => {
      try {
        return [
          {
            id: r.id,
            bookingId: r.booking_id,
            bookingCode: r.booking_code,
            customerId: r.customer_id,
            customerFullName: r.customer_full_name,
            customerPhone: r.customer_phone,
            pgId: r.pg_id,
            pgName: r.pg_name ?? '—',
            bedCode: r.bed_code ?? '—',
            roomNumber: r.room_number ?? '—',
            noticeGivenDate: normalizeIsoDateOnly(r.notice_given_date),
            vacatingDate: normalizeIsoDateOnly(r.vacating_date),
            noticeCompliant: r.notice_compliant,
            deductionPaise: guardDepositPaise(r.deduction_paise),
            depositRefundPaise: guardDepositPaise(r.deposit_refund_paise),
            monthlyRentPaiseSnapshot: guardDepositPaise(r.monthly_rent_paise_snapshot),
            durationMode: r.duration_mode,
            stayType: r.stay_type,
            status: r.status,
            resolvedAt: r.resolved_at,
            createdAt: r.created_at,
            updatedAt: r.updated_at,
          },
        ];
      } catch (err) {
        console.error('[listAdminVacatingRequests] skip row', r.id, r.booking_id, err);
        return [];
      }
    });
  });
}

export type DepositLedgerSummaryRow = {
  bookingId: string;
  bookingCode: string;
  customerId: string;
  customerFullName: string;
  customerPhone: string;
  pgId: string;
  pgName: string;
  roomNumber: string;
  bedCode: string;
  depositPaise: number;
  depositDuePaise: number;
  depositCollectionStatus: 'pending' | 'full' | 'partial' | 'overdue' | 'waived';
  collectedPaise: number;
  deductedPaise: number;
  refundedPaise: number;
  refundableBalancePaise: number;
};

export type DepositCollectionDetailRow = DepositLedgerSummaryRow & {
  collectedThisMonthPaise: number;
  lastCollectedAt: Date | null;
  hasRefundRequest: boolean;
  hasManualAdjustment: boolean;
};

/** Deposit rows with collection activity in a billing month — for overview drill-down. */
export function listDepositCollectionsForBillingMonth(
  billingMonthInput?: string,
): Promise<QueryResult<DepositCollectionDetailRow[]>> {
  return guard(async () => {
    const billingMonth = resolveBillingMonth(billingMonthInput);
    const rows = await db.execute<{
      booking_id: string;
      collected_this_month_paise: number;
      last_collected_at: Date | null;
    }>(sql`
      SELECT
        dl.booking_id,
        coalesce(sum(dl.amount_paise), 0)::bigint::int AS collected_this_month_paise,
        max(dl.created_at) AS last_collected_at
      FROM deposit_ledger dl
      WHERE dl.entry_kind = 'collected'
        AND dl.created_at >= ${billingMonth}::timestamptz
        AND dl.created_at < (${billingMonth}::date + interval '1 month')::timestamptz
      GROUP BY dl.booking_id
      HAVING coalesce(sum(dl.amount_paise), 0) > 0
    `);

    const bookingIds = Array.from(rows).map((r) => r.booking_id);
    if (bookingIds.length === 0) return [];

    const monthMap = new Map(
      Array.from(rows).map((r) => [
        r.booking_id,
        {
          collectedThisMonthPaise: Number(r.collected_this_month_paise),
          lastCollectedAt: r.last_collected_at,
        },
      ]),
    );

    const bookingRows = await db
      .select({
        bookingId: bookings.id,
        bookingCode: bookings.bookingCode,
        customerId: bookings.customerId,
        customerFullName: customers.fullName,
        customerPhone: customers.phone,
        pgId: pgs.id,
        pgName: pgs.name,
        roomNumber: rooms.roomNumber,
        bedCode: beds.bedCode,
        depositPaise: bookings.depositPaise,
        depositDuePaise: bookings.depositDuePaise,
        depositCollectionStatus: bookings.depositCollectionStatus,
        collectedPaise: sql<number>`(
          SELECT coalesce(sum(dl.amount_paise), 0)::bigint
          FROM deposit_ledger dl
          WHERE dl.booking_id = ${bookings.id} AND dl.entry_kind = 'collected'
        )`,
        deductedPaise: sql<number>`(
          SELECT coalesce(-sum(dl.amount_paise), 0)::bigint
          FROM deposit_ledger dl
          WHERE dl.booking_id = ${bookings.id} AND dl.entry_kind = 'deducted'
        )`,
        refundedPaise: sql<number>`(
          SELECT coalesce(-sum(dl.amount_paise), 0)::bigint
          FROM deposit_ledger dl
          WHERE dl.booking_id = ${bookings.id} AND dl.entry_kind = 'refunded'
        )`,
        refundableBalancePaise: sql<number>`(
          SELECT greatest(coalesce(sum(dl.amount_paise), 0), 0)::bigint
          FROM deposit_ledger dl
          WHERE dl.booking_id = ${bookings.id}
        )`,
      })
      .from(bookings)
      .innerJoin(customers, eq(customers.id, bookings.customerId))
      .leftJoin(
        bedReservations,
        and(eq(bedReservations.bookingId, bookings.id), eq(bedReservations.kind, 'primary')),
      )
      .leftJoin(beds, eq(beds.id, bedReservations.bedId))
      .leftJoin(rooms, eq(rooms.id, beds.roomId))
      .leftJoin(floors, eq(floors.id, rooms.floorId))
      .leftJoin(pgs, eq(pgs.id, floors.pgId))
      .where(inArray(bookings.id, bookingIds));

    const refundRequests = await db
      .selectDistinct({ bookingId: vacatingRequests.bookingId })
      .from(vacatingRequests)
      .where(
        and(
          inArray(vacatingRequests.bookingId, bookingIds),
          inArray(vacatingRequests.status, ['pending', 'approved']),
        ),
      );
    const refundSet = new Set(refundRequests.map((r) => r.bookingId));

    const adjustments = await db
      .selectDistinct({ bookingId: depositLedger.bookingId })
      .from(depositLedger)
      .where(
        and(
          inArray(depositLedger.bookingId, bookingIds),
          eq(depositLedger.entryKind, 'deducted'),
          sql`${depositLedger.relatedVacatingId} IS NULL`,
        ),
      );
    const adjustSet = new Set(adjustments.map((r) => r.bookingId));

    return bookingRows
      .map((inv) => {
        const m = monthMap.get(inv.bookingId);
        if (!m) return null;
        return {
          bookingId: inv.bookingId,
          bookingCode: inv.bookingCode,
          customerId: inv.customerId,
          customerFullName: inv.customerFullName,
          customerPhone: inv.customerPhone,
          pgId: inv.pgId ?? '',
          pgName: inv.pgName ?? '—',
          roomNumber: inv.roomNumber ?? '—',
          bedCode: inv.bedCode ?? '—',
          depositPaise: Number(inv.depositPaise),
          depositDuePaise: Number(inv.depositDuePaise),
          depositCollectionStatus: inv.depositCollectionStatus,
          collectedPaise: Number(inv.collectedPaise),
          deductedPaise: Number(inv.deductedPaise),
          refundedPaise: Number(inv.refundedPaise),
          refundableBalancePaise: Number(inv.refundableBalancePaise),
          collectedThisMonthPaise: m.collectedThisMonthPaise,
          lastCollectedAt: m.lastCollectedAt,
          hasRefundRequest: refundSet.has(inv.bookingId),
          hasManualAdjustment: adjustSet.has(inv.bookingId),
        };
      })
      .filter((row): row is DepositCollectionDetailRow => row !== null)
      .sort((a, b) => {
        const ta = a.lastCollectedAt?.getTime() ?? 0;
        const tb = b.lastCollectedAt?.getTime() ?? 0;
        return tb - ta;
      });
  });
}

export function listAdminDepositSummaries(): Promise<QueryResult<DepositLedgerSummaryRow[]>> {
  return guard(async () => {
    const { listDepositInvoiceRecords, toDepositLedgerSummaryRow } = await import(
      '@/src/services/depositInvoices'
    );
    const invoices = await listDepositInvoiceRecords({ view: 'active' });
    return invoices.map(toDepositLedgerSummaryRow);
  });
}

export type DepositLedgerEntryRow = {
  id: string;
  bookingId: string;
  bookingCode: string;
  customerFullName: string;
  entryKind: 'collected' | 'deducted' | 'refunded';
  amountPaise: number;
  reason: string;
  relatedPaymentId: string | null;
  relatedVacatingId: string | null;
  createdAt: Date;
};

export function listDepositLedgerEntriesForBooking(
  bookingId: string,
): Promise<QueryResult<DepositLedgerEntryRow[]>> {
  return guard(async () => {
    return db
      .select({
        id: depositLedger.id,
        bookingId: depositLedger.bookingId,
        bookingCode: bookings.bookingCode,
        customerFullName: customers.fullName,
        entryKind: depositLedger.entryKind,
        amountPaise: depositLedger.amountPaise,
        reason: depositLedger.reason,
        relatedPaymentId: depositLedger.relatedPaymentId,
        relatedVacatingId: depositLedger.relatedVacatingId,
        createdAt: depositLedger.createdAt,
      })
      .from(depositLedger)
      .innerJoin(bookings, eq(bookings.id, depositLedger.bookingId))
      .innerJoin(customers, eq(customers.id, depositLedger.customerId))
      .where(eq(depositLedger.bookingId, bookingId))
      .orderBy(asc(depositLedger.createdAt));
  });
}

/**
 * Room listing for the "create electricity bill" form: every active room
 * in every active PG, with the count of monthly residents currently
 * occupying it (so the form can warn "this room has 0 monthly residents
 * for {month}").
 */
export type RoomPickerRow = {
  roomId: string;
  roomNumber: string;
  pgId: string;
  pgName: string;
  bedCount: number;
  prepaidCreditPaise: number;
};

export function listRoomsForElectricityForm(): Promise<QueryResult<RoomPickerRow[]>> {
  return guard(async () => {
    return db
      .select({
        roomId: rooms.id,
        roomNumber: rooms.roomNumber,
        pgId: pgs.id,
        pgName: pgs.name,
        bedCount: sql<number>`(SELECT count(*)::int FROM beds WHERE room_id = ${rooms.id} AND archived_at IS NULL)`,
        prepaidCreditPaise: rooms.electricityPrepaidCreditPaise,
      })
      .from(rooms)
      .innerJoin(floors, eq(floors.id, rooms.floorId))
      .innerJoin(pgs, eq(pgs.id, floors.pgId))
      .where(sql`${rooms.archivedAt} IS NULL AND ${pgs.archivedAt} IS NULL`)
      .orderBy(asc(pgs.name), asc(rooms.roomNumber));
  });
}
// Silence unused-import warnings when only some helpers are used.
void inArray;
