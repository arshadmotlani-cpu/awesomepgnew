/**
 * PG-level deposit collection — assigned residents only (occupancy SSOT).
 *
 * Required deposit = `bookings.deposit_paise` (set at booking / bed assignment from
 * pricing snapshot — not live PG or bed price lookup).
 */

import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  bedReservations,
  beds,
  bookings,
  customers,
  floors,
  pgs,
  residentBillingProfiles,
  rooms,
} from '@/src/db/schema';
import {
  isProductionBookingFilter,
  isProductionCustomerFilter,
} from '@/src/lib/billing/productionDataFilter';
import { DEPOSIT_COLLECTION_ADJUSTMENT_SQL_PATTERN } from '@/src/lib/deposits/constants';
import {
  classifyDepositCollection,
  depositOutstandingPaise,
  type DepositCollectionStatus,
} from '@/src/lib/deposits/depositCollectionStatus';
import { effectiveDepositCollectedPaise } from '@/src/lib/deposits/unifiedDepositView';
import { sortByRoomBed } from '@/src/lib/billing/roomBedSort';
import {
  buildRentBillingTimeline,
  computeNextRentDueDate,
  type RentBillingTimeline,
} from '@/src/services/billing';
import { resolveBillingMonth } from '@/src/lib/dateDefaults';
import { guardDepositPaise } from '@/src/lib/deposits/paiseSafety';
import {
  OCCUPANCY_PLACEHOLDER_EMAIL,
  OCCUPANCY_PLACEHOLDER_NAME,
  OCCUPANCY_PLACEHOLDER_PHONE,
} from '@/src/lib/occupancySqlFilters';

export type { DepositCollectionStatus };

export type PgDepositResidentRow = {
  customerId: string;
  customerName: string;
  phone: string;
  bookingId: string;
  bookingCode: string;
  pgId: string;
  pgName: string;
  roomNumber: string;
  bedCode: string;
  requiredDepositPaise: number;
  paidAmountPaise: number;
  outstandingPaise: number;
  depositStatus: DepositCollectionStatus;
  paymentDate: Date | null;
  moveInDate: string;
  billingDay: number;
  monthlyRentPaise: number;
  nextRentDueDate: string;
  billingTimeline: RentBillingTimeline;
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
    depositRequirementMissingCount: number;
    depositCollectedMtdPaise: number;
  };
  paidResidents: PgDepositResidentRow[];
  pendingResidents: PgDepositResidentRow[];
  requirementMissingResidents: PgDepositResidentRow[];
};

export type PgDepositCollectionSummary = {
  pgId: string;
  pgName: string;
  depositCollectedMtdPaise: number;
  depositPaidCount: number;
  depositPendingCount: number;
  depositRequirementMissingCount: number;
};

export type DepositCollectionAuditRow = PgDepositResidentRow;

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
  sql`CURRENT_DATE <@ ${bedReservations.stayRange}`,
);

type AssignedRow = {
  pgId: string;
  pgName: string;
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
  moveInDate: string;
  billingDay: number;
  monthlyRentPaise: number;
  openRentDueDate: string | null;
  openRentBillingMonth: string | null;
  lastInvoiceDate: string | null;
  lastRentPaymentDate: string | null;
};

function normalizeAssignedRow(
  r: Omit<AssignedRow, 'pgId' | 'pgName'> & { pgId?: string; pgName?: string },
  pgId: string,
  pgName: string,
): AssignedRow {
  return {
    pgId,
    pgName,
    customerId: r.customerId,
    customerName: r.customerName,
    phone: r.phone,
    bookingId: r.bookingId,
    bookingCode: r.bookingCode,
    roomNumber: r.roomNumber,
    bedCode: r.bedCode,
    requiredDepositPaise: guardDepositPaise(r.requiredDepositPaise, 'requiredDepositPaise'),
    depositDuePaise: guardDepositPaise(r.depositDuePaise, 'depositDuePaise'),
    paidAmountPaise: guardDepositPaise(r.paidAmountPaise, 'paidAmountPaise'),
    lastPaymentAt: r.lastPaymentAt,
    moveInDate: r.moveInDate,
    billingDay: r.billingDay,
    monthlyRentPaise: guardDepositPaise(r.monthlyRentPaise, 'monthlyRentPaise'),
    openRentDueDate: r.openRentDueDate,
    openRentBillingMonth: r.openRentBillingMonth,
    lastInvoiceDate: r.lastInvoiceDate,
    lastRentPaymentDate: r.lastRentPaymentDate,
  };
}

