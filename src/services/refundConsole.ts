/**
 * Refund Console — single admin workflow for deposit refunds, transfers, and deductions.
 */

import { and, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  bookings,
  customers,
  depositLedger,
  type DepositLedgerEntry,
} from '@/src/db/schema';
import {
  DEDUCTION_CATEGORY_LABELS,
  isDepositTransferReason,
  parseDeductionCategory,
  type DeductionCategory,
} from '@/src/lib/financial/deductionCategories';
import { getDepositSummaryForBooking } from '@/src/services/deposits';

export type RefundConsoleBookingRow = {
  bookingId: string;
  bookingCode: string;
  customerId: string;
  customerName: string;
  pgName: string | null;
  bedLabel: string | null;
  status: string;
  wallet: RefundConsoleWallet;
};

export type RefundConsoleWallet = {
  depositPaidPaise: number;
  depositUsedPaise: number;
  depositTransferredPaise: number;
  electricityDeductionPaise: number;
  policyDeductionPaise: number;
  otherDeductionsPaise: number;
  refundPaidPaise: number;
  remainingDepositPaise: number;
};

export type RefundConsoleSearchResult = {
  query: string;
  rows: RefundConsoleBookingRow[];
};

function customerDisplayName(row: {
  fullName: string | null;
  phone: string | null;
}): string {
  const name = row.fullName?.trim();
  return name || row.phone || 'Resident';
}

function summarizeWallet(entries: DepositLedgerEntry[]): RefundConsoleWallet {
  let depositPaidPaise = 0;
  let depositUsedPaise = 0;
  let depositTransferredPaise = 0;
  let electricityDeductionPaise = 0;
  let policyDeductionPaise = 0;
  let otherDeductionsPaise = 0;
  let refundPaidPaise = 0;

  for (const entry of entries) {
    const amount = Math.abs(entry.amountPaise);
    if (entry.entryKind === 'collected') {
      depositPaidPaise += entry.amountPaise;
      continue;
    }
    if (entry.entryKind === 'refunded') {
      refundPaidPaise += amount;
      continue;
    }
    if (entry.entryKind !== 'deducted') continue;

    if (isDepositTransferReason(entry.reason)) {
      depositTransferredPaise += amount;
      continue;
    }

    const category = parseDeductionCategory({
      deductionCategory: entry.deductionCategory,
      reason: entry.reason,
    });

    if (category === 'electricity') {
      electricityDeductionPaise += amount;
    } else if (category === 'notice_policy' || category === 'five_day_policy') {
      policyDeductionPaise += amount;
    } else {
      otherDeductionsPaise += amount;
    }
  }

  depositUsedPaise = electricityDeductionPaise + policyDeductionPaise + otherDeductionsPaise;

  const remainingDepositPaise = Math.max(
    0,
    depositPaidPaise - depositTransferredPaise - depositUsedPaise - refundPaidPaise,
  );

  return {
    depositPaidPaise,
    depositUsedPaise,
    depositTransferredPaise,
    electricityDeductionPaise,
    policyDeductionPaise,
    otherDeductionsPaise,
    refundPaidPaise,
    remainingDepositPaise,
  };
}

export async function buildRefundConsoleWallet(
  bookingId: string,
): Promise<RefundConsoleWallet | null> {
  const summary = await getDepositSummaryForBooking(bookingId);
  if (!summary) return null;
  return summarizeWallet(summary.entries);
}

