/**
 * Unified deposit operations — single entry point for invoice, wallet, and summary.
 * SSOT for money: deposit_ledger. Required amount: bookings.deposit_paise.
 */

import { eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { auditLog, bookings } from '@/src/db/schema';
import { revalidateFinancialViews } from '@/src/lib/billing/revalidateFinancialViews';
import { getDepositInvoiceForBooking } from '@/src/services/depositInvoices';
import {
  correctDepositCollected,
  getDepositSummaryForBooking,
  type DepositSummary,
} from '@/src/services/deposits';
import { syncDepositCollectionFromLedger } from '@/src/services/depositCollection';

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

  const requiredPaise = invoice?.requiredPaise ?? booking.depositPaise;
  const collectedPaise = invoice?.collectedPaise ?? summary?.collectedPaise ?? 0;
  const deductedPaise = summary?.deductedPaise ?? 0;
  const refundedPaise = summary?.refundedPaise ?? 0;
  const refundablePaise = invoice?.refundablePaise ?? summary?.refundableBalancePaise ?? 0;

  let mismatchReason = walletCheck.reason;
  if (requiredPaise > 0 && collectedPaise === 0 && booking.depositDuePaise === 0 && !invoice?.isSettled) {
    mismatchReason =
      mismatchReason ??
      'Required deposit set but wallet shows zero collected — run Rebuild Deposit Wallet or record collection.';
  }

  return {
    bookingId,
    customerId: booking.customerId,
    requiredPaise,
    collectedPaise,
    deductedPaise,
    refundedPaise,
    refundablePaise,
    depositDuePaise: booking.depositDuePaise,
    depositCollectionStatus: booking.depositCollectionStatus,
    invoiceStatus: invoice?.displayStatus ?? null,
    walletInSync: walletCheck.inSync && !mismatchReason,
    walletMismatchReason: mismatchReason,
  };
}

/** Align ledger collected balance with booking required deposit when they diverge. */
export async function rebuildDepositWallet(input: {
  bookingId: string;
  customerId: string;
  adminId: string;
}): Promise<{ ok: true; targetCollectedPaise: number } | { ok: false; error: string }> {
  const [booking] = await db
    .select({ depositPaise: bookings.depositPaise })
    .from(bookings)
    .where(eq(bookings.id, input.bookingId))
    .limit(1);
  if (!booking) return { ok: false, error: 'Booking not found.' };

  const summary = await getDepositSummaryForBooking(input.bookingId);
  const targetCollectedPaise = summary?.collectedPaise ?? booking.depositPaise;

  await correctDepositCollected({
    bookingId: input.bookingId,
    customerId: input.customerId,
    targetCollectedPaise,
    reason: 'Rebuild deposit wallet from unified service',
    createdByAdminId: input.adminId,
  });
  await syncDepositCollectionFromLedger(input.bookingId);

  await db.insert(auditLog).values({
    actorType: 'admin',
    actorId: input.adminId,
    entity: 'booking',
    entityId: input.bookingId,
    action: 'deposit_wallet_rebuilt',
    diff: { targetCollectedPaise },
  });

  revalidateFinancialViews();
  return { ok: true, targetCollectedPaise };
}

/** Cancel deposit obligation — zeros wallet and required deposit. */
export async function cancelDepositInvoice(input: {
  bookingId: string;
  customerId: string;
  adminId: string;
  reason: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  await correctDepositCollected({
    bookingId: input.bookingId,
    customerId: input.customerId,
    targetCollectedPaise: 0,
    reason: `Deposit invoice cancelled: ${input.reason}`,
    createdByAdminId: input.adminId,
  });

  await db
    .update(bookings)
    .set({
      depositPaise: 0,
      depositDuePaise: 0,
      depositCollectionStatus: 'full',
      updatedAt: new Date(),
    })
    .where(eq(bookings.id, input.bookingId));

  await syncDepositCollectionFromLedger(input.bookingId);

  await db.insert(auditLog).values({
    actorType: 'admin',
    actorId: input.adminId,
    entity: 'booking',
    entityId: input.bookingId,
    action: 'deposit_invoice_cancelled',
    diff: { reason: input.reason },
  });

  revalidateFinancialViews();
  return { ok: true };
}

export async function updateDepositSummaryAdmin(input: {
  bookingId: string;
  customerId: string;
  adminId: string;
  requiredPaise?: number;
  collectedPaise?: number;
  reason: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (input.requiredPaise != null && input.requiredPaise >= 0) {
    const [booking] = await db
      .select({ depositPaise: bookings.depositPaise, totalPaise: bookings.totalPaise })
      .from(bookings)
      .where(eq(bookings.id, input.bookingId))
      .limit(1);
    if (!booking) return { ok: false, error: 'Booking not found.' };

    await db
      .update(bookings)
      .set({
        depositPaise: input.requiredPaise,
        totalPaise: booking.totalPaise - booking.depositPaise + input.requiredPaise,
        updatedAt: new Date(),
      })
      .where(eq(bookings.id, input.bookingId));
  }

  if (input.collectedPaise != null && input.collectedPaise >= 0) {
    const result = await correctDepositCollected({
      bookingId: input.bookingId,
      customerId: input.customerId,
      targetCollectedPaise: input.collectedPaise,
      reason: input.reason,
      createdByAdminId: input.adminId,
    });
    void result;
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

  revalidateFinancialViews();
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

  const summary = await getDepositSummaryForBooking(input.bookingId);
  const target = (summary?.collectedPaise ?? 0) + input.amountPaise;

  await correctDepositCollected({
    bookingId: input.bookingId,
    customerId: input.customerId,
    targetCollectedPaise: target,
    reason: input.note?.trim() || 'Deposit invoice marked paid',
    createdByAdminId: input.adminId,
  });
  await syncDepositCollectionFromLedger(input.bookingId);
  revalidateFinancialViews();
  return { ok: true };
}
