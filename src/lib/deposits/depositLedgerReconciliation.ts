/**
 * Deposit booking cache reconciliation — deposit_ledger is SSOT for collected amounts.
 * bookings.deposit_due_paise and deposit_collection_status are derived caches.
 */
import { eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { bookings } from '@/src/db/schema';
import type { DepositCollectionStatus } from '@/src/db/schema/enums';
import { guardDepositPaise } from '@/src/lib/deposits/paiseSafety';
import { syncDepositCollectionFromLedger } from '@/src/services/depositCollection';
import { getDepositSummaryForBooking } from '@/src/services/deposits';
import { validateWalletFormula } from '@/src/services/depositOperations';

export type DepositLedgerReconcileResult = {
  bookingId: string;
  requiredPaise: number;
  collectedPaise: number;
  /** Due implied by ledger (SSOT display amount). */
  ledgerDuePaise: number;
  /** Value on bookings row before repair. */
  bookingDuePaiseBefore: number;
  /** Value on bookings row after repair (same as before when not repaired). */
  depositDuePaise: number;
  depositCollectionStatus: DepositCollectionStatus;
  walletInSync: boolean;
  walletMismatchReason: string | null;
  repaired: boolean;
  repairSkippedReason: string | null;
};

/** Compute outstanding deposit from ledger collected vs booking required. */
export function depositDuePaiseFromLedger(input: {
  requiredPaise: number;
  collectedPaise: number;
}): number {
  const required = guardDepositPaise(input.requiredPaise, 'depositDueFromLedger.required');
  const collected = guardDepositPaise(input.collectedPaise, 'depositDueFromLedger.collected');
  return Math.max(0, required - collected);
}

function statusFromLedgerDue(
  due: number,
  collected: number,
  previous: DepositCollectionStatus,
  depositDueDate: string | null,
): DepositCollectionStatus {
  if (due <= 0) return 'full';
  if (collected <= 0) return previous === 'overdue' ? 'overdue' : 'pending';
  const today = new Date().toISOString().slice(0, 10);
  if (depositDueDate && depositDueDate < today) return 'overdue';
  return 'partial';
}

async function loadBookingDepositRow(bookingId: string) {
  const [row] = await db
    .select({
      depositPaise: bookings.depositPaise,
      depositDuePaise: bookings.depositDuePaise,
      depositCollectionStatus: bookings.depositCollectionStatus,
      depositDueDate: bookings.depositDueDate,
    })
    .from(bookings)
    .where(eq(bookings.id, bookingId))
    .limit(1);
  return row ?? null;
}

/**
 * Reconcile booking deposit cache from ledger.
 * When wallet formula is valid and booking cache differs, repairs bookings row in-place.
 */
export async function reconcileDepositBookingFromLedger(
  bookingId: string,
  options?: { repair?: boolean },
): Promise<DepositLedgerReconcileResult | null> {
  const booking = await loadBookingDepositRow(bookingId);
  if (!booking) return null;

  const requiredPaise = guardDepositPaise(booking.depositPaise, 'reconcile.required');
  if (requiredPaise <= 0) {
    return {
      bookingId,
      requiredPaise: 0,
      collectedPaise: 0,
      ledgerDuePaise: 0,
      bookingDuePaiseBefore: guardDepositPaise(booking.depositDuePaise, 'reconcile.dueBefore'),
      depositDuePaise: 0,
      depositCollectionStatus: booking.depositCollectionStatus,
      walletInSync: true,
      walletMismatchReason: null,
      repaired: false,
      repairSkippedReason: null,
    };
  }

  const summary = await getDepositSummaryForBooking(bookingId);
  const walletCheck = validateWalletFormula(summary);
  const collectedPaise = guardDepositPaise(summary?.collectedPaise ?? 0, 'reconcile.collected');
  const ledgerDuePaise = depositDuePaiseFromLedger({ requiredPaise, collectedPaise });
  const bookingDuePaiseBefore = guardDepositPaise(booking.depositDuePaise, 'reconcile.dueBefore');

  let repaired = false;
  let repairSkippedReason: string | null = null;
  const shouldRepair = options?.repair !== false;

  if (!walletCheck.inSync) {
    repairSkippedReason =
      walletCheck.reason ?? 'Ledger wallet formula mismatch — manual review required.';
  } else if (shouldRepair && bookingDuePaiseBefore !== ledgerDuePaise) {
    await syncDepositCollectionFromLedger(bookingId);
    repaired = true;
  } else if (bookingDuePaiseBefore !== ledgerDuePaise) {
    repairSkippedReason = 'Repair disabled — returning ledger-implied due for display.';
  }

  const after = repaired ? await loadBookingDepositRow(bookingId) : booking;
  const depositDuePaise = repaired
    ? guardDepositPaise(after?.depositDuePaise ?? ledgerDuePaise, 'reconcile.dueAfter')
    : ledgerDuePaise;
  const depositCollectionStatus = (repaired
    ? after?.depositCollectionStatus
    : statusFromLedgerDue(
        ledgerDuePaise,
        collectedPaise,
        booking.depositCollectionStatus,
        booking.depositDueDate,
      )) as DepositCollectionStatus;

  return {
    bookingId,
    requiredPaise,
    collectedPaise,
    ledgerDuePaise,
    bookingDuePaiseBefore,
    depositDuePaise,
    depositCollectionStatus,
    walletInSync: walletCheck.inSync,
    walletMismatchReason: walletCheck.reason,
    repaired,
    repairSkippedReason,
  };
}

/** Reconcile many bookings (e.g. before billing overview render). */
export async function batchReconcileDepositBookingsFromLedger(
  bookingIds: string[],
  options?: { repair?: boolean },
): Promise<Map<string, DepositLedgerReconcileResult>> {
  const unique = [...new Set(bookingIds)];
  const results = new Map<string, DepositLedgerReconcileResult>();
  for (const bookingId of unique) {
    const row = await reconcileDepositBookingFromLedger(bookingId, options);
    if (row) results.set(bookingId, row);
  }
  return results;
}

export function displayDepositDueFromReconcile(
  reconcile: DepositLedgerReconcileResult | undefined,
  fallbackDuePaise: number,
): number {
  if (reconcile) return reconcile.depositDuePaise;
  return guardDepositPaise(fallbackDuePaise, 'displayDepositDue.fallback');
}
