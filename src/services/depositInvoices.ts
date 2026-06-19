/**
 * Deposit invoices — single source of truth for admin deposit UI.
 * One final computed record per resident (deduped), never raw ledger rows.
 */

import { and, desc, eq, gt, inArray, or, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  bedReservations,
  beds,
  bookings,
  customers,
  depositSettlements,
  floors,
  pgs,
  residentRequests,
  rooms,
  vacatingRequests,
} from '@/src/db/schema';
import type { DepositCollectionStatus } from '@/src/db/schema/enums';
import {
  isProductionBookingFilter,
  isProductionCustomerFilter,
} from '@/src/lib/billing/productionDataFilter';
import { logDepositPageSection } from '@/src/lib/depositPageDebug';
import { guardDepositPaise } from '@/src/lib/deposits/paiseSafety';
import {
  OCCUPANCY_PLACEHOLDER_EMAIL,
  OCCUPANCY_PLACEHOLDER_NAME,
  OCCUPANCY_PLACEHOLDER_PHONE,
} from '@/src/lib/occupancySqlFilters';

export type DepositInvoiceStatus =
  | 'collecting'
  | 'held'
  | 'refund_pending'
  | 'settled';

/** Final computed deposit invoice — mirrors admin table columns. */
export type DepositInvoiceRecord = {
  bookingId: string;
  bookingCode: string;
  customerId: string;
  customerFullName: string;
  customerPhone: string;
  pgId: string;
  pgName: string;
  roomNumber: string;
  bedCode: string;
  /** Required deposit from rent plan / booking. */
  requiredPaise: number;
  collectedPaise: number;
  deductionsPaise: number;
  refundablePaise: number;
  invoiceStatus: DepositInvoiceStatus;
  displayStatus: string;
  isSettled: boolean;
  isFrozen: boolean;
  /** Back-compat for existing components */
  depositPaise: number;
  depositDuePaise: number;
  depositCollectionStatus: DepositCollectionStatus;
  deductedPaise: number;
  refundedPaise: number;
  refundableBalancePaise: number;
};

type RawRow = {
  bookingId: string;
  bookingCode: string;
  bookingStatus: string;
  bookingCreatedAt: Date;
  customerId: string;
  customerFullName: string;
  customerPhone: string;
  residencyStatus: string;
  adminDepositRefundStatus: string;
  pgId: string;
  pgName: string;
  roomNumber: string;
  bedCode: string;
  depositPaise: number;
  depositDuePaise: number;
  depositCollectionStatus: DepositCollectionStatus;
  collectedPaise: number;
  deductedPaise: number;
  refundedPaise: number;
  refundableBalancePaise: number;
  hasActiveReservation: boolean;
};

function displayStatusFor(row: {
  invoiceStatus: DepositInvoiceStatus;
  depositCollectionStatus: DepositCollectionStatus;
  depositDuePaise: number;
}): string {
  switch (row.invoiceStatus) {
    case 'settled':
      return 'Settled';
    case 'refund_pending':
      return 'Refund pending';
    case 'held':
      return 'Held';
    case 'collecting':
      if (row.depositDuePaise > 0) return 'Collecting';
      if (row.depositCollectionStatus === 'overdue') return 'Overdue';
      if (row.depositCollectionStatus === 'partial') return 'Partial';
      return 'Collecting';
    default:
      return 'Collecting';
  }
}

