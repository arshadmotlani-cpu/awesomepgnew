/**
 * PG-level deposit collection — assigned residents only (occupancy SSOT).
 */

import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  bedReservations,
  beds,
  bookings,
  customers,
  depositLedger,
  floors,
  pgs,
  rooms,
} from '@/src/db/schema';
import {
  isProductionBookingFilter,
  isProductionCustomerFilter,
} from '@/src/lib/billing/productionDataFilter';
import { DEPOSIT_COLLECTION_ADJUSTMENT_SQL_PATTERN } from '@/src/lib/deposits/constants';
import { resolveBillingMonth } from '@/src/lib/dateDefaults';
import { guardDepositPaise } from '@/src/lib/deposits/paiseSafety';
import {
  OCCUPANCY_PLACEHOLDER_EMAIL,
  OCCUPANCY_PLACEHOLDER_NAME,
  OCCUPANCY_PLACEHOLDER_PHONE,
} from '@/src/lib/occupancySqlFilters';
import { occupancyReservationCoreSql_b } from '@/src/lib/occupancySsot';

export type PgDepositResidentRow = {
  customerId: string;
  customerName: string;
  phone: string;
  bookingId: string;
  bookingCode: string;
  roomNumber: string;
  bedCode: string;
  requiredDepositPaise: number;
  paidAmountPaise: number;
  outstandingPaise: number;
  paymentDate: Date | null;
};

export type PgDepositCollectionDetail = {
  pgId: string;
  pgName: string;
  billingMonth: string;
  stats: {
    totalBeds: number;
    assignedResidents: number;
    depositPaidCount: number;
    depositPendingCount: number;
    depositCollectedMtdPaise: number;
  };
  paidResidents: PgDepositResidentRow[];
  pendingResidents: PgDepositResidentRow[];
};

export type PgDepositCollectionSummary = {
  pgId: string;
  pgName: string;
  depositCollectedMtdPaise: number;
  depositPaidCount: number;
  depositPendingCount: number;
};

const assignedResidentFilters = and(
  isProductionBookingFilter(),
  isProductionCustomerFilter(),
  sql`${customers.phone} <> ${OCCUPANCY_PLACEHOLDER_PHONE}`,
  sql`${customers.email} <> ${OCCUPANCY_PLACEHOLDER_EMAIL}`,
  sql`${customers.fullName} <> ${OCCUPANCY_PLACEHOLDER_NAME}`,
  eq(bookings.status, 'confirmed'),
  eq(customers.residencyStatus, 'active'),
  eq(bedReservations.kind, 'primary'),
  eq(bedReservations.status, 'active'),
  occupancyReservationCoreSql_b,
);

type AssignedRow = {
  customerId: string;
  customerName: string;
  phone: string;
  bookingId: string;
  bookingCode: string;
  roomNumber: string;
  bedCode: string;
  requiredDepositPaise: number;
  depositDuePaise: number;
  paidAmountPaise: number;
  lastPaymentAt: Date | null;
};

async function loadAssignedResidentsForPg(pgId: string): Promise<AssignedRow[]> {
  const rows = await db
    .select({
      customerId: customers.id,
      customerName: customers.fullName,
      phone: customers.phone,
      bookingId: bookings.id,
      bookingCode: bookings.bookingCode,
      roomNumber: rooms.roomNumber,
      bedCode: beds.bedCode,
      requiredDepositPaise: bookings.depositPaise,
      depositDuePaise: bookings.depositDuePaise,
      paidAmountPaise: sql<number>`(
        SELECT coalesce(sum(dl.amount_paise), 0)::bigint
        FROM deposit_ledger dl
        WHERE dl.booking_id = ${bookings.id}
          AND dl.entry_kind = 'collected'
      )`,
      lastPaymentAt: sql<Date | null>`(
        SELECT max(dl.created_at)
        FROM deposit_ledger dl
        WHERE dl.booking_id = ${bookings.id}
          AND dl.entry_kind = 'collected'
      )`,
    })
    .from(bookings)
    .innerJoin(customers, eq(customers.id, bookings.customerId))
    .innerJoin(bedReservations, eq(bedReservations.bookingId, bookings.id))
    .innerJoin(beds, eq(beds.id, bedReservations.bedId))
    .innerJoin(rooms, eq(rooms.id, beds.roomId))
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .innerJoin(pgs, eq(pgs.id, floors.pgId))
    .where(and(eq(pgs.id, pgId), assignedResidentFilters))
    .orderBy(customers.fullName);

  return rows.map((r) => ({
    ...r,
    requiredDepositPaise: guardDepositPaise(r.requiredDepositPaise, 'requiredDepositPaise'),
    depositDuePaise: guardDepositPaise(r.depositDuePaise, 'depositDuePaise'),
    paidAmountPaise: guardDepositPaise(r.paidAmountPaise, 'paidAmountPaise'),
  }));
}