export async function searchRefundConsoleBookings(
  query: string,
  limit = 40,
): Promise<RefundConsoleSearchResult> {
  const trimmed = query.trim();
  if (!trimmed) {
    return { query: trimmed, rows: [] };
  }

  const pattern = `%${trimmed}%`;
  const rows = await db
    .select({
      bookingId: bookings.id,
      bookingCode: bookings.bookingCode,
      customerId: bookings.customerId,
      status: bookings.status,
      fullName: customers.fullName,
      phone: customers.phone,
      pgName: sql<string | null>`(
        SELECT p.name FROM bed_reservations br
        INNER JOIN beds bd ON bd.id = br.bed_id
        INNER JOIN rooms r ON r.id = bd.room_id
        INNER JOIN floors f ON f.id = r.floor_id
        INNER JOIN pgs p ON p.id = f.pg_id
        WHERE br.booking_id = ${bookings.id} AND br.kind = 'primary'
        ORDER BY br.created_at DESC LIMIT 1
      )`,
      bedLabel: sql<string | null>`(
        SELECT concat('Room ', r.room_number, ' · Bed ', bd.bed_code)
        FROM bed_reservations br
        INNER JOIN beds bd ON bd.id = br.bed_id
        INNER JOIN rooms r ON r.id = bd.room_id
        WHERE br.booking_id = ${bookings.id} AND br.kind = 'primary'
        ORDER BY br.created_at DESC LIMIT 1
      )`,
    })
    .from(bookings)
    .innerJoin(customers, eq(customers.id, bookings.customerId))
    .where(
      and(
        eq(bookings.isTest, false),
        eq(customers.isTest, false),
        or(
          ilike(bookings.bookingCode, pattern),
          ilike(customers.phone, pattern),
          ilike(customers.fullName, pattern),
          sql`${bookings.id}::text ILIKE ${pattern}`,
        ),
      ),
    )
    .orderBy(desc(bookings.createdAt))
    .limit(limit);

  const result: RefundConsoleBookingRow[] = [];
  for (const row of rows) {
    const wallet = await buildRefundConsoleWallet(row.bookingId);
    if (!wallet) continue;
    result.push({
      bookingId: row.bookingId,
      bookingCode: row.bookingCode,
      customerId: row.customerId,
      customerName: customerDisplayName(row),
      pgName: row.pgName,
      bedLabel: row.bedLabel,
      status: row.status,
      wallet,
    });
  }

  return { query: trimmed, rows: result };
}

export async function getRefundConsoleBookingDetail(
  bookingId: string,
): Promise<(RefundConsoleBookingRow & { ledger: DepositLedgerEntry[] }) | null> {
  const [row] = await db
    .select({
      bookingId: bookings.id,
      bookingCode: bookings.bookingCode,
      customerId: bookings.customerId,
      status: bookings.status,
      fullName: customers.fullName,
      phone: customers.phone,
      pgName: sql<string | null>`(
        SELECT p.name FROM bed_reservations br
        INNER JOIN beds bd ON bd.id = br.bed_id
        INNER JOIN rooms r ON r.id = bd.room_id
        INNER JOIN floors f ON f.id = r.floor_id
        INNER JOIN pgs p ON p.id = f.pg_id
        WHERE br.booking_id = ${bookings.id} AND br.kind = 'primary'
        ORDER BY br.created_at DESC LIMIT 1
      )`,
      bedLabel: sql<string | null>`(
        SELECT concat('Room ', r.room_number, ' · Bed ', bd.bed_code)
        FROM bed_reservations br
        INNER JOIN beds bd ON bd.id = br.bed_id
        INNER JOIN rooms r ON r.id = bd.room_id
        WHERE br.booking_id = ${bookings.id} AND br.kind = 'primary'
        ORDER BY br.created_at DESC LIMIT 1
      )`,
    })
    .from(bookings)
    .innerJoin(customers, eq(customers.id, bookings.customerId))
    .where(eq(bookings.id, bookingId))
    .limit(1);

  if (!row) return null;

  const summary = await getDepositSummaryForBooking(bookingId);
  if (!summary) return null;

  return {
    bookingId: row.bookingId,
    bookingCode: row.bookingCode,
    customerId: row.customerId,
    customerName: customerDisplayName(row),
    pgName: row.pgName,
    bedLabel: row.bedLabel,
    status: row.status,
    wallet: summarizeWallet(summary.entries),
    ledger: summary.entries,
  };
}