function toInvoiceRecord(
  row: RawRow,
  flags: { hasRefundRequest: boolean; hasSettlement: boolean },
): DepositInvoiceRecord {
  const deductionsPaise = row.deductedPaise + row.refundedPaise;
  const refundablePaise = Math.max(0, row.refundableBalancePaise);

  let invoiceStatus: DepositInvoiceStatus;
  const isSettled =
    row.residencyStatus === 'vacated' ||
    row.adminDepositRefundStatus === 'refunded' ||
    flags.hasSettlement ||
    (row.bookingStatus === 'completed' && refundablePaise === 0);

  if (isSettled) {
    invoiceStatus = 'settled';
  } else if (flags.hasRefundRequest) {
    invoiceStatus = 'refund_pending';
  } else if (row.depositDuePaise > 0 || row.collectedPaise < row.depositPaise) {
    invoiceStatus = 'collecting';
  } else if (refundablePaise > 0) {
    invoiceStatus = 'held';
  } else {
    invoiceStatus = 'settled';
  }

  return {
    bookingId: row.bookingId,
    bookingCode: row.bookingCode,
    customerId: row.customerId,
    customerFullName: row.customerFullName,
    customerPhone: row.customerPhone,
    pgId: row.pgId,
    pgName: row.pgName,
    roomNumber: row.roomNumber,
    bedCode: row.bedCode,
    requiredPaise: row.depositPaise,
    collectedPaise: row.collectedPaise,
    deductionsPaise,
    refundablePaise,
    invoiceStatus,
    displayStatus: displayStatusFor({
      invoiceStatus,
      depositCollectionStatus: row.depositCollectionStatus,
      depositDuePaise: row.depositDuePaise,
    }),
    isSettled,
    isFrozen: isSettled,
    depositPaise: row.depositPaise,
    depositDuePaise: row.depositDuePaise,
    depositCollectionStatus: row.depositCollectionStatus,
    deductedPaise: row.deductedPaise,
    refundedPaise: row.refundedPaise,
    refundableBalancePaise: refundablePaise,
  };
}

function pickCanonicalBooking(rows: RawRow[]): RawRow {
  if (rows.length === 1) return rows[0]!;

  const withActive = rows.filter((r) => r.hasActiveReservation && r.bookingStatus === 'confirmed');
  if (withActive.length === 1) return withActive[0]!;
  if (withActive.length > 1) {
    return withActive.sort(
      (a, b) => b.bookingCreatedAt.getTime() - a.bookingCreatedAt.getTime(),
    )[0]!;
  }

  const confirmed = rows.filter((r) => r.bookingStatus === 'confirmed');
  if (confirmed.length > 0) {
    return confirmed.sort(
      (a, b) => b.bookingCreatedAt.getTime() - a.bookingCreatedAt.getTime(),
    )[0]!;
  }

  return rows.sort((a, b) => b.bookingCreatedAt.getTime() - a.bookingCreatedAt.getTime())[0]!;
}

function dedupeByCustomer(rows: RawRow[]): RawRow[] {
  const byCustomer = new Map<string, RawRow[]>();
  for (const row of rows) {
    const list = byCustomer.get(row.customerId) ?? [];
    list.push(row);
    byCustomer.set(row.customerId, list);
  }
  return Array.from(byCustomer.values()).map(pickCanonicalBooking);
}

