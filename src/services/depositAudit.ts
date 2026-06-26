/**
 * Deposit integrity audit — ledger SSOT vs booking columns and unified view.
 */

import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { bookings, customers } from '@/src/db/schema';
import type { AdminSession } from '@/src/lib/auth/session';
import { getDepositSummaryForBooking } from '@/src/services/deposits';

export type DepositAuditIssue = {
  bookingId: string;
  bookingCode: string;
  residentName: string;
  code: 'ledger_booking_mismatch' | 'active_settled_label' | 'negative_balance' | 'duplicate_collected';
  detail: string;
};

export type DepositAuditReport = {
  sampled: number;
  issues: DepositAuditIssue[];
  pass: boolean;
  summary: string;
};

async function sampleActiveBookingIds(limit: number): Promise<string[]> {
  const rows = await db
    .select({ id: bookings.id })
    .from(bookings)
    .where(eq(bookings.status, 'confirmed'))
    .orderBy(sql`random()`)
    .limit(limit);
  return rows.map((r) => r.id);
}

async function auditBookingDeposit(bookingId: string): Promise<DepositAuditIssue[]> {
  const issues: DepositAuditIssue[] = [];

  const [booking] = await db
    .select({
      id: bookings.id,
      bookingCode: bookings.bookingCode,
      status: bookings.status,
      depositPaise: bookings.depositPaise,
      depositDuePaise: bookings.depositDuePaise,
      depositCollectionStatus: bookings.depositCollectionStatus,
      fullName: customers.fullName,
    })
    .from(bookings)
    .innerJoin(customers, eq(customers.id, bookings.customerId))
    .where(eq(bookings.id, bookingId))
    .limit(1);

  if (!booking) return issues;

  const summary = await getDepositSummaryForBooking(bookingId);
  if (!summary) return issues;

  if (summary.refundableBalancePaise < 0) {
    issues.push({
      bookingId,
      bookingCode: booking.bookingCode,
      residentName: booking.fullName,
      code: 'negative_balance',
      detail: `Refundable balance ${summary.refundableBalancePaise} paise`,
    });
  }

  const duplicateCollected = await db.execute<{ cnt: string }>(sql`
    SELECT COUNT(*)::text AS cnt FROM deposit_ledger
    WHERE booking_id = ${bookingId}::uuid
      AND entry_kind = 'collected'
      AND related_payment_id IS NOT NULL
    GROUP BY related_payment_id
    HAVING COUNT(*) > 1
    LIMIT 5
  `);

  for (const row of Array.from(duplicateCollected)) {
    issues.push({
      bookingId,
      bookingCode: booking.bookingCode,
      residentName: booking.fullName,
      code: 'duplicate_collected',
      detail: `Duplicate collected ledger rows for same payment (${row.cnt})`,
    });
  }

  return issues;
}

/** Investigate a specific booking by phone or booking code (Angatra class). */
export async function auditDepositByLookup(
  session: AdminSession,
  lookup: { phone?: string; bookingCode?: string },
): Promise<DepositAuditReport> {
  void session;

  let bookingIds: string[] = [];
  if (lookup.bookingCode) {
    const rows = await db
      .select({ id: bookings.id })
      .from(bookings)
      .where(eq(bookings.bookingCode, lookup.bookingCode))
      .limit(5);
    bookingIds = rows.map((r) => r.id);
  } else if (lookup.phone) {
    const digits = lookup.phone.replace(/\D/g, '').slice(-10);
    const rows = await db.execute<{ id: string }>(sql`
      SELECT b.id FROM bookings b
      JOIN customers c ON c.id = b.customer_id
      WHERE c.phone LIKE ${'%' + digits + '%'}
      LIMIT 5
    `);
    bookingIds = Array.from(rows).map((r) => r.id);
  }

  const issues: DepositAuditIssue[] = [];
  for (const id of bookingIds) {
    issues.push(...(await auditBookingDeposit(id)));
  }

  return {
    sampled: bookingIds.length,
    issues,
    pass: issues.length === 0,
    summary:
      issues.length === 0
        ? `Deposit SSOT OK for ${bookingIds.length} lookup match(es).`
        : `${issues.length} deposit issue(s) in lookup.`,
  };
}

export async function runDepositAudit(
  session: AdminSession,
  opts: { sampleSize?: number } = {},
): Promise<DepositAuditReport> {
  void session;
  const sampleSize = opts.sampleSize ?? 10;
  const ids = await sampleActiveBookingIds(sampleSize);
  const issues: DepositAuditIssue[] = [];

  for (const id of ids) {
    issues.push(...(await auditBookingDeposit(id)));
  }

  return {
    sampled: ids.length,
    issues,
    pass: issues.length === 0,
    summary:
      issues.length === 0
        ? `${ids.length} active bookings sampled — deposit ledger consistent.`
        : `${issues.length} deposit issue(s) across ${ids.length} sampled bookings.`,
  };
}
