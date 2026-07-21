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

import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '../db/client';
import {
  auditLog,
  bookings,
  depositLedger,
  payments,
  type DepositLedgerEntry,
} from '../db/schema';
import type { PricingSnapshot } from '@/src/db/schema/bookings';
import { coerceNonNegativePaise, asPlainNumber } from '@/src/lib/format';
import { guardDepositPaise, guardPlainPaise } from '@/src/lib/deposits/paiseSafety';
import {
  DEPOSIT_COLLECTION_ADJUSTMENT_PREFIX,
  depositCollectionAdjustmentReason,
  isDepositCollectionAdjustmentReason,
} from '@/src/lib/deposits/constants';
import { applyDepositDeduction } from '@/src/services/depositSettlement';

// ───────────────────────────────────────────────────────────────────────────
// Public types
// ───────────────────────────────────────────────────────────────────────────

export type DepositSummary = {
  bookingId: string;
  customerId: string;
  collectedPaise: number;
  deductedPaise: number; // positive number representing total deductions
  /** Resident charges only — excludes admin collection-balance corrections. */
  residentDeductedPaise: number;
  refundedPaise: number; // positive number representing total refunds
  refundableBalancePaise: number; // collected - deducted - refunded
  entries: DepositLedgerEntry[];
};

/** Preserve signed paise for deducted/refunded rows — guardDepositPaise strips negatives. */
function ledgerEntryAmountPaise(value: unknown, field: string): number {
  return guardPlainPaise(value, field);
}

function sanitizeLedgerEntries(entries: DepositLedgerEntry[]): DepositLedgerEntry[] {
  return entries.map((entry, i) => ({
    ...entry,
    reason: entry.reason ?? '',
    deductionCategory: entry.deductionCategory ?? null,
    amountPaise: ledgerEntryAmountPaise(entry.amountPaise, `ledger[${i}].amountPaise`),
  }));
}

function isPostgresMissingColumnError(err: unknown, column: string): boolean {
  let current: unknown = err;
  for (let depth = 0; depth < 5 && current; depth += 1) {
    if (typeof current !== 'object' || current === null) break;
    const record = current as { code?: string; message?: string; cause?: unknown };
    const code = record.code ?? '';
    const message =
      record.message ?? (current instanceof Error ? current.message : '');
    if (code === '42703' && message.includes(column)) return true;
    current = record.cause;
  }
  return false;
}

const depositLedgerBaseColumns = {
  id: depositLedger.id,
  bookingId: depositLedger.bookingId,
  customerId: depositLedger.customerId,
  entryKind: depositLedger.entryKind,
  amountPaise: depositLedger.amountPaise,
  reason: depositLedger.reason,
  relatedPaymentId: depositLedger.relatedPaymentId,
  relatedVacatingId: depositLedger.relatedVacatingId,
  createdByAdminId: depositLedger.createdByAdminId,
  createdAt: depositLedger.createdAt,
};

