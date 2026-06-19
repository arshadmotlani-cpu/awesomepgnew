/**
 * Phase 5.5 — deposit ledger.
 *
 *   recordDepositCollected()      — write a +amount row (e.g. when the
 *                                   booking's deposit payment lands)
 *   applyDepositDeduction()       — canonical deduction (depositSettlement)
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
import type { PricingSnapshot } from '@/src/db/schema/bookings';
import { coerceNonNegativePaise, asPlainNumber } from '@/src/lib/format';
import { applyDepositDeduction } from '@/src/services/depositSettlement';

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

  const { scheduleAdminNotificationSync } = await import('@/src/services/adminLiveSync');
  scheduleAdminNotificationSync();

  return { ok: true, entryId: row.id, created: true };
}

/**
 * Adjust ledger collected balance to target without mutating bookings.deposit_paise
 * (required deposit). Use for admin wallet corrections.
 */
export async function adjustDepositCollectedBalance(input: {
  bookingId: string;
  customerId: string;
  targetCollectedPaise: number;
  reason: string;
  createdByAdminId: string;
}): Promise<{ ok: true; ledgerDelta: number } | { ok: false; error: string }> {
  const targetCollectedPaise = coerceNonNegativePaise(input.targetCollectedPaise);
  if (!Number.isFinite(targetCollectedPaise)) {
    return { ok: false, error: 'Collected amount must be a valid number.' };
  }

  console.info('[deposits] adjustDepositCollectedBalance start', {
    bookingId: input.bookingId,
    customerId: input.customerId,
    targetCollectedPaise,
    adminId: input.createdByAdminId,
  });

  const summary = await getDepositSummaryForBooking(input.bookingId);
  const ledgerCollectedPaise = summary?.collectedPaise ?? 0;
  const ledgerDelta = targetCollectedPaise - ledgerCollectedPaise;

  if (ledgerDelta > 0) {
    await recordDepositCollected({
      bookingId: input.bookingId,
      customerId: input.customerId,
      amountPaise: ledgerDelta,
      reason: input.reason,
      createdByAdminId: input.createdByAdminId,
    });
  } else if (ledgerDelta < 0) {
    const deducted = await applyDepositDeduction({
      bookingId: input.bookingId,
      customerId: input.customerId,
      amountPaise: -ledgerDelta,
      reason: input.reason,
      adminId: input.createdByAdminId,
    });
    if (!deducted.ok) {
      return { ok: false, error: deducted.error };
    }
  }

  if (ledgerDelta !== 0) {
    await db.insert(auditLog).values({
      actorType: 'admin',
      actorId: input.createdByAdminId,
      entity: 'booking',
      entityId: input.bookingId,
      action: 'deposit_collected_adjusted',
      diff: {
        ledgerCollectedPaise,
        targetCollectedPaise,
        ledgerDelta,
        reason: input.reason,
      },
    });
  }

  console.info('[deposits] adjustDepositCollectedBalance ok', {
    bookingId: input.bookingId,
    customerId: input.customerId,
    ledgerCollectedPaise,
    targetCollectedPaise,
    ledgerDelta,
  });

  return { ok: true, ledgerDelta };
}

/** Record an advance/offline deposit payment — separate from bed assignment. */
export async function recordAdvanceDeposit(input: {
  bookingId: string;
  customerId: string;
  amountPaise: number;
  createdByAdminId: string;
  note?: string;
}): Promise<{ ok: true; entryId: string }> {
  const result = await recordDepositCollected({
    bookingId: input.bookingId,
    customerId: input.customerId,
    amountPaise: input.amountPaise,
    reason: input.note?.trim()
      ? `ADVANCE_DEPOSIT: ${input.note.trim()}`
      : 'ADVANCE_DEPOSIT',
    createdByAdminId: input.createdByAdminId,
  });
  return { ok: true, entryId: result.entryId };
}

/**
 * Set the booking's deposit to `targetCollectedPaise` and reconcile the
 * append-only ledger so collected balance matches. Use when an admin
 * records a grandfathered amount or fixes a mistake after assignment.
 */
