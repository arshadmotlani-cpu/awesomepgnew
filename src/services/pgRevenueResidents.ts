/**
 * Resident-level financial breakdown for PG revenue / collection screens.
 */

import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { electricityInvoices, rentInvoices } from '@/src/db/schema';
import { resolveBillingMonth } from '@/src/lib/dateDefaults';
import { getPgDepositCollectionDetail } from '@/src/services/pgDepositCollection';

export type PgRevenueResidentRow = {
  customerId: string;
  customerName: string;
  phone: string;
  bookingId: string;
  bookingCode: string;
  roomNumber: string;
  bedCode: string;
  rentDuePaise: number;
  rentPaidPaise: number;
  depositRequiredPaise: number;
  depositPaidPaise: number;
  depositOutstandingPaise: number;
  electricityDuePaise: number;
  electricityPaidPaise: number;
  totalOutstandingPaise: number;
  depositStatus: 'paid' | 'pending';
};

export async function getPgRevenueResidentRows(
  pgId: string,
  billingMonthInput?: string,
): Promise<PgRevenueResidentRow[]> {
  const billingMonth = resolveBillingMonth(billingMonthInput);
  const detail = await getPgDepositCollectionDetail(pgId, billingMonth);
  if (!detail) return [];

  const residents = [...detail.paidResidents, ...detail.pendingResidents];
  if (residents.length === 0) return [];

  const bookingIds = residents.map((r) => r.bookingId);

  const [rentRows, elecRows] = await Promise.all([
    db
      .select({
        bookingId: rentInvoices.bookingId,
        rentPaise: rentInvoices.rentPaise,
        paidPrincipalPaise: rentInvoices.paidPrincipalPaise,
        paidLateFeePaise: rentInvoices.paidLateFeePaise,
        status: rentInvoices.status,
      })
      .from(rentInvoices)
      .where(
        and(
          inArray(rentInvoices.bookingId, bookingIds),
          eq(rentInvoices.billingMonth, billingMonth),
        ),
      ),
    db
      .select({
        bookingId: electricityInvoices.bookingId,
        amountPaise: electricityInvoices.amountPaise,
        paidPaise: electricityInvoices.paidPaise,
        status: electricityInvoices.status,
      })
      .from(electricityInvoices)
      .where(
        and(
          inArray(electricityInvoices.bookingId, bookingIds),
          eq(electricityInvoices.billingMonth, billingMonth),
        ),
      ),
  ]);

  const rentByBooking = new Map<string, { due: number; paid: number }>();
  for (const r of rentRows) {
    const bucket = rentByBooking.get(r.bookingId) ?? { due: 0, paid: 0 };
    if (r.status === 'pending' || r.status === 'overdue') {
      bucket.due += r.rentPaise;
    }
    if (r.status === 'paid') {
      bucket.paid += r.paidPrincipalPaise + (r.paidLateFeePaise ?? 0);
    }
    rentByBooking.set(r.bookingId, bucket);
  }

  const elecByBooking = new Map<string, { due: number; paid: number }>();
  for (const e of elecRows) {
    const bucket = elecByBooking.get(e.bookingId) ?? { due: 0, paid: 0 };
    if (e.status === 'pending') {
      bucket.due += e.amountPaise;
    }
    if (e.status === 'paid') {
      bucket.paid += e.paidPaise;
    }
    elecByBooking.set(e.bookingId, bucket);
  }

  return residents
    .map((r) => {
      const rent = rentByBooking.get(r.bookingId) ?? { due: 0, paid: 0 };
      const elec = elecByBooking.get(r.bookingId) ?? { due: 0, paid: 0 };
      const depositOutstandingPaise = r.outstandingPaise;
      const totalOutstandingPaise = rent.due + elec.due + depositOutstandingPaise;

      return {
        customerId: r.customerId,
        customerName: r.customerName,
        phone: r.phone,
        bookingId: r.bookingId,
        bookingCode: r.bookingCode,
        roomNumber: r.roomNumber,
        bedCode: r.bedCode,
        rentDuePaise: rent.due,
        rentPaidPaise: rent.paid,
        depositRequiredPaise: r.requiredDepositPaise,
        depositPaidPaise: r.paidAmountPaise,
        depositOutstandingPaise,
        electricityDuePaise: elec.due,
        electricityPaidPaise: elec.paid,
        totalOutstandingPaise,
        depositStatus: depositOutstandingPaise <= 0 && r.paidAmountPaise > 0 ? 'paid' : 'pending',
      } satisfies PgRevenueResidentRow;
    })
    .sort((a, b) => a.customerName.localeCompare(b.customerName));
}

/** MTD deposit refunded for a PG (ledger entries in billing month). */
export async function getPgDepositRefundedMtd(
  pgId: string,
  billingMonthInput?: string,
): Promise<number> {
  const billingMonth = resolveBillingMonth(billingMonthInput);
  const [row] = await db.execute<{ total: number }>(sql`
    SELECT coalesce(sum(dl.amount_paise), 0)::bigint::int AS total
    FROM deposit_ledger dl
    INNER JOIN bookings b ON b.id = dl.booking_id
    INNER JOIN bed_reservations br ON br.booking_id = b.id AND br.kind = 'primary'
    INNER JOIN beds bd ON bd.id = br.bed_id
    INNER JOIN rooms r ON r.id = bd.room_id
    INNER JOIN floors f ON f.id = r.floor_id
    WHERE f.pg_id = ${pgId}::uuid
      AND dl.entry_kind = 'refunded'
      AND dl.created_at >= ${billingMonth}::timestamptz
      AND dl.created_at < (${billingMonth}::date + interval '1 month')::timestamptz
  `);
  return Number(row?.total ?? 0);
}