function isDepositFullyPaid(row: AssignedRow): boolean {
  if (row.requiredDepositPaise <= 0) return true;
  if (row.depositDuePaise > 0) return false;
  return row.paidAmountPaise >= row.requiredDepositPaise;
}

function toResidentRow(row: AssignedRow): PgDepositResidentRow {
  const outstandingPaise = Math.max(0, row.depositDuePaise || row.requiredDepositPaise - row.paidAmountPaise);
  return {
    customerId: row.customerId,
    customerName: row.customerName,
    phone: row.phone,
    bookingId: row.bookingId,
    bookingCode: row.bookingCode,
    roomNumber: row.roomNumber,
    bedCode: row.bedCode,
    requiredDepositPaise: row.requiredDepositPaise,
    paidAmountPaise: row.paidAmountPaise,
    outstandingPaise,
    paymentDate: row.lastPaymentAt,
  };
}

async function depositCollectedMtdForPg(pgId: string, billingMonth: string): Promise<number> {
  const [row] = await db.execute<{ total: number }>(sql`
    SELECT coalesce(sum(dl.amount_paise), 0)::bigint::int AS total
    FROM deposit_ledger dl
    INNER JOIN bookings b ON b.id = dl.booking_id
    INNER JOIN bed_reservations br ON br.booking_id = b.id AND br.kind = 'primary'
    INNER JOIN beds bd ON bd.id = br.bed_id
    INNER JOIN rooms r ON r.id = bd.room_id
    INNER JOIN floors f ON f.id = r.floor_id
    WHERE f.pg_id = ${pgId}::uuid
      AND dl.entry_kind = 'collected'
      AND dl.reason NOT LIKE ${DEPOSIT_COLLECTION_ADJUSTMENT_SQL_PATTERN}
      AND dl.created_at >= ${billingMonth}::timestamptz
      AND dl.created_at < (${billingMonth}::date + interval '1 month')::timestamptz
  `);
  return Number(row?.total ?? 0);
}

export async function getPgDepositCollectionDetail(
  pgId: string,
  billingMonthInput?: string,
): Promise<PgDepositCollectionDetail | null> {
  const billingMonth = resolveBillingMonth(billingMonthInput);

  const [pg] = await db
    .select({ id: pgs.id, name: pgs.name })
    .from(pgs)
    .where(eq(pgs.id, pgId))
    .limit(1);
  if (!pg) return null;

  const [bedCount] = await db
    .select({ total: sql<number>`count(${beds.id})::int` })
    .from(beds)
    .innerJoin(rooms, eq(rooms.id, beds.roomId))
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .where(and(eq(floors.pgId, pgId), sql`${beds.archivedAt} IS NULL`));

  const assigned = await loadAssignedResidentsForPg(pgId);
  const paidResidents = assigned.filter(isDepositFullyPaid).map(toResidentRow);
  const pendingResidents = assigned.filter((r) => !isDepositFullyPaid(r)).map(toResidentRow);
  const depositCollectedMtdPaise = await depositCollectedMtdForPg(pgId, billingMonth);

  return {
    pgId: pg.id,
    pgName: pg.name,
    billingMonth,
    stats: {
      totalBeds: Number(bedCount?.total ?? 0),
      assignedResidents: assigned.length,
      depositPaidCount: paidResidents.length,
      depositPendingCount: pendingResidents.length,
      depositCollectedMtdPaise,
    },
    paidResidents,
    pendingResidents,
  };
}

