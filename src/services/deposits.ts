/**
 * Phase 5.5 — deposit ledger.
 *
 *   recordDepositCollected()      — write a +amount row (e.g. when the
 *                                   booking's deposit payment lands)
 *   recordDepositDeducted()       — write a -amount row (vacating
 *                                   penalty, damages, missed rent)
 *   recordDepositRefunded()       — write a -amount row (refund out)
 *   getDepositSummaryForBooking() — read: paid / deducted / refunded /
 *                                   refundable balance
 *
 * The ledger is append-only by convention — there is no `update` or
 * `delete` helper. The DB-level CHECK on (entry_kind, sign(amount))
 * means a buggy caller can't get a sign-flipped entry past the storage
 * layer.
 *
 * "Refundable balance" = sum(amount_paise) FOR booking. With the
 * sign convention (collected > 0, deducted/refunded < 0), this gives
 * the running balance directly.
 *
 * Backfill: for existing bookings created BEFORE this phase, the
 * deposit on `bookings.deposit_paise` is NOT automatically mirrored
 * here. A standalone backfill helper (`backfillDepositCollectedRows`)
 * is provided so the operator can do it once.
 */

import { and, eq, isNull, sql } from 'drizzle-orm';
import { db } from '../db/client';
import {
  auditLog,
  bookings,
  depositLedger,
  type DepositLedgerEntry,
} from '../db/schema';

// ───────────────────────────────────────────────────────────────────────────
// Public types
// ───────────────────────────────────────────────────────────────────────────

export type DepositSummary = {
  bookingId: string;
  customerId: string;
  collectedPaise: number;
  deductedPaise: number; // positive number representing total deductions
  refundedPaise: number; // positive number representing total refunds
  refundableBalancePaise: number; // collected - deducted - refunded
  entries: DepositLedgerEntry[];
};

// ───────────────────────────────────────────────────────────────────────────
// Writers
// ───────────────────────────────────────────────────────────────────────────

/**
 * Mirror a deposit payment into the ledger. Idempotent at the
 * `related_payment_id` level — calling this twice with the same payment
 * id is a no-op. Mirrors are scoped per (booking, payment) so a
 * deposit payment can never be double-counted.
 */
export async function recordDepositCollected(input: {
  bookingId: string;
  customerId: string;
  amountPaise: number;
  reason: string;
  relatedPaymentId?: string | null;
  createdByAdminId?: string | null;
}): Promise<{ ok: true; entryId: string; created: boolean }> {
  if (input.amountPaise <= 0) {
    throw new Error('recordDepositCollected: amountPaise must be > 0');
  }

  if (input.relatedPaymentId) {
    const [existing] = await db
      .select({ id: depositLedger.id })
      .from(depositLedger)
      .where(
        and(
          eq(depositLedger.bookingId, input.bookingId),
          eq(depositLedger.entryKind, 'collected'),
          eq(depositLedger.relatedPaymentId, input.relatedPaymentId),
        ),
      )
      .limit(1);
    if (existing) return { ok: true, entryId: existing.id, created: false };
  }

  const [row] = await db
    .insert(depositLedger)
    .values({
      bookingId: input.bookingId,
      customerId: input.customerId,
      entryKind: 'collected',
      amountPaise: input.amountPaise,
      reason: input.reason,
      relatedPaymentId: input.relatedPaymentId ?? null,
      createdByAdminId: input.createdByAdminId ?? null,
    })
    .returning({ id: depositLedger.id });

  await db.insert(auditLog).values({
    actorType: input.createdByAdminId ? 'admin' : 'system',
    actorId: input.createdByAdminId ?? null,
    entity: 'deposit_ledger',
    entityId: row.id,
    action: 'deposit_collected',
    diff: { bookingId: input.bookingId, amountPaise: input.amountPaise },
  });

  return { ok: true, entryId: row.id, created: true };
}

/**
 * Write a deduction. Amount is supplied as a POSITIVE number — this
 * helper signs it correctly for storage.
 */
export async function recordDepositDeducted(input: {
  bookingId: string;
  customerId: string;
  amountPaise: number; // positive
  reason: string;
  relatedVacatingId?: string | null;
  createdByAdminId?: string | null;
}): Promise<{ ok: true; entryId: string }> {
  if (input.amountPaise <= 0) {
    throw new Error('recordDepositDeducted: amountPaise must be > 0');
  }
  const [row] = await db
    .insert(depositLedger)
    .values({
      bookingId: input.bookingId,
      customerId: input.customerId,
      entryKind: 'deducted',
      amountPaise: -input.amountPaise,
      reason: input.reason,
      relatedVacatingId: input.relatedVacatingId ?? null,
      createdByAdminId: input.createdByAdminId ?? null,
    })
    .returning({ id: depositLedger.id });

  await db.insert(auditLog).values({
    actorType: input.createdByAdminId ? 'admin' : 'system',
    actorId: input.createdByAdminId ?? null,
    entity: 'deposit_ledger',
    entityId: row.id,
    action: 'deposit_deducted',
    diff: {
      bookingId: input.bookingId,
      amountPaise: input.amountPaise,
      reason: input.reason,
    },
  });

  return { ok: true, entryId: row.id };
}