function toResidentRow(row: AssignedRow): PgDepositResidentRow {
  const depositStatus = classifyDepositCollection({
    requiredDepositPaise: row.requiredDepositPaise,
    depositDuePaise: row.depositDuePaise,
    paidAmountPaise: row.paidAmountPaise,
  });
  const displayCollectedPaise = effectiveDepositCollectedPaise({
    grossCollectedPaise: row.paidAmountPaise,
    requiredPaise: row.requiredDepositPaise,
    depositDuePaise: row.depositDuePaise,
  });
  const outstandingPaise = depositOutstandingPaise({
    requiredDepositPaise: row.requiredDepositPaise,
    depositDuePaise: row.depositDuePaise,
    paidAmountPaise: row.paidAmountPaise,
  });

  const nextRentDueDate = computeNextRentDueDate({
    moveInDate: row.moveInDate,
    billingDay: row.billingDay,
    openInvoiceDueDate: row.openRentDueDate,
  });

  const billingTimeline = buildRentBillingTimeline({
    moveInDate: row.moveInDate,
    billingDay: row.billingDay,
    monthlyRentPaise: row.monthlyRentPaise,
    openInvoiceDueDate: row.openRentDueDate,
    openInvoiceBillingMonth: row.openRentBillingMonth,
    lastInvoiceDate: row.lastInvoiceDate,
    lastPaymentDate: row.lastRentPaymentDate,
  });

  return {
    customerId: row.customerId,
    customerName: row.customerName,
    phone: row.phone,
    bookingId: row.bookingId,
    bookingCode: row.bookingCode,
    pgId: row.pgId,
    pgName: row.pgName,
    roomNumber: row.roomNumber,
    bedCode: row.bedCode,
    requiredDepositPaise: row.requiredDepositPaise,
    paidAmountPaise: displayCollectedPaise,
    outstandingPaise,
    depositStatus,
    paymentDate: row.lastPaymentAt,
    moveInDate: row.moveInDate,
    billingDay: row.billingDay,
    monthlyRentPaise: row.monthlyRentPaise,
    nextRentDueDate,
    billingTimeline,
  };
}

function sortResidentRows(rows: PgDepositResidentRow[]): PgDepositResidentRow[] {
  return sortByRoomBed(rows);
}

function partitionResidents(rows: PgDepositResidentRow[]) {
  const paidResidents = sortResidentRows(rows.filter((r) => r.depositStatus === 'paid'));
  const pendingResidents = sortResidentRows(rows.filter((r) => r.depositStatus === 'pending'));
  const requirementMissingResidents = sortResidentRows(
    rows.filter((r) => r.depositStatus === 'requirement_missing'),
  );
  return { paidResidents, pendingResidents, requirementMissingResidents };
}

const assignedBillingSelect = {
  moveInDate: sql<string>`to_char(lower(${bedReservations.stayRange}), 'YYYY-MM-DD')`,
  billingDay: sql<number>`coalesce(${residentBillingProfiles.billingDay}, 5)::int`,
  monthlyRentPaise: sql<number>`coalesce(${residentBillingProfiles.rentAmountPaise}, 0)::bigint::int`,
  openRentDueDate: sql<string | null>`(
    SELECT ri.due_date::text
    FROM rent_invoices ri
    WHERE ri.booking_id = ${bookings.id}
      AND ri.is_adhoc = false
      AND ri.status IN ('pending', 'overdue')
    ORDER BY ri.due_date ASC
    LIMIT 1
  )`,
  openRentBillingMonth: sql<string | null>`(
    SELECT ri.billing_month::text
    FROM rent_invoices ri
    WHERE ri.booking_id = ${bookings.id}
      AND ri.is_adhoc = false
      AND ri.status IN ('pending', 'overdue')
    ORDER BY ri.due_date ASC
    LIMIT 1
  )`,
  lastInvoiceDate: sql<string | null>`(
    SELECT to_char(max(ri.created_at), 'YYYY-MM-DD')
    FROM rent_invoices ri
    WHERE ri.booking_id = ${bookings.id}
      AND ri.is_adhoc = false
  )`,
  lastRentPaymentDate: sql<string | null>`(
    SELECT to_char(max(ri.paid_at), 'YYYY-MM-DD')
    FROM rent_invoices ri
    WHERE ri.booking_id = ${bookings.id}
      AND ri.status = 'paid'
      AND ri.is_adhoc = false
  )`,
};

