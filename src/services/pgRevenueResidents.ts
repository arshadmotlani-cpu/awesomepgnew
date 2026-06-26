/**
 * Resident-level financial breakdown for PG revenue / collection screens.
 * All amounts from Resident Financial Account (SSOT).
 */

import { getBookingFinancialAccount } from '@/src/services/residentFinancialEngine';
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
  const detail = await getPgDepositCollectionDetail(pgId, billingMonthInput);
  if (!detail) return [];

  const residents = [...detail.paidResidents, ...detail.pendingResidents];
  if (residents.length === 0) return [];

  const rows = await Promise.all(
    residents.map(async (r) => {
      const account = await getBookingFinancialAccount({
        bookingId: r.bookingId,
        customerId: r.customerId,
        customerName: r.customerName,
        customerPhone: r.phone,
        bookingCode: r.bookingCode,
        pgId,
        pgName: detail.pgName,
        roomNumber: r.roomNumber,
        depositPaise: r.requiredDepositPaise,
        depositDuePaise: r.outstandingPaise,
      });

      return {
        customerId: r.customerId,
        customerName: r.customerName,
        phone: r.phone,
        bookingId: r.bookingId,
        bookingCode: r.bookingCode,
        roomNumber: r.roomNumber,
        bedCode: r.bedCode,
        rentDuePaise: account.rentOutstandingPaise,
        rentPaidPaise: account.rent.paidPaise,
        depositRequiredPaise: r.requiredDepositPaise,
        depositPaidPaise: r.paidAmountPaise,
        depositOutstandingPaise: account.deposit.outstandingPaise,
        electricityDuePaise: account.electricityOutstandingPaise,
        electricityPaidPaise: account.electricity.paidPaise,
        totalOutstandingPaise: account.totalOutstandingPaise,
        depositStatus:
          account.deposit.outstandingPaise <= 0 && r.paidAmountPaise > 0 ? 'paid' : 'pending',
      } satisfies PgRevenueResidentRow;
    }),
  );

  return rows.sort((a, b) => a.customerName.localeCompare(b.customerName));
}

/** MTD deposit refunded for a PG (ledger entries in billing month). */
export async function getPgDepositRefundedMtd(
  pgId: string,
  billingMonthInput?: string,
): Promise<number> {
  const { resolveBillingMonth } = await import('@/src/lib/dateDefaults');
  const { sql } = await import('drizzle-orm');
  const { db } = await import('@/src/db/client');
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
