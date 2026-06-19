/**
 * Unified deposit operations — single entry point for invoice, wallet, and summary.
 * SSOT for money: deposit_ledger. Required amount: bookings.deposit_paise.
 */

import { eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { auditLog, bookings } from '@/src/db/schema';
import { getDepositInvoiceForBooking } from '@/src/services/depositInvoices';
import {
  adjustDepositCollectedBalance,
  getDepositSummaryForBooking,
  type DepositSummary,
} from '@/src/services/deposits';
import { syncDepositCollectionFromLedger } from '@/src/services/depositCollection';
import { applyDepositDeduction } from '@/src/services/depositSettlement';

export type UnifiedDepositView = {
  bookingId: string;
  customerId: string;
  requiredPaise: number;
  collectedPaise: number;
  deductedPaise: number;
  refundedPaise: number;
  refundablePaise: number;
  depositDuePaise: number;
  depositCollectionStatus: string;
  invoiceStatus: string | null;
  walletInSync: boolean;
  walletMismatchReason: string | null;
};

export type DepositWalletPreview = {
  action: 'rebuild' | 'cancel';
  current: UnifiedDepositView;
  expected: UnifiedDepositView;
  warnings: string[];
  /** Whether ledger rows will be inserted (always false for rebuild). */
  willModifyLedger: boolean;
  /** For cancel: refundable balance removed from wallet via deduction. */
  removesFromWalletPaise: number;
};

export function validateWalletFormula(summary: DepositSummary | null): {
  inSync: boolean;
  reason: string | null;
} {
  if (!summary) return { inSync: true, reason: null };
  const expected = summary.collectedPaise - summary.deductedPaise - summary.refundedPaise;
  if (expected !== summary.refundableBalancePaise) {
    return {
      inSync: false,
      reason: `Wallet balance ${summary.refundableBalancePaise} ≠ collected − deductions − refunds (${expected}).`,
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
  const collectedPaise = input.summary?.collectedPaise ?? 0;
  const deductedPaise = input.summary?.deductedPaise ?? 0;
  const refundedPaise = input.summary?.refundedPaise ?? 0;
  const refundablePaise = input.summary?.refundableBalancePaise ?? 0;

  return {
    bookingId: input.bookingId,
    customerId: input.customerId,
    requiredPaise: input.booking.depositPaise,
    collectedPaise,
    deductedPaise,
    refundedPaise,
    refundablePaise,
    depositDuePaise: input.booking.depositDuePaise,
    depositCollectionStatus: input.booking.depositCollectionStatus,
    invoiceStatus: input.invoiceStatus,
    walletInSync: input.walletCheck.inSync && !input.mismatchReason,
    walletMismatchReason: input.mismatchReason ?? input.walletCheck.reason,
  };
}

export async function getUnifiedDepositView(bookingId: string): Promise<UnifiedDepositView | null> {
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
  if (!booking) return null;

  const summary = await getDepositSummaryForBooking(bookingId);
  const invoice = await getDepositInvoiceForBooking(bookingId);
  const walletCheck = validateWalletFormula(summary);

  let mismatchReason: string | null = walletCheck.reason;
  const collectedPaise = summary?.collectedPaise ?? 0;
  if (
    booking.depositPaise > 0 &&
    collectedPaise === 0 &&
    booking.depositDuePaise === 0 &&
    !invoice?.isSettled
  ) {
    mismatchReason =
      mismatchReason ??
      'Required deposit set but wallet shows zero collected — record collection or rebuild wallet.';
  }

  return viewFromParts({
    bookingId,
    customerId: booking.customerId,
    booking,
    summary,
    invoiceStatus: invoice?.displayStatus ?? null,
    walletCheck,
    mismatchReason,
  });
}

function expectedAfterRebuild(
  current: UnifiedDepositView,
  booking: { depositPaise: number },
  summary: DepositSummary,
): UnifiedDepositView {
  const due = Math.max(0, booking.depositPaise - summary.collectedPaise);
  let status = current.depositCollectionStatus;
  if (due <= 0) status = 'full';
  else if (summary.collectedPaise > 0) status = 'partial';

  return {
    ...current,
    collectedPaise: summary.collectedPaise,
    deductedPaise: summary.deductedPaise,
    refundedPaise: summary.refundedPaise,
    refundablePaise: summary.refundableBalancePaise,
    depositDuePaise: due,
    depositCollectionStatus: status,
    walletInSync: true,
    walletMismatchReason: null,
  };
}

function expectedAfterCancel(current: UnifiedDepositView): UnifiedDepositView {
  const removes = current.refundablePaise;
  return {
    ...current,
    requiredPaise: 0,
    deductedPaise: current.deductedPaise + removes,
    refundablePaise: 0,
    depositDuePaise: 0,
    depositCollectionStatus: 'full',
    invoiceStatus: 'Cancelled',
    walletInSync: true,
    walletMismatchReason: null,
  };
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
  if (booking.depositPaise !== summary.collectedPaise) {
    warnings.push(
      `Required deposit (₹${(booking.depositPaise / 100).toLocaleString('en-IN')}) differs from ledger collected (₹${(summary.collectedPaise / 100).toLocaleString('en-IN')}). Rebuild syncs due/status only — it does not change required deposit or ledger rows.`,
    );
  }

  return {
    action: 'rebuild',
    current,
    expected: expectedAfterRebuild(current, booking, summary),
    warnings,
    willModifyLedger: false,
    removesFromWalletPaise: 0,
  };
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
    warnings.push(
      `This will remove ₹${(current.refundablePaise / 100).toLocaleString('en-IN')} from the resident deposit wallet.`,
    );
  }

  return {
    action: 'cancel',
    current,
    expected: expectedAfterCancel(current),
    warnings,
    willModifyLedger: current.refundablePaise > 0,
    removesFromWalletPaise: current.refundablePaise,
  };
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

  return {
    ok: true,
    collectedPaise: summary.collectedPaise,
    refundablePaise: summary.refundableBalancePaise,
    depositDuePaise: after?.depositDuePaise ?? booking.depositDuePaise,
  };
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
  const [booking] = await db
    .select({
      depositPaise: bookings.depositPaise,
      totalPaise: bookings.totalPaise,
    })
    .from(bookings)
    .where(eq(bookings.id, input.bookingId))
    .limit(1);
  if (!booking) return { ok: false, error: 'Booking not found.' };

  // Ledger first — never mutate required deposit until collected adjustment succeeds.
  if (input.collectedPaise != null && input.collectedPaise >= 0) {
    const adjusted = await adjustDepositCollectedBalance({
      bookingId: input.bookingId,
      customerId: input.customerId,
      targetCollectedPaise: input.collectedPaise,
      reason: input.reason,
      createdByAdminId: input.adminId,
    });
    if (!adjusted.ok) return { ok: false, error: adjusted.error };
  }

  if (input.requiredPaise != null && input.requiredPaise >= 0) {
    await db
      .update(bookings)
      .set({
        depositPaise: input.requiredPaise,
        totalPaise: booking.totalPaise - booking.depositPaise + input.requiredPaise,
        updatedAt: new Date(),
      })
      .where(eq(bookings.id, input.bookingId));
  }

  await syncDepositCollectionFromLedger(input.bookingId);

  await db.insert(auditLog).values({
    actorType: 'admin',
    actorId: input.adminId,
    entity: 'booking',
    entityId: input.bookingId,
    action: 'deposit_summary_updated',
    diff: {
      requiredPaise: input.requiredPaise,
      collectedPaise: input.collectedPaise,
      reason: input.reason,
    },
  });

  return { ok: true };
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