async function fetchRawDepositRows(options?: { bookingId?: string }): Promise<RawRow[]> {
  const filters = [
    isProductionBookingFilter(),
    isProductionCustomerFilter(),
    sql`${customers.phone} <> ${OCCUPANCY_PLACEHOLDER_PHONE}`,
    sql`${customers.email} <> ${OCCUPANCY_PLACEHOLDER_EMAIL}`,
    sql`${customers.fullName} <> ${OCCUPANCY_PLACEHOLDER_NAME}`,
    inArray(bookings.status, ['confirmed', 'completed']),
    or(
      gt(bookings.depositPaise, 0),
      sql`exists (select 1 from deposit_ledger dl where dl.booking_id = ${bookings.id})`,
    ),
  ];
  if (options?.bookingId) {
    filters.push(eq(bookings.id, options.bookingId));
  }

  const rows = await db
    .select({
      bookingId: bookings.id,
      bookingCode: bookings.bookingCode,
      bookingStatus: bookings.status,
      bookingCreatedAt: bookings.createdAt,
      customerId: bookings.customerId,
      customerFullName: customers.fullName,
      customerPhone: customers.phone,
      residencyStatus: customers.residencyStatus,
      adminDepositRefundStatus: bookings.adminDepositRefundStatus,
      pgId: pgs.id,
      pgName: pgs.name,
      roomNumber: rooms.roomNumber,
      bedCode: beds.bedCode,
      depositPaise: bookings.depositPaise,
      depositDuePaise: bookings.depositDuePaise,
      depositCollectionStatus: bookings.depositCollectionStatus,
      collectedPaise: sql<number>`(
        select coalesce(sum(dl.amount_paise), 0)
        from deposit_ledger dl
        where dl.booking_id = ${bookings.id}
          and dl.entry_kind = 'collected'
      )::bigint`,
      deductedPaise: sql<number>`(
        select coalesce(-sum(dl.amount_paise), 0)
        from deposit_ledger dl
        where dl.booking_id = ${bookings.id}
          and dl.entry_kind = 'deducted'
      )::bigint`,
      refundedPaise: sql<number>`(
        select coalesce(-sum(dl.amount_paise), 0)
        from deposit_ledger dl
        where dl.booking_id = ${bookings.id}
          and dl.entry_kind = 'refunded'
      )::bigint`,
      refundableBalancePaise: sql<number>`(
        select greatest(coalesce(sum(dl.amount_paise), 0), 0)
        from deposit_ledger dl
        where dl.booking_id = ${bookings.id}
      )::bigint`,
      hasActiveReservation: sql<boolean>`exists (
        select 1 from bed_reservations br
        where br.booking_id = ${bookings.id}
          and br.kind = 'primary'
          and br.status = 'active'
          and lower(br.stay_range) <= current_date
          and (upper(br.stay_range) is null or upper(br.stay_range) > current_date)
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
    .where(and(...filters))
    .orderBy(desc(bookings.createdAt));

  return rows.map((r) => ({
    ...r,
    pgId: r.pgId ?? '',
    pgName: r.pgName ?? '',
    roomNumber: r.roomNumber ?? '',
    bedCode: r.bedCode ?? '',
    depositPaise: guardDepositPaise(r.depositPaise, 'rawRow.depositPaise'),
    depositDuePaise: guardDepositPaise(r.depositDuePaise, 'rawRow.depositDuePaise'),
    collectedPaise: guardDepositPaise(r.collectedPaise, 'rawRow.collectedPaise'),
    deductedPaise: guardDepositPaise(r.deductedPaise, 'rawRow.deductedPaise'),
    refundedPaise: guardDepositPaise(r.refundedPaise, 'rawRow.refundedPaise'),
    refundableBalancePaise: guardDepositPaise(
      r.refundableBalancePaise,
      'rawRow.refundableBalancePaise',
    ),
    hasActiveReservation: Boolean(r.hasActiveReservation),
  }));
}

async function loadRefundFlags(bookingIds: string[]) {
  const refundRequests = new Set<string>();
  const settlements = new Set<string>();

  if (bookingIds.length === 0) {
    return { refundRequests, settlements };
  }

  const [openRefunds, settled] = await Promise.all([
    db
      .selectDistinct({ bookingId: residentRequests.bookingId })
      .from(residentRequests)
      .where(
        and(
          inArray(residentRequests.bookingId, bookingIds),
          eq(residentRequests.type, 'deposit_refund'),
          inArray(residentRequests.status, ['submitted', 'under_review', 'approved']),
        ),
      ),
    db
      .selectDistinct({ bookingId: depositSettlements.bookingId })
      .from(depositSettlements)
      .where(inArray(depositSettlements.bookingId, bookingIds)),
  ]);

  for (const r of openRefunds) refundRequests.add(r.bookingId);
  for (const s of settled) settlements.add(s.bookingId);

  const vacating = await db
    .selectDistinct({ bookingId: vacatingRequests.bookingId })
    .from(vacatingRequests)
    .where(
      and(
        inArray(vacatingRequests.bookingId, bookingIds),
        inArray(vacatingRequests.status, ['pending', 'approved']),
      ),
    );
  for (const v of vacating) refundRequests.add(v.bookingId);

  return { refundRequests, settlements };
}

export async function listDepositInvoiceRecords(options?: {
  view?: 'active' | 'settled' | 'all';
}): Promise<DepositInvoiceRecord[]> {
  const raw = dedupeByCustomer(await fetchRawDepositRows());
  const bookingIds = raw.map((r) => r.bookingId);
  const { refundRequests, settlements } = await loadRefundFlags(bookingIds);

  const records = raw.map((row) =>
    toInvoiceRecord(row, {
      hasRefundRequest: refundRequests.has(row.bookingId),
      hasSettlement: settlements.has(row.bookingId),
    }),
  );

  const view = options?.view ?? 'active';
  if (view === 'active') {
    return records.filter((r) => !r.isSettled);
  }
  if (view === 'settled') {
    return records.filter((r) => r.isSettled);
  }
  return records;
}

export async function getDepositInvoiceForBooking(
  bookingId: string,
): Promise<DepositInvoiceRecord | null> {
  try {
    logDepositPageSection('getDepositInvoiceForBooking', bookingId, { phase: 'start' });
    const rows = await fetchRawDepositRows({ bookingId });
    const row = rows.find((r) => r.bookingId === bookingId) ?? rows[0];
    if (!row) {
      logDepositPageSection('getDepositInvoiceForBooking', bookingId, { phase: 'not_found' });
      return null;
    }

    const { refundRequests, settlements } = await loadRefundFlags([bookingId]);
    const invoice = toInvoiceRecord(row, {
      hasRefundRequest: refundRequests.has(bookingId),
      hasSettlement: settlements.has(bookingId),
    });
    logDepositPageSection('getDepositInvoiceForBooking', bookingId, {
      customerId: row.customerId,
      deposit_paise: row.depositPaise,
      requiredPaise: row.depositPaise,
      collectedPaise: row.collectedPaise,
      deductedPaise: row.deductedPaise,
      refundedPaise: row.refundedPaise,
      refundablePaise: row.refundableBalancePaise,
      invoiceStatus: invoice.invoiceStatus,
    });
    return invoice;
  } catch (err) {
    console.error('[DEPOSIT_PAGE_SECTION_FAILED]', 'getDepositInvoiceForBooking', bookingId, err);
    throw err;
  }
}

/** PG-level deposit collected in a billing month — invoice dataset only (deduped residents). */
export async function getDepositCollectedByPgForBillingMonthFromInvoices(
  billingMonthInput?: string,
): Promise<Array<{ pgId: string; collectedPaise: number }>> {
  const { resolveBillingMonth } = await import('@/src/lib/dateDefaults');
  const billingMonth = resolveBillingMonth(billingMonthInput);
  const { listDepositCollectionsForBillingMonth } = await import('@/src/db/queries/admin');
  const res = await listDepositCollectionsForBillingMonth(billingMonth);
  if (!res.ok) return [];

  const byPg = new Map<string, number>();
  for (const row of res.data) {
    byPg.set(row.pgId, (byPg.get(row.pgId) ?? 0) + row.collectedThisMonthPaise);
  }
  return Array.from(byPg.entries()).map(([pgId, collectedPaise]) => ({
    pgId,
    collectedPaise,
  }));
}

/** Map invoice record to legacy admin query row shape. */
export function toDepositLedgerSummaryRow(record: DepositInvoiceRecord) {
  return {
    bookingId: record.bookingId,
    bookingCode: record.bookingCode,
    customerId: record.customerId,
    customerFullName: record.customerFullName,
    customerPhone: record.customerPhone,
    pgId: record.pgId,
    pgName: record.pgName,
    roomNumber: record.roomNumber,
    bedCode: record.bedCode,
    depositPaise: record.depositPaise,
    depositDuePaise: record.depositDuePaise,
    depositCollectionStatus: record.depositCollectionStatus,
    collectedPaise: record.collectedPaise,
    deductedPaise: record.deductedPaise,
    refundedPaise: record.refundedPaise,
    refundableBalancePaise: record.refundableBalancePaise,
  };
}