async function loadAllAssignedResidents(): Promise<(AssignedRow & { pgId: string; pgName: string })[]> {
  const rows = await db
    .select({
      pgId: pgs.id,
      pgName: pgs.name,
      customerId: customers.id,
      customerName: customers.fullName,
      phone: customers.phone,
      bookingId: bookings.id,
      bookingCode: bookings.bookingCode,
      roomNumber: rooms.roomNumber,
      bedCode: beds.bedCode,
      requiredDepositPaise: bookings.depositPaise,
      depositDuePaise: bookings.depositDuePaise,
      paidAmountPaise: sql<number>`(
        SELECT coalesce(sum(dl.amount_paise), 0)::bigint
        FROM deposit_ledger dl
        WHERE dl.booking_id = ${bookings.id}
          AND dl.entry_kind = 'collected'
      )`,
      lastPaymentAt: sql<Date | null>`(
        SELECT max(dl.created_at)
        FROM deposit_ledger dl
        WHERE dl.booking_id = ${bookings.id}
          AND dl.entry_kind = 'collected'
      )`,
    })
    .from(bookings)
    .innerJoin(customers, eq(customers.id, bookings.customerId))
    .innerJoin(bedReservations, eq(bedReservations.bookingId, bookings.id))
    .innerJoin(beds, eq(beds.id, bedReservations.bedId))
    .innerJoin(rooms, eq(rooms.id, beds.roomId))
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .innerJoin(pgs, eq(pgs.id, floors.pgId))
    .where(and(sql`${pgs.archivedAt} IS NULL`, assignedResidentFilters));

  return rows.map((r) => ({
    ...r,
    requiredDepositPaise: guardDepositPaise(r.requiredDepositPaise, 'requiredDepositPaise'),
    depositDuePaise: guardDepositPaise(r.depositDuePaise, 'depositDuePaise'),
    paidAmountPaise: guardDepositPaise(r.paidAmountPaise, 'paidAmountPaise'),
  }));
}

/** Summaries for all PGs — used on revenue page deposit columns. */
export async function getAllPgDepositCollectionSummaries(
  billingMonthInput?: string,
): Promise<PgDepositCollectionSummary[]> {
  const billingMonth = resolveBillingMonth(billingMonthInput);

  const pgRows = await db
    .select({ pgId: pgs.id, pgName: pgs.name })
    .from(pgs)
    .where(sql`${pgs.archivedAt} IS NULL`)
    .orderBy(pgs.name);

  const assigned = await loadAllAssignedResidents();
  const mtdByPg = await getDepositCollectedMtdByPgIds(
    pgRows.map((p) => p.pgId),
    billingMonth,
  );

  const byPg = new Map<string, { paid: number; pending: number }>();
  for (const row of assigned) {
    const bucket = byPg.get(row.pgId) ?? { paid: 0, pending: 0 };
    if (isDepositFullyPaid(row)) bucket.paid += 1;
    else bucket.pending += 1;
    byPg.set(row.pgId, bucket);
  }

  return pgRows.map((pg) => {
    const counts = byPg.get(pg.pgId) ?? { paid: 0, pending: 0 };
    return {
      pgId: pg.pgId,
      pgName: pg.pgName,
      depositCollectedMtdPaise: mtdByPg.get(pg.pgId) ?? 0,
      depositPaidCount: counts.paid,
      depositPendingCount: counts.pending,
    };
  });
}

/** Ledger MTD collected for bookings at pgIds (batch). */
export async function getDepositCollectedMtdByPgIds(
  pgIds: string[],
  billingMonthInput?: string,
): Promise<Map<string, number>> {
  if (pgIds.length === 0) return new Map();
  const billingMonth = resolveBillingMonth(billingMonthInput);

  const rows = await db.execute<{ pg_id: string; total: number }>(sql`
    SELECT f.pg_id::text AS pg_id, coalesce(sum(dl.amount_paise), 0)::bigint::int AS total
    FROM deposit_ledger dl
    INNER JOIN bookings b ON b.id = dl.booking_id
    INNER JOIN bed_reservations br ON br.booking_id = b.id AND br.kind = 'primary'
    INNER JOIN beds bd ON bd.id = br.bed_id
    INNER JOIN rooms r ON r.id = bd.room_id
    INNER JOIN floors f ON f.id = r.floor_id
    WHERE f.pg_id = ANY(${sql.raw(`'{${pgIds.join(',')}}'::uuid[]`)})
      AND dl.entry_kind = 'collected'
      AND dl.reason NOT LIKE ${DEPOSIT_COLLECTION_ADJUSTMENT_SQL_PATTERN}
      AND dl.created_at >= ${billingMonth}::timestamptz
      AND dl.created_at < (${billingMonth}::date + interval '1 month')::timestamptz
    GROUP BY f.pg_id
  `);

  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(row.pg_id, Number(row.total));
  }
  return map;
}
