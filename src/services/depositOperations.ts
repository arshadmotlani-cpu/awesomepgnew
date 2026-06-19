/**
 * Unified deposit operations — single entry point for invoice, wallet, and summary.
 * SSOT for money: deposit_ledger. Required amount: bookings.deposit_paise.
 */

import { eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { auditLog, bookings } from '@/src/db/schema';
import { guardDepositPaise } from '@/src/lib/deposits/paiseSafety';
import {
  depositAdminDisplayAmounts,
  sanitizeDepositWalletPreview,
  sanitizeUnifiedDepositView,
  type DepositWalletPreview,
  type UnifiedDepositView,
} from '@/src/lib/deposits/unifiedDepositView';
export type { DepositWalletPreview, UnifiedDepositView };
export { sanitizeDepositWalletPreview, sanitizeUnifiedDepositView };
import { getDepositInvoiceForBooking } from '@/src/services/depositInvoices';
import {
  adjustDepositCollectedBalance,
  getDepositSummaryForBooking,
  type DepositSummary,
} from '@/src/services/deposits';
import { syncDepositCollectionFromLedger } from '@/src/services/depositCollection';
import { applyDepositDeduction } from '@/src/services/depositSettlement';

function validatePaiseInput(
  label: string,
  value: number | undefined,
): { ok: true; paise: number | undefined } | { ok: false; error: string } {
  if (value == null) return { ok: true, paise: undefined };
  const n = guardDepositPaise(value, `validatePaiseInput.${label}`);
  if (!Number.isFinite(n)) {
    return { ok: false, error: `${label} must be a valid number.` };
  }
  if (n < 0) {
    return { ok: false, error: `${label} cannot be negative.` };
  }
  return { ok: true, paise: Math.round(n) };
}

export function validateWalletFormula(summary: DepositSummary | null): {
  inSync: boolean;
  reason: string | null;
} {
  if (!summary) return { inSync: true, reason: null };
  const collected = guardDepositPaise(summary.collectedPaise, 'validateWalletFormula.collectedPaise');
  const deducted = guardDepositPaise(summary.deductedPaise, 'validateWalletFormula.deductedPaise');
  const refunded = guardDepositPaise(summary.refundedPaise, 'validateWalletFormula.refundedPaise');
  const refundable = guardDepositPaise(
    summary.refundableBalancePaise,
    'validateWalletFormula.refundablePaise',
  );
  const expected = collected - deducted - refunded;
  if (expected !== refundable) {
    return {
      inSync: false,
      reason: `Wallet balance ${refundable} ≠ collected − deductions − refunds (${expected}).`,
    };
  }
  return { inSync: true, reason: null };
}

function viewFromParts(input: {
  bookingId: string;
  customerId: string;
  booking: {
    depositPaise: number;
    depositDuePaise: number;
    depositCollectionStatus: string;
  };
  summary: DepositSummary | null;
  invoiceStatus: string | null;
  walletCheck: { inSync: boolean; reason: string | null };
  mismatchReason?: string | null;
}): UnifiedDepositView {
  const grossCollectedPaise = guardDepositPaise(
    input.summary?.collectedPaise ?? 0,
    'viewFromParts.grossCollectedPaise',
  );
  const grossDeductedPaise = guardDepositPaise(
    input.summary?.deductedPaise ?? 0,
    'viewFromParts.grossDeductedPaise',
  );
  const grossRefundedPaise = guardDepositPaise(
    input.summary?.refundedPaise ?? 0,
    'viewFromParts.refundedPaise',
  );
  const requiredPaise = guardDepositPaise(input.booking.depositPaise, 'viewFromParts.requiredPaise');
  const depositDuePaise = guardDepositPaise(
    input.booking.depositDuePaise,
    'viewFromParts.depositDuePaise',
  );

  const display = depositAdminDisplayAmounts({
    grossCollectedPaise,
    grossDeductedPaise,
    grossRefundedPaise,
    grossRefundableBalancePaise: input.summary?.refundableBalancePaise ?? 0,
    requiredPaise,
    depositDuePaise,
  });

  return sanitizeUnifiedDepositView({
    bookingId: input.bookingId,
    customerId: input.customerId,
    requiredPaise: display.requiredPaise,
    collectedPaise: display.collectedPaise,
    deductedPaise: display.deductedPaise,
    refundedPaise: display.refundedPaise,
    refundablePaise: display.refundablePaise,
    depositDuePaise,
    depositCollectionStatus: input.booking.depositCollectionStatus,
    invoiceStatus: input.invoiceStatus,
    walletInSync: input.walletCheck.inSync && !input.mismatchReason,
    walletMismatchReason: input.mismatchReason ?? input.walletCheck.reason,
  });
}

export async function getUnifiedDepositView(bookingId: string): Promise<UnifiedDepositView | null> {
  try {
    const [booking] = await db
      .select({
        id: bookings.id,
        customerId: bookings.customerId,
        depositPaise: bookings.depositPaise,
        depositDuePaise: bookings.depositDuePaise,
        depositCollectionStatus: bookings.depositCollectionStatus,
      })
      .from(bookings)
      .where(eq(bookings.id, bookingId))
      .limit(1);
    if (!booking) {
      return null;
    }

    const summary = await getDepositSummaryForBooking(bookingId);
    const invoice = await getDepositInvoiceForBooking(bookingId);
    const walletCheck = validateWalletFormula(summary);

    let mismatchReason: string | null = walletCheck.reason;
    const collectedPaise = guardDepositPaise(summary?.collectedPaise ?? 0, 'getUnifiedDepositView.collectedPaise');
    const requiredPaise = guardDepositPaise(booking.depositPaise, 'getUnifiedDepositView.requiredPaise');
    if (
      requiredPaise > 0 &&
      collectedPaise === 0 &&
      guardDepositPaise(booking.depositDuePaise, 'getUnifiedDepositView.depositDuePaise') === 0 &&
      !invoice?.isSettled
    ) {
      mismatchReason =
        mismatchReason ??
        'Required deposit set but wallet shows zero collected — record collection or rebuild wallet.';
    }

    const view = viewFromParts({
      bookingId,
      customerId: booking.customerId,
      booking: {
        depositPaise: guardDepositPaise(booking.depositPaise, 'booking.depositPaise'),
        depositDuePaise: guardDepositPaise(booking.depositDuePaise, 'booking.depositDuePaise'),
        depositCollectionStatus: booking.depositCollectionStatus,
      },
      summary,
      invoiceStatus: invoice?.displayStatus ?? null,
      walletCheck,
      mismatchReason,
    });

    return sanitizeUnifiedDepositView(view);
  } catch (err) {
    console.error('[deposit-ops] getUnifiedDepositView failed', bookingId, err);
    return null;
  }
}

function expectedAfterRebuild(
  current: UnifiedDepositView,
  booking: { depositPaise: number },
  summary: DepositSummary,
): UnifiedDepositView {
  const required = guardDepositPaise(booking.depositPaise, 'expectedAfterRebuild.requiredPaise');
  const collected = guardDepositPaise(summary.collectedPaise, 'expectedAfterRebuild.collectedPaise');
  const deducted = guardDepositPaise(summary.deductedPaise, 'expectedAfterRebuild.deductedPaise');
  const refunded = guardDepositPaise(summary.refundedPaise, 'expectedAfterRebuild.refundedPaise');
  const refundable = guardDepositPaise(
    summary.refundableBalancePaise,
    'expectedAfterRebuild.refundablePaise',
  );
  const due = Math.max(0, required - collected);
  let status = current.depositCollectionStatus;
  if (due <= 0) status = 'full';
  else if (collected > 0) status = 'partial';

  return sanitizeUnifiedDepositView({
    ...current,
    collectedPaise: collected,
    deductedPaise: deducted,
    refundedPaise: refunded,
    refundablePaise: refundable,
    depositDuePaise: due,
    depositCollectionStatus: status,
    walletInSync: true,
    walletMismatchReason: null,
  });
}

function expectedAfterCancel(current: UnifiedDepositView): UnifiedDepositView {
  const removes = guardDepositPaise(current.refundablePaise, 'expectedAfterCancel.removes');
  return sanitizeUnifiedDepositView({
    ...current,
    requiredPaise: 0,
    deductedPaise: guardDepositPaise(current.deductedPaise, 'expectedAfterCancel.deductedPaise') + removes,
    refundablePaise: 0,
    depositDuePaise: 0,
    depositCollectionStatus: 'full',
    invoiceStatus: 'Cancelled',
    walletInSync: true,
    walletMismatchReason: null,
  });
}

export async function previewRebuildDepositWallet(
  bookingId: string,
): Promise<DepositWalletPreview | { ok: false; error: string }> {
  const current = await getUnifiedDepositView(bookingId);
  if (!current) return { ok: false, error: 'Booking not found.' };

  const [booking] = await db
    .select({ depositPaise: bookings.depositPaise })
    .from(bookings)
    .where(eq(bookings.id, bookingId))
    .limit(1);
  if (!booking) return { ok: false, error: 'Booking not found.' };

  const summary = await getDepositSummaryForBooking(bookingId);
  if (!summary) return { ok: false, error: 'Booking not found.' };

  const walletCheck = validateWalletFormula(summary);
  const warnings: string[] = [];
  if (!walletCheck.inSync && walletCheck.reason) {
    warnings.push(`Ledger reconciliation failed: ${walletCheck.reason}`);
  }
  const required = guardDepositPaise(booking.depositPaise, 'previewRebuild.booking.depositPaise');
  const collected = guardDepositPaise(summary.collectedPaise, 'previewRebuild.summary.collectedPaise');
  if (required !== collected) {
    warnings.push(
      `Required deposit (₹${(required / 100).toLocaleString('en-IN')}) differs from ledger collected (₹${(collected / 100).toLocaleString('en-IN')}). Rebuild syncs due/status only — it does not change required deposit or ledger rows.`,
    );
  }

  return sanitizeDepositWalletPreview({
    action: 'rebuild',
    current,
    expected: expectedAfterRebuild(current, booking, summary),
    warnings,
    willModifyLedger: false,
    removesFromWalletPaise: 0,
  });
}

export async function previewCancelDepositInvoice(
  bookingId: string,
): Promise<DepositWalletPreview | { ok: false; error: string }> {
  const current = await getUnifiedDepositView(bookingId);
  if (!current) return { ok: false, error: 'Booking not found.' };

  const [booking] = await db
    .select({ depositPaise: bookings.depositPaise })
    .from(bookings)
    .where(eq(bookings.id, bookingId))
    .limit(1);
  if (!booking) return { ok: false, error: 'Booking not found.' };

  const warnings: string[] = [];
  if (booking.depositPaise === 0 && current.refundablePaise === 0 && current.collectedPaise === 0) {
    return { ok: false, error: 'Invoice already cancelled.' };
  }
  if (current.refundablePaise > 0) {
    const refundable = guardDepositPaise(current.refundablePaise, 'previewCancel.refundablePaise');
    warnings.push(
      `This will remove ₹${(refundable / 100).toLocaleString('en-IN')} from the resident deposit wallet.`,
    );
  }

  const removesFromWalletPaise = guardDepositPaise(
    current.refundablePaise,
    'previewCancel.removesFromWalletPaise',
  );

  return sanitizeDepositWalletPreview({
    action: 'cancel',
    current,
    expected: expectedAfterCancel(current),
    warnings,
    willModifyLedger: removesFromWalletPaise > 0,
    removesFromWalletPaise,
  });
}

/**
 * Reconcile booking deposit-due fields from the append-only ledger.
 * Does not insert, update, or delete ledger rows.
 */
export async function rebuildDepositWallet(input: {
  bookingId: string;
  customerId: string;
  adminId: string;
}): Promise<
  | { ok: true; collectedPaise: number; refundablePaise: number; depositDuePaise: number }
  | { ok: false; error: string }
> {
  console.info('[deposit-ops] rebuildDepositWallet start', {
    bookingId: input.bookingId,
    customerId: input.customerId,
    adminId: input.adminId,
  });

  const [booking] = await db
    .select({
      depositPaise: bookings.depositPaise,
      depositDuePaise: bookings.depositDuePaise,
    })
    .from(bookings)
    .where(eq(bookings.id, input.bookingId))
    .limit(1);
  if (!booking) return { ok: false, error: 'Booking not found.' };

  const summary = await getDepositSummaryForBooking(input.bookingId);
  if (!summary) return { ok: false, error: 'Booking not found.' };

  const walletCheck = validateWalletFormula(summary);
  if (!walletCheck.inSync) {
    return {
      ok: false,
      error: `Ledger reconciliation failed: ${walletCheck.reason ?? 'wallet formula mismatch.'}`,
    };
  }

  await syncDepositCollectionFromLedger(input.bookingId);

  const [after] = await db
    .select({
      depositDuePaise: bookings.depositDuePaise,
      depositCollectionStatus: bookings.depositCollectionStatus,
    })
    .from(bookings)
    .where(eq(bookings.id, input.bookingId))
    .limit(1);

  const result = {
    ok: true as const,
    collectedPaise: guardDepositPaise(summary.collectedPaise, 'rebuildDepositWallet.collectedPaise'),
    refundablePaise: guardDepositPaise(
      summary.refundableBalancePaise,
      'rebuildDepositWallet.refundablePaise',
    ),
    depositDuePaise: guardDepositPaise(
      after?.depositDuePaise ?? booking.depositDuePaise,
      'rebuildDepositWallet.depositDuePaise',
    ),
  };

  console.info('[deposit-ops] rebuildDepositWallet ok', {
    bookingId: input.bookingId,
    customerId: input.customerId,
    ...result,
  });

  await db.insert(auditLog).values({
    actorType: 'admin',
    actorId: input.adminId,
    entity: 'booking',
    entityId: input.bookingId,
    action: 'deposit_wallet_rebuilt',
    diff: {
      customerId: input.customerId,
      collectedPaise: summary.collectedPaise,
      deductedPaise: summary.deductedPaise,
      refundedPaise: summary.refundedPaise,
      refundablePaise: summary.refundableBalancePaise,
      depositDuePaise: after?.depositDuePaise ?? booking.depositDuePaise,
      depositCollectionStatus: after?.depositCollectionStatus,
      ledgerRowCount: summary.entries.length,
    },
  });

  return result;
}

/** Cancel deposit obligation — zeros required deposit and clears refundable wallet balance. */
export async function cancelDepositInvoice(input: {
  bookingId: string;
  customerId: string;
  adminId: string;
  reason: string;
}): Promise<{ ok: true; removedFromWalletPaise: number } | { ok: false; error: string }> {
  const [booking] = await db
    .select({
      depositPaise: bookings.depositPaise,
      depositDuePaise: bookings.depositDuePaise,
    })
    .from(bookings)
    .where(eq(bookings.id, input.bookingId))
    .limit(1);
  if (!booking) return { ok: false, error: 'Booking not found.' };

  const summary = await getDepositSummaryForBooking(input.bookingId);
  const refundablePaise = summary?.refundableBalancePaise ?? 0;
  const collectedPaise = summary?.collectedPaise ?? 0;

  if (booking.depositPaise === 0 && refundablePaise === 0 && collectedPaise === 0) {
    return { ok: false, error: 'Invoice already cancelled.' };
  }

  const walletCheck = validateWalletFormula(summary);
  if (!walletCheck.inSync) {
    return {
      ok: false,
      error: `Ledger reconciliation failed: ${walletCheck.reason ?? 'wallet formula mismatch.'}`,
    };
  }

  if (refundablePaise > 0) {
    const deducted = await applyDepositDeduction({
      bookingId: input.bookingId,
      customerId: input.customerId,
      amountPaise: refundablePaise,
      reason: `Deposit invoice cancelled: ${input.reason}`,
      adminId: input.adminId,
    });
    if (!deducted.ok) {
      return { ok: false, error: deducted.error };
    }
  }

  await db
    .update(bookings)
    .set({
      depositPaise: 0,
      depositDuePaise: 0,
      depositCollectionStatus: 'full',
      updatedAt: new Date(),
    })
    .where(eq(bookings.id, input.bookingId));

  await db.insert(auditLog).values({
    actorType: 'admin',
    actorId: input.adminId,
    entity: 'booking',
    entityId: input.bookingId,
    action: 'deposit_invoice_cancelled',
    diff: {
      customerId: input.customerId,
      reason: input.reason,
      removedFromWalletPaise: refundablePaise,
      priorRequiredPaise: booking.depositPaise,
      priorCollectedPaise: collectedPaise,
    },
  });

  return { ok: true, removedFromWalletPaise: refundablePaise };
}

export async function updateDepositSummaryAdmin(input: {
  bookingId: string;
  customerId: string;
  adminId: string;
  requiredPaise?: number;
  collectedPaise?: number;
  reason: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const requiredCheck = validatePaiseInput('Required deposit', input.requiredPaise);
    if (!requiredCheck.ok) return requiredCheck;
    const collectedCheck = validatePaiseInput('Collected deposit', input.collectedPaise);
    if (!collectedCheck.ok) return collectedCheck;

    const requiredPaise = requiredCheck.paise;
    const collectedPaise = collectedCheck.paise;

    console.info('[deposit-ops] updateDepositSummaryAdmin start', {
      bookingId: input.bookingId,
      customerId: input.customerId,
      adminId: input.adminId,
      requiredPaise,
      collectedPaise,
      reason: input.reason,
    });

    const [booking] = await db
      .select({
        depositPaise: bookings.depositPaise,
        totalPaise: bookings.totalPaise,
        bookingCode: bookings.bookingCode,
      })
      .from(bookings)
      .where(eq(bookings.id, input.bookingId))
      .limit(1);
    if (!booking) return { ok: false, error: 'Booking not found.' };

    const priorRequired = guardDepositPaise(booking.depositPaise, 'updateDepositSummary.priorRequired');
    const priorTotal = guardDepositPaise(booking.totalPaise, 'updateDepositSummary.priorTotal');

    // Update required deposit before ledger collected adjustment when both change.
    if (requiredPaise != null) {
      const newTotalPaise = priorTotal - priorRequired + requiredPaise;
      if (!Number.isFinite(newTotalPaise) || newTotalPaise < 0) {
        return {
          ok: false,
          error: 'Deposit correction would produce an invalid booking total.',
        };
      }

      await db
        .update(bookings)
        .set({
          depositPaise: requiredPaise,
          totalPaise: newTotalPaise,
          updatedAt: new Date(),
        })
        .where(eq(bookings.id, input.bookingId));
    }

    if (collectedPaise != null) {
      const adjusted = await adjustDepositCollectedBalance({
        bookingId: input.bookingId,
        customerId: input.customerId,
        targetCollectedPaise: collectedPaise,
        reason: input.reason,
        createdByAdminId: input.adminId,
      });
      if (!adjusted.ok) {
        console.error('[deposit-ops] updateDepositSummaryAdmin ledger adjust failed', {
          bookingId: input.bookingId,
          customerId: input.customerId,
          collectedPaise,
          error: adjusted.error,
        });
        return { ok: false, error: adjusted.error };
      }
    }

    await syncDepositCollectionFromLedger(input.bookingId);

    await db.insert(auditLog).values({
      actorType: 'admin',
      actorId: input.adminId,
      entity: 'booking',
      entityId: input.bookingId,
      action: 'deposit_summary_updated',
      diff: {
        priorRequiredPaise: priorRequired,
        priorTotalPaise: priorTotal,
        requiredPaise,
        collectedPaise,
        reason: input.reason,
      },
    });

    console.info('[deposit-ops] updateDepositSummaryAdmin ok', {
      bookingId: input.bookingId,
      customerId: input.customerId,
      requiredPaise,
      collectedPaise,
    });

    return { ok: true };
  } catch (err) {
    console.error('[deposit-ops] updateDepositSummaryAdmin failed', input.bookingId, err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Deposit update failed.',
    };
  }
}

/** Record deposit collection via unified path (invoice paid / mark paid). */
export async function markDepositInvoicePaid(input: {
  bookingId: string;
  customerId: string;
  amountPaise: number;
  adminId: string;
  note?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (input.amountPaise <= 0) return { ok: false, error: 'Amount must be greater than zero.' };

  const { correctDepositCollected } = await import('@/src/services/deposits');
  const summary = await getDepositSummaryForBooking(input.bookingId);
  const target = (summary?.collectedPaise ?? 0) + input.amountPaise;

  try {
    await correctDepositCollected({
      bookingId: input.bookingId,
      customerId: input.customerId,
      targetCollectedPaise: target,
      reason: input.note?.trim() || 'Deposit invoice marked paid',
      createdByAdminId: input.adminId,
    });
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Mark paid failed.',
    };
  }
  await syncDepositCollectionFromLedger(input.bookingId);
  return { ok: true };
}
