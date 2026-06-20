/**
 * Deposit ledger metrics — SSOT for admin revenue, overview, and portfolio totals.
 * All figures come from `deposit_ledger` rows (no UI math).
 */

import { sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { asPlainNumber } from '@/src/lib/format';
import { resolveBillingMonth } from '@/src/lib/dateDefaults';
import { DEPOSIT_COLLECTION_ADJUSTMENT_SQL_PATTERN } from '@/src/lib/deposits/constants';

const PRODUCTION_BOOKING_FILTER = sql`
  EXISTS (
    SELECT 1 FROM bookings b
    INNER JOIN customers c ON c.id = b.customer_id
    WHERE b.id = dl.booking_id
      AND b.is_test = false
      AND c.is_test = false
  )
`;

export type DepositPortfolioMetrics = {
  billingMonth: string;
  /** Sum of all collected ledger entries (all time, production). */
  collectedAllTimePaise: number;
  /** Collected entries in the billing month. */
  collectedMtdPaise: number;
  /** Current refundable balance held (sum of positive per-booking balances). */
  heldPaise: number;
  /** All refunded ledger entries (production). */
  refundedAllTimePaise: number;
  /** Refunded entries in the billing month. */
  refundedMtdPaise: number;
  /**
   * Resident-facing deductions only — excludes admin collection-balance corrections.
   */
  residentDeductionsPaise: number;
};

export type DepositRecordStatus = 'held' | 'refunded' | 'adjusted' | 'collecting';

/** Structured deposit wallet per booking — derived from ledger + booking snapshot. */
export type DepositRecord = {
  id: string;
  residentId: string;
  linkedBookingId: string;
  amountPaise: number;
  collectedPaise: number;
  requiredPaise: number;
  status: DepositRecordStatus;
  createdAt: string;
};

export type DepositCollectedByPgRow = {
  pgId: string;
  collectedPaise: number;
};

function monthBounds(billingMonth: string) {
  return {
    start: sql`${billingMonth}::timestamptz`,
    end: sql`(${billingMonth}::date + interval '1 month')::timestamptz`,
  };
}

export async function getDepositPortfolioMetrics(
  billingMonthInput?: string,
): Promise<DepositPortfolioMetrics> {
  const billingMonth = resolveBillingMonth(billingMonthInput);
  const { start, end } = monthBounds(billingMonth);

  const [
    collectedAllTimeRow,
    collectedMtdRow,
    heldRow,
    refundedAllTimeRow,
    refundedMtdRow,
    deductionsRow,
  ] = await Promise.all([
    db.execute<{ total: number }>(sql`
      SELECT coalesce(sum(dl.amount_paise), 0)::bigint::int AS total
      FROM deposit_ledger dl
      WHERE dl.entry_kind = 'collected'
        AND ${PRODUCTION_BOOKING_FILTER}
    `),
    db.execute<{ total: number }>(sql`
      SELECT coalesce(sum(dl.amount_paise), 0)::bigint::int AS total
      FROM deposit_ledger dl
      WHERE dl.entry_kind = 'collected'
        AND dl.created_at >= ${start}
        AND dl.created_at < ${end}
        AND ${PRODUCTION_BOOKING_FILTER}
    `),
    db.execute<{ total: number }>(sql`
      SELECT coalesce(sum(sub.balance), 0)::bigint::int AS total
      FROM (
        SELECT greatest(coalesce(sum(dl.amount_paise), 0), 0)::bigint::int AS balance
        FROM deposit_ledger dl
        WHERE ${PRODUCTION_BOOKING_FILTER}
        GROUP BY dl.booking_id
        HAVING greatest(coalesce(sum(dl.amount_paise), 0), 0) > 0
      ) sub
    `),
    db.execute<{ total: number }>(sql`
      SELECT coalesce(-sum(dl.amount_paise), 0)::bigint::int AS total
      FROM deposit_ledger dl
      WHERE dl.entry_kind = 'refunded'
        AND ${PRODUCTION_BOOKING_FILTER}
    `),
    db.execute<{ total: number }>(sql`
      SELECT coalesce(-sum(dl.amount_paise), 0)::bigint::int AS total
      FROM deposit_ledger dl
      WHERE dl.entry_kind = 'refunded'
        AND dl.created_at >= ${start}
        AND dl.created_at < ${end}
        AND ${PRODUCTION_BOOKING_FILTER}
    `),
    db.execute<{ total: number }>(sql`
      SELECT coalesce(-sum(dl.amount_paise), 0)::bigint::int AS total
      FROM deposit_ledger dl
      WHERE dl.entry_kind = 'deducted'
        AND dl.reason NOT LIKE ${DEPOSIT_COLLECTION_ADJUSTMENT_SQL_PATTERN}
        AND ${PRODUCTION_BOOKING_FILTER}
    `),
  ]);

  return {
    billingMonth,
    collectedAllTimePaise: asPlainNumber(collectedAllTimeRow[0]?.total),
    collectedMtdPaise: asPlainNumber(collectedMtdRow[0]?.total),
    heldPaise: asPlainNumber(heldRow[0]?.total),
    refundedAllTimePaise: asPlainNumber(refundedAllTimeRow[0]?.total),
    refundedMtdPaise: asPlainNumber(refundedMtdRow[0]?.total),
    residentDeductionsPaise: asPlainNumber(deductionsRow[0]?.total),
  };
}

/** Deposit collected in a billing month, grouped by PG — ledger only. */
export async function getDepositCollectedByPgFromLedger(
  billingMonthInput?: string,
): Promise<DepositCollectedByPgRow[]> {
  const billingMonth = resolveBillingMonth(billingMonthInput);
  const { start, end } = monthBounds(billingMonth);

  const rows = await db.execute<{ pg_id: string; total: number }>(sql`
    SELECT
      p.id::text AS pg_id,
      coalesce(sum(dl.amount_paise), 0)::bigint::int AS total
    FROM deposit_ledger dl
    INNER JOIN bookings b ON b.id = dl.booking_id
    INNER JOIN customers c ON c.id = b.customer_id
    INNER JOIN bed_reservations br ON br.booking_id = b.id AND br.kind = 'primary'
    INNER JOIN beds bd ON bd.id = br.bed_id
    INNER JOIN rooms r ON r.id = bd.room_id
    INNER JOIN floors f ON f.id = r.floor_id
    INNER JOIN pgs p ON p.id = f.pg_id
    WHERE dl.entry_kind = 'collected'
      AND dl.created_at >= ${start}
      AND dl.created_at < ${end}
      AND b.is_test = false
      AND c.is_test = false
    GROUP BY p.id
    HAVING coalesce(sum(dl.amount_paise), 0) > 0
  `);

  return Array.from(rows).map((r) => ({
    pgId: r.pg_id,
    collectedPaise: asPlainNumber(r.total),
  }));
}

/** Global deposit refund totals for a billing month (for business metrics). */
export async function getDepositRefundsForBillingMonth(billingMonthInput?: string): Promise<{
  count: number;
  paise: number;
}> {
  const billingMonth = resolveBillingMonth(billingMonthInput);
  const { start, end } = monthBounds(billingMonth);

  const [row] = await db.execute<{ count: number; total: number }>(sql`
    SELECT
      count(DISTINCT dl.booking_id)::int AS count,
      coalesce(-sum(dl.amount_paise), 0)::bigint::int AS total
    FROM deposit_ledger dl
    INNER JOIN bookings b ON b.id = dl.booking_id
    INNER JOIN customers c ON c.id = b.customer_id
    WHERE dl.entry_kind = 'refunded'
      AND dl.created_at >= ${start}
      AND dl.created_at < ${end}
      AND b.is_test = false
      AND c.is_test = false
  `);

  return {
    count: asPlainNumber(row?.count),
    paise: asPlainNumber(row?.total),
  };
}