/** Reads ledger rows without assuming optional columns (e.g. deduction_category) exist. */
export async function fetchDepositLedgerEntriesForBooking(
  bookingId: string,
): Promise<DepositLedgerEntry[]> {
  try {
    const rows = await db
      .select({
        ...depositLedgerBaseColumns,
        deductionCategory: depositLedger.deductionCategory,
      })
      .from(depositLedger)
      .where(eq(depositLedger.bookingId, bookingId))
      .orderBy(depositLedger.createdAt);
    return sanitizeLedgerEntries(rows);
  } catch (err) {
    if (!isPostgresMissingColumnError(err, 'deduction_category')) {
      console.error('[deposits] fetchDepositLedgerEntriesForBooking failed', bookingId, err);
      return [];
    }
    try {
      const rows = await db
        .select(depositLedgerBaseColumns)
        .from(depositLedger)
        .where(eq(depositLedger.bookingId, bookingId))
        .orderBy(depositLedger.createdAt);
      return sanitizeLedgerEntries(
        rows.map((row) => ({ ...row, deductionCategory: null })),
      );
    } catch (fallbackErr) {
      console.error(
        '[deposits] fetchDepositLedgerEntriesForBooking fallback failed',
        bookingId,
        fallbackErr,
      );
      return [];
    }
  }
}

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
  const targetCollectedPaise = guardDepositPaise(
    input.targetCollectedPaise,
    'adjustDepositCollectedBalance.targetCollectedPaise',
  );
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
  const ledgerCollectedPaise = guardDepositPaise(
    summary?.collectedPaise ?? 0,
    'adjustDepositCollectedBalance.ledgerCollectedPaise',
  );
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
      reason: depositCollectionAdjustmentReason(input.reason),
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
      reason: depositCollectionAdjustmentReason(input.reason),
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
      .select({ customerId: bookings.customerId, depositPaise: bookings.depositPaise })
      .from(bookings)
      .where(eq(bookings.id, bookingId))
      .limit(1);
    if (!booking) {
      return null;
    }

    const entries = await fetchDepositLedgerEntriesForBooking(bookingId);

    let collected = 0;
    let ledgerDeducted = 0;
    let refunded = 0;
    let residentDeducted = 0;
    let ledgerBalance = 0;
    for (const e of entries) {
      const amount = ledgerEntryAmountPaise(e.amountPaise, 'summary.ledgerEntry.amountPaise');
      ledgerBalance += amount;
      if (e.entryKind === 'collected') collected += coerceNonNegativePaise(amount);
      else if (e.entryKind === 'deducted') {
        const abs = coerceNonNegativePaise(-amount);
        ledgerDeducted += abs;
        if (!isDepositCollectionAdjustmentReason(e.reason)) {
          residentDeducted += abs;
        }
      } else if (e.entryKind === 'refunded') refunded += coerceNonNegativePaise(-amount);
    }

    if (entries.length === 0 && collected === 0) {
      const [paymentRow] = await db
        .select({
          total: sql<number>`coalesce(sum(${payments.amountPaise}), 0)::bigint::int`,
        })
        .from(payments)
        .where(
          and(
            eq(payments.bookingId, bookingId),
            eq(payments.purpose, 'deposit'),
            eq(payments.status, 'succeeded'),
          ),
        );
      collected = coerceNonNegativePaise(asPlainNumber(paymentRow?.total));
    }

    const summary = {
      bookingId,
      customerId: booking.customerId,
      collectedPaise: guardDepositPaise(collected, 'summary.collectedPaise'),
      deductedPaise: guardDepositPaise(residentDeducted, 'summary.deductedPaise'),
      refundedPaise: guardDepositPaise(refunded, 'summary.refundedPaise'),
      residentDeductedPaise: guardDepositPaise(residentDeducted, 'summary.residentDeductedPaise'),
      refundableBalancePaise: guardDepositPaise(
        Math.max(0, ledgerBalance),
        'summary.refundableBalancePaise',
      ),
      entries,
    };

    return summary;
  } catch (err) {
    console.error('[deposits] getDepositSummaryForBooking failed', bookingId, err);
    return null;
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
      depositDuePaise: bookings.depositDuePaise,
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
        sql`coalesce(${bookings.depositDuePaise}, 0) = 0`,
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

export type ReconcileDepositLedgerPlan = {
  bookingId: string;
  bookingCode: string | null;
  requiredPaise: number;
  targetCollectedPaise: number;
  ledgerBefore: Array<{ id: string; entryKind: string; amountPaise: number; reason: string }>;
  deleteIds: string[];
  willInsertCollectedPaise: number;
};

/** Remove duplicate/erroneous ledger rows and leave one collected entry at target. */
export async function planReconcileDepositLedger(input: {
  bookingId: string;
  targetCollectedPaise: number;
  targetRequiredPaise?: number;
}): Promise<ReconcileDepositLedgerPlan | null> {
  const [booking] = await db
    .select({
      id: bookings.id,
      bookingCode: bookings.bookingCode,
      depositPaise: bookings.depositPaise,
      customerId: bookings.customerId,
    })
    .from(bookings)
    .where(eq(bookings.id, input.bookingId))
    .limit(1);
  if (!booking) return null;

  const entries = await db
    .select()
    .from(depositLedger)
    .where(eq(depositLedger.bookingId, input.bookingId))
    .orderBy(depositLedger.createdAt);

  const targetCollected = guardDepositPaise(
    input.targetCollectedPaise,
    'planReconcileDepositLedger.targetCollectedPaise',
  );
  const required = guardDepositPaise(
    input.targetRequiredPaise ?? booking.depositPaise,
    'planReconcileDepositLedger.requiredPaise',
  );

  return {
    bookingId: booking.id,
    bookingCode: booking.bookingCode,
    requiredPaise: required,
    targetCollectedPaise: targetCollected,
    ledgerBefore: entries.map((e) => ({
      id: e.id,
      entryKind: e.entryKind,
      amountPaise: e.amountPaise,
      reason: e.reason,
    })),
    deleteIds: entries.map((e) => e.id),
    willInsertCollectedPaise: targetCollected,
  };
}

export async function executeReconcileDepositLedger(input: {
  bookingId: string;
  customerId: string;
  targetCollectedPaise: number;
  targetRequiredPaise?: number;
  adminId: string;
  reason: string;
}): Promise<
  | { ok: true; plan: ReconcileDepositLedgerPlan; newCollectedEntryId: string }
  | { ok: false; error: string; plan?: ReconcileDepositLedgerPlan | null }
> {
  const plan = await planReconcileDepositLedger({
    bookingId: input.bookingId,
    targetCollectedPaise: input.targetCollectedPaise,
    targetRequiredPaise: input.targetRequiredPaise,
  });
  if (!plan) return { ok: false, error: 'Booking not found.', plan: null };

  if (plan.deleteIds.length === 0 && plan.willInsertCollectedPaise === 0) {
    return { ok: false, error: 'Nothing to reconcile.', plan };
  }

  try {
    await db.transaction(async (tx) => {
      if (plan.deleteIds.length > 0) {
        await tx.delete(depositLedger).where(inArray(depositLedger.id, plan.deleteIds));
      }
      if (plan.willInsertCollectedPaise > 0) {
        await tx.insert(depositLedger).values({
          bookingId: input.bookingId,
          customerId: input.customerId,
          entryKind: 'collected',
          amountPaise: plan.willInsertCollectedPaise,
          reason: input.reason,
          createdByAdminId: input.adminId,
        });
      }

      const required = plan.requiredPaise;
      await tx
        .update(bookings)
        .set({
          depositPaise: required,
          depositDuePaise: Math.max(0, required - plan.willInsertCollectedPaise),
          depositCollectionStatus:
            plan.willInsertCollectedPaise >= required
              ? 'full'
              : plan.willInsertCollectedPaise > 0
                ? 'partial'
                : 'pending',
          updatedAt: new Date(),
        })
        .where(eq(bookings.id, input.bookingId));
    });

    const { syncDepositCollectionFromLedger } = await import('@/src/services/depositCollection');
    await syncDepositCollectionFromLedger(input.bookingId);

    await db.insert(auditLog).values({
      actorType: 'admin',
      actorId: input.adminId,
      entity: 'booking',
      entityId: input.bookingId,
      action: 'deposit_ledger_reconciled',
      diff: {
        deletedLedgerIds: plan.deleteIds,
        targetCollectedPaise: plan.willInsertCollectedPaise,
        requiredPaise: plan.requiredPaise,
        reason: input.reason,
      },
    });

    const [created] = await db
      .select({ id: depositLedger.id })
      .from(depositLedger)
      .where(
        and(
          eq(depositLedger.bookingId, input.bookingId),
          eq(depositLedger.entryKind, 'collected'),
        ),
      )
      .orderBy(depositLedger.createdAt)
      .limit(1);

    return {
      ok: true,
      plan,
      newCollectedEntryId: created?.id ?? '',
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      plan,
    };
  }
}