export async function correctDepositCollected(input: {
  bookingId: string;
  customerId: string;
  targetCollectedPaise: number;
  reason: string;
  createdByAdminId: string;
}): Promise<{ ok: true; previousPaise: number; targetPaise: number }> {
  const targetPaise = coerceNonNegativePaise(input.targetCollectedPaise);
  if (!Number.isFinite(targetPaise)) {
    throw new Error('correctDepositCollected: targetCollectedPaise must be a valid number');
  }

  console.info('[deposits] correctDepositCollected start', {
    bookingId: input.bookingId,
    customerId: input.customerId,
    targetPaise,
    adminId: input.createdByAdminId,
  });

  const [booking] = await db
    .select({
      depositPaise: bookings.depositPaise,
      totalPaise: bookings.totalPaise,
      subtotalPaise: bookings.subtotalPaise,
      pricingSnapshot: bookings.pricingSnapshot,
    })
    .from(bookings)
    .where(eq(bookings.id, input.bookingId))
    .limit(1);
  if (!booking) throw new Error('Booking not found.');

  const summary = await getDepositSummaryForBooking(input.bookingId);
  const ledgerCollectedPaise = summary?.collectedPaise ?? 0;
  const previousPaise = coerceNonNegativePaise(booking.depositPaise);
  const target = targetPaise;

  const snapshot = (booking.pricingSnapshot ?? { perBed: [], computedAt: new Date().toISOString() }) as PricingSnapshot;
  if (snapshot.perBed.length > 0) {
    const perBedDeposit = Math.floor(target / snapshot.perBed.length);
    const remainder = target - perBedDeposit * snapshot.perBed.length;
    snapshot.perBed = snapshot.perBed.map((bed, index) => ({
      ...bed,
      securityDepositPaise: perBedDeposit + (index === 0 ? remainder : 0),
    }));
  }

  const priorTotal = coerceNonNegativePaise(booking.totalPaise);
  const newTotalPaise = priorTotal - previousPaise + target;
  if (!Number.isFinite(newTotalPaise) || newTotalPaise < 0) {
    throw new Error('correctDepositCollected: booking total would become invalid');
  }

  await db
    .update(bookings)
    .set({
      depositPaise: target,
      totalPaise: newTotalPaise,
      pricingSnapshot: snapshot,
      updatedAt: new Date(),
    })
    .where(eq(bookings.id, input.bookingId));

  const ledgerDelta = target - ledgerCollectedPaise;
  if (ledgerDelta > 0) {
    await recordDepositCollected({
      bookingId: input.bookingId,
      customerId: input.customerId,
      amountPaise: ledgerDelta,
      reason: input.reason,
      createdByAdminId: input.createdByAdminId,
    });
  } else if (ledgerDelta < 0) {
    const deducted = await applyDepositDeduction({
      bookingId: input.bookingId,
      customerId: input.customerId,
      amountPaise: -ledgerDelta,
      reason: input.reason,
      adminId: input.createdByAdminId,
    });
    if (!deducted.ok) {
      throw new Error(deducted.error);
    }
  }

  await db.insert(auditLog).values({
    actorType: 'admin',
    actorId: input.createdByAdminId,
    entity: 'booking',
    entityId: input.bookingId,
    action: 'deposit_corrected',
    diff: {
      previousPaise,
      targetPaise,
      ledgerCollectedPaise,
      ledgerDelta,
      reason: input.reason,
    },
  });

  const { syncDepositCollectionFromLedger } = await import('@/src/services/depositCollection');
  await syncDepositCollectionFromLedger(input.bookingId);

  console.info('[deposits] correctDepositCollected ok', {
    bookingId: input.bookingId,
    customerId: input.customerId,
    previousPaise,
    targetPaise: target,
    ledgerDelta,
  });

  return { ok: true, previousPaise, targetPaise: target };
}

// ───────────────────────────────────────────────────────────────────────────
// Readers
// ───────────────────────────────────────────────────────────────────────────

export async function getDepositSummaryForBooking(
  bookingId: string,
): Promise<DepositSummary | null> {
  try {
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
      const amount = asPlainNumber(e.amountPaise);
      if (e.entryKind === 'collected') collected += coerceNonNegativePaise(amount);
      else if (e.entryKind === 'deducted') deducted += coerceNonNegativePaise(-amount);
      else if (e.entryKind === 'refunded') refunded += coerceNonNegativePaise(-amount);
    }

    const summary = {
      bookingId,
      customerId: booking.customerId,
      collectedPaise: collected,
      deductedPaise: deducted,
      refundedPaise: refunded,
      refundableBalancePaise: collected - deducted - refunded,
      entries,
    };

    return summary;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    console.error('[deposits] getDepositSummaryForBooking failed', {
      bookingId,
      message,
      stack,
    });
    throw err;
  }
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