/**
 * Write a refund. Amount is supplied as a POSITIVE number.
 */
export async function recordDepositRefunded(input: {
  bookingId: string;
  customerId: string;
  amountPaise: number;
  reason: string;
  relatedPaymentId?: string | null;
  relatedVacatingId?: string | null;
  createdByAdminId?: string | null;
}): Promise<{ ok: true; entryId: string }> {
  if (input.amountPaise <= 0) {
    throw new Error('recordDepositRefunded: amountPaise must be > 0');
  }
  const [row] = await db
    .insert(depositLedger)
    .values({
      bookingId: input.bookingId,
      customerId: input.customerId,
      entryKind: 'refunded',
      amountPaise: -input.amountPaise,
      reason: input.reason,
      relatedPaymentId: input.relatedPaymentId ?? null,
      relatedVacatingId: input.relatedVacatingId ?? null,
      createdByAdminId: input.createdByAdminId ?? null,
    })
    .returning({ id: depositLedger.id });

  await db.insert(auditLog).values({
    actorType: input.createdByAdminId ? 'admin' : 'system',
    actorId: input.createdByAdminId ?? null,
    entity: 'deposit_ledger',
    entityId: row.id,
    action: 'deposit_refunded',
    diff: { bookingId: input.bookingId, amountPaise: input.amountPaise },
  });
  return { ok: true, entryId: row.id };
}

// ───────────────────────────────────────────────────────────────────────────
// Readers
// ───────────────────────────────────────────────────────────────────────────

export async function getDepositSummaryForBooking(
  bookingId: string,
): Promise<DepositSummary | null> {
  const [booking] = await db
    .select({ customerId: bookings.customerId })
    .from(bookings)
    .where(eq(bookings.id, bookingId))
    .limit(1);
  if (!booking) return null;

  const entries = await db
    .select()
    .from(depositLedger)
    .where(eq(depositLedger.bookingId, bookingId))
    .orderBy(depositLedger.createdAt);

  let collected = 0;
  let deducted = 0;
  let refunded = 0;
  for (const e of entries) {
    if (e.entryKind === 'collected') collected += e.amountPaise;
    else if (e.entryKind === 'deducted') deducted += -e.amountPaise;
    else if (e.entryKind === 'refunded') refunded += -e.amountPaise;
  }

  return {
    bookingId,
    customerId: booking.customerId,
    collectedPaise: collected,
    deductedPaise: deducted,
    refundedPaise: refunded,
    refundableBalancePaise: collected - deducted - refunded,
    entries,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// One-shot backfill (operator runs once after deploying Phase 5.5)
// ───────────────────────────────────────────────────────────────────────────

/**
 * For every confirmed booking with `deposit_paise > 0` that has NO
 * `collected` row in the ledger, write one. This makes pre-Phase-5.5
 * bookings show their deposit balance correctly in the new resident +
 * admin dashboards.
 */
export async function backfillDepositCollectedRows(): Promise<{
  inserted: number;
  bookingIds: string[];
}> {
  // Find confirmed monthly bookings missing a `collected` entry.
  const candidates = await db
    .select({
      id: bookings.id,
      customerId: bookings.customerId,
      depositPaise: bookings.depositPaise,
    })
    .from(bookings)
    .leftJoin(
      depositLedger,
      and(
        eq(depositLedger.bookingId, bookings.id),
        eq(depositLedger.entryKind, 'collected'),
      ),
    )
    .where(
      and(
        sql`${bookings.depositPaise} > 0`,
        eq(bookings.status, 'confirmed'),
        isNull(depositLedger.id),
      ),
    );

  // de-dup (the left-join can fan out if there are multiple deducted rows).
  const seen = new Set<string>();
  const todo: typeof candidates = [];
  for (const c of candidates) {
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    todo.push(c);
  }

  const bookingIds: string[] = [];
  for (const c of todo) {
    await db.insert(depositLedger).values({
      bookingId: c.id,
      customerId: c.customerId,
      entryKind: 'collected',
      amountPaise: c.depositPaise,
      reason: 'backfilled from bookings.deposit_paise',
    });
    bookingIds.push(c.id);
  }
  return { inserted: bookingIds.length, bookingIds };
}