async function loadAssignedResidentsForPg(pgId: string): Promise<AssignedRow[]> {
  const [pg] = await db
    .select({ id: pgs.id, name: pgs.name })
    .from(pgs)
    .where(eq(pgs.id, pgId))
    .limit(1);
  if (!pg) return [];

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
      ...assignedBillingSelect,
    })
    .from(bookings)
    .innerJoin(customers, eq(customers.id, bookings.customerId))
    .innerJoin(bedReservations, eq(bedReservations.bookingId, bookings.id))
    .innerJoin(beds, eq(beds.id, bedReservations.bedId))
    .innerJoin(rooms, eq(rooms.id, beds.roomId))
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .innerJoin(pgs, eq(pgs.id, floors.pgId))
    .leftJoin(residentBillingProfiles, eq(residentBillingProfiles.bookingId, bookings.id))
    .where(and(eq(pgs.id, pgId), assignedResidentFilters))
    .orderBy(rooms.roomNumber, beds.bedCode);

  return rows.map((r) => normalizeAssignedRow(r, pg.id, pg.name));
}

async function loadAllAssignedResidents(): Promise<AssignedRow[]> {
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
      ...assignedBillingSelect,
    })
    .from(bookings)
    .innerJoin(customers, eq(customers.id, bookings.customerId))
    .innerJoin(bedReservations, eq(bedReservations.bookingId, bookings.id))
    .innerJoin(beds, eq(beds.id, bedReservations.bedId))
    .innerJoin(rooms, eq(rooms.id, beds.roomId))
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .innerJoin(pgs, eq(pgs.id, floors.pgId))
    .leftJoin(residentBillingProfiles, eq(residentBillingProfiles.bookingId, bookings.id))
    .where(and(sql`${pgs.archivedAt} IS NULL`, assignedResidentFilters))
    .orderBy(pgs.name, rooms.roomNumber, beds.bedCode);

  return rows.map((r) => normalizeAssignedRow(r, r.pgId, r.pgName));
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

  const assigned = (await loadAssignedResidentsForPg(pgId)).map(toResidentRow);
  const { paidResidents, pendingResidents, requirementMissingResidents } =
    partitionResidents(assigned);
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
      depositRequirementMissingCount: requirementMissingResidents.length,
      depositCollectedMtdPaise,
    },
    paidResidents,
    pendingResidents,
    requirementMissingResidents,
  };
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

  const assigned = (await loadAllAssignedResidents()).map(toResidentRow);
  const mtdByPg = await getDepositCollectedMtdByPgIds(
    pgRows.map((p) => p.pgId),
    billingMonth,
  );

  const byPg = new Map<
    string,
    { paid: number; pending: number; requirementMissing: number }
  >();
  for (const row of assigned) {
    const bucket = byPg.get(row.pgId) ?? { paid: 0, pending: 0, requirementMissing: 0 };
    if (row.depositStatus === 'paid') bucket.paid += 1;
    else if (row.depositStatus === 'pending') bucket.pending += 1;
    else bucket.requirementMissing += 1;
    byPg.set(row.pgId, bucket);
  }

  return pgRows.map((pg) => {
    const counts = byPg.get(pg.pgId) ?? { paid: 0, pending: 0, requirementMissing: 0 };
    return {
      pgId: pg.pgId,
      pgName: pg.pgName,
      depositCollectedMtdPaise: mtdByPg.get(pg.pgId) ?? 0,
      depositPaidCount: counts.paid,
      depositPendingCount: counts.pending,
      depositRequirementMissingCount: counts.requirementMissing,
    };
  });
}

/** All assigned residents — audit report for configuration errors. */
export async function getDepositCollectionAuditReport(): Promise<DepositCollectionAuditRow[]> {
  return (await loadAllAssignedResidents()).map(toResidentRow);
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
