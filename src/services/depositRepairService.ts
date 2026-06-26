/**
 * Append-only deposit repair — corrective ledger entries without deleting rows.
 */

import { eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { auditLog, bookings, depositLedger } from '@/src/db/schema';
import type { AdminSession } from '@/src/lib/auth/session';
import { getDepositSummaryForBooking } from '@/src/services/deposits';

export type DepositRepairPlan = {
  bookingId: string;
  bookingCode: string;
  currentCollectedPaise: number;
  currentRefundablePaise: number;
  targetCollectedPaise: number;
  adjustmentPaise: number;
  appendOnly: true;
};

export type DepositRepairResult = {
  ok: boolean;
  message: string;
  plan?: DepositRepairPlan;
  entryId?: string;
};

export async function planAppendOnlyDepositRepair(input: {
  bookingId: string;
  targetCollectedPaise: number;
}): Promise<DepositRepairPlan | null> {
  const [booking] = await db
    .select({ id: bookings.id, bookingCode: bookings.bookingCode })
    .from(bookings)
    .where(eq(bookings.id, input.bookingId))
    .limit(1);

  if (!booking) return null;

  const summary = await getDepositSummaryForBooking(input.bookingId);
  const currentCollected = summary?.collectedPaise ?? 0;
  const adjustment = input.targetCollectedPaise - currentCollected;

  return {
    bookingId: booking.id,
    bookingCode: booking.bookingCode,
    currentCollectedPaise: currentCollected,
    currentRefundablePaise: summary?.refundableBalancePaise ?? 0,
    targetCollectedPaise: input.targetCollectedPaise,
    adjustmentPaise: adjustment,
    appendOnly: true,
  };
}

export async function executeAppendOnlyDepositRepair(
  session: AdminSession,
  input: { bookingId: string; targetCollectedPaise: number; reason: string },
): Promise<DepositRepairResult> {
  const plan = await planAppendOnlyDepositRepair(input);
  if (!plan) return { ok: false, message: 'Booking not found.' };

  if (plan.adjustmentPaise === 0) {
    return { ok: true, message: 'No adjustment needed — ledger already matches target.', plan };
  }

  const [booking] = await db
    .select({ customerId: bookings.customerId })
    .from(bookings)
    .where(eq(bookings.id, input.bookingId))
    .limit(1);

  if (!booking) return { ok: false, message: 'Booking not found.' };

  const [entry] = await db
    .insert(depositLedger)
    .values({
      bookingId: input.bookingId,
      customerId: booking.customerId,
      entryKind: plan.adjustmentPaise > 0 ? 'collected' : 'deducted',
      amountPaise: plan.adjustmentPaise > 0 ? plan.adjustmentPaise : plan.adjustmentPaise,
      reason: `repair:${input.reason}`,
      createdByAdminId: session.adminId,
    })
    .returning({ id: depositLedger.id });

  await db.insert(auditLog).values({
    actorType: 'admin',
    actorId: session.adminId,
    entity: 'deposit_ledger',
    entityId: entry!.id,
    action: 'append_only_repair',
    diff: { plan, reason: input.reason },
  });

  return {
    ok: true,
    message: `Appended corrective entry (${plan.adjustmentPaise} paise).`,
    plan,
    entryId: entry!.id,
  };
}

/** Angatra Mandal class repair — ₹4,500 target. */
export async function repairAngatraDeposit(session: AdminSession): Promise<DepositRepairResult> {
  const { db: database } = await import('@/src/db/client');
  const { sql } = await import('drizzle-orm');

  const rows = await database.execute<{ id: string }>(sql`
    SELECT b.id FROM bookings b
    JOIN customers c ON c.id = b.customer_id
    WHERE c.phone LIKE '%7074754939%' OR b.booking_code = 'APG-2026-0013'
    LIMIT 1
  `);

  const bookingId = Array.from(rows)[0]?.id;
  if (!bookingId) return { ok: false, message: 'Angatra booking not found.' };

  return executeAppendOnlyDepositRepair(session, {
    bookingId,
    targetCollectedPaise: 450_000,
    reason: 'angatra_mandal_reconcile',
  });
}
