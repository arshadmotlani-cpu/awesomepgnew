/**
 * Fully void an invoice and undo express walk-in side effects (booking, deposit, occupancy).
 */

import { eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { bookings, customers } from '@/src/db/schema';
import { getActiveTenancyForCustomer } from '@/src/lib/residentActiveTenancy';
import { revalidateFinancialViews } from '@/src/lib/billing/revalidateFinancialViews';
import { rollbackExpressWalkInSale } from '@/src/services/expressWalkInRollback';
import { getDepositSummaryForBooking } from '@/src/services/deposits';
import {
  cancelUnifiedInvoice,
  getUnifiedInvoiceDetail,
  refundUnifiedInvoice,
} from '@/src/services/unifiedInvoices';
import { reverseBookingEffectsIfInvoiceVoided } from '@/src/services/invoiceLifecycleReversal';
import { isFinancialInvoiceCancellable } from '@/src/lib/billing/invoiceStateMachine';

export type VoidInvoiceResult =
  | { ok: true; message: string; archivedCustomer: boolean }
  | { ok: false; error: string };

async function archiveCustomerIfNoTenancy(customerId: string): Promise<boolean> {
  const active = await getActiveTenancyForCustomer(customerId);
  if (active) return false;

  await db
    .update(customers)
    .set({ archivedAt: new Date(), residencyStatus: 'vacated', updatedAt: new Date() })
    .where(eq(customers.id, customerId));
  return true;
}

async function expressWalkInNeedsCleanup(input: {
  bookingId: string;
  createdVia: string | null;
  bookingStatus: string | null;
}): Promise<boolean> {
  if (input.createdVia !== 'admin') return false;
  if (input.bookingStatus === 'confirmed') return true;

  const summary = await getDepositSummaryForBooking(input.bookingId);
  return (summary?.refundableBalancePaise ?? 0) > 0 || (summary?.collectedPaise ?? 0) > 0;
}

async function runExpressWalkInCleanup(input: {
  bookingId: string;
  bookingCode: string;
  customerId: string;
  adminId: string;
  reason: string;
  archiveCustomer: boolean;
}): Promise<VoidInvoiceResult> {
  const rolled = await rollbackExpressWalkInSale({
    bookingId: input.bookingId,
    bookingCode: input.bookingCode,
    customerId: input.customerId,
    adminId: input.adminId,
    reason: input.reason,
  });
  if (!rolled.ok) {
    return { ok: false, error: rolled.error };
  }

  let archivedCustomer = false;
  if (input.archiveCustomer) {
    archivedCustomer = await archiveCustomerIfNoTenancy(input.customerId);
  }

  revalidateFinancialViews();
  return {
    ok: true,
    archivedCustomer,
    message: archivedCustomer
      ? 'Express sale voided — booking cancelled, deposits cleared, resident removed from admin lists.'
      : 'Express sale voided — booking cancelled and deposits cleared.',
  };
}

/** Undo express walk-in or standard invoice — booking freed, deposits zeroed, resident hidden when safe. */
export async function voidInvoiceCompletely(
  invoiceId: string,
  reason: string,
  actor: { type: string; id: string | null },
  options?: { archiveCustomer?: boolean },
): Promise<VoidInvoiceResult> {
  const detail = await getUnifiedInvoiceDetail(invoiceId);
  if (!detail) return { ok: false, error: 'Invoice not found.' };

  let bookingCode: string | null = null;
  let createdVia: string | null = null;
  let bookingStatus: string | null = null;
  if (detail.bookingId) {
    const [booking] = await db
      .select({
        bookingCode: bookings.bookingCode,
        status: bookings.status,
        createdVia: bookings.createdVia,
      })
      .from(bookings)
      .where(eq(bookings.id, detail.bookingId))
      .limit(1);
    bookingCode = booking?.bookingCode ?? null;
    createdVia = booking?.createdVia ?? null;
    bookingStatus = booking?.status ?? null;
  }

  if (detail.status === 'cancelled' || detail.status === 'refunded') {
    if (
      detail.bookingId &&
      bookingCode &&
      actor.id &&
      (await expressWalkInNeedsCleanup({
        bookingId: detail.bookingId,
        createdVia,
        bookingStatus,
      }))
    ) {
      return runExpressWalkInCleanup({
        bookingId: detail.bookingId,
        bookingCode,
        customerId: detail.customerId,
        adminId: actor.id,
        reason: `[void invoice repair] ${reason}`,
        archiveCustomer: options?.archiveCustomer !== false,
      });
    }
    return { ok: false, error: 'Invoice is already voided.' };
  }

  const isAdminWalkIn =
    createdVia === 'admin' &&
    Boolean(detail.bookingId) &&
    Boolean(bookingCode) &&
    detail.status === 'paid';

  if (isAdminWalkIn && detail.bookingId && bookingCode && actor.id) {
    return runExpressWalkInCleanup({
      bookingId: detail.bookingId,
      bookingCode,
      customerId: detail.customerId,
      adminId: actor.id,
      reason: `[void invoice] ${reason}`,
      archiveCustomer: options?.archiveCustomer !== false,
    });
  }

  if (detail.status === 'paid' || detail.status === 'partial') {
    const refunded = await refundUnifiedInvoice(invoiceId, reason, actor);
    if (!refunded.ok) return refunded;
  } else if (isFinancialInvoiceCancellable(detail.status)) {
    const cancelled = await cancelUnifiedInvoice(invoiceId, reason, actor);
    if (!cancelled.ok) return { ok: false, error: cancelled.error };
  } else {
    return {
      ok: false,
      error: `Cannot void invoice in status "${detail.status}".`,
    };
  }

  await reverseBookingEffectsIfInvoiceVoided({
    invoiceId,
    bookingId: detail.bookingId,
    customerId: detail.customerId,
    reason,
    actorId: actor.id,
  }).catch((err) => {
    console.error('[voidInvoiceCompletely] booking reversal failed', err);
  });

  let archivedCustomer = false;
  if (options?.archiveCustomer !== false) {
    archivedCustomer = await archiveCustomerIfNoTenancy(detail.customerId);
  }

  revalidateFinancialViews();
  return {
    ok: true,
    archivedCustomer,
    message: archivedCustomer
      ? 'Invoice voided and resident removed from admin lists.'
      : 'Invoice voided.',
  };
}

/** Whether this invoice can use the one-click express walk-in void action. */
export async function getInvoiceVoidCapabilities(invoiceId: string): Promise<{
  canVoidExpressSale: boolean;
  canCancel: boolean;
  canRefund: boolean;
  canVoidCompletely: boolean;
  bookingCode: string | null;
}> {
  const detail = await getUnifiedInvoiceDetail(invoiceId);
  if (!detail) {
    return {
      canVoidExpressSale: false,
      canCancel: false,
      canRefund: false,
      canVoidCompletely: false,
      bookingCode: null,
    };
  }

  let createdVia: string | null = null;
  let bookingCode: string | null = null;
  if (detail.bookingId) {
    const [booking] = await db
      .select({ createdVia: bookings.createdVia, bookingCode: bookings.bookingCode })
      .from(bookings)
      .where(eq(bookings.id, detail.bookingId))
      .limit(1);
    createdVia = booking?.createdVia ?? null;
    bookingCode = booking?.bookingCode ?? null;
  }

  const canCancel =
    detail.status !== 'cancelled' &&
    detail.status !== 'refunded' &&
    isFinancialInvoiceCancellable(detail.status);
  const canRefund = detail.status === 'paid' || detail.status === 'partial';
  const canVoidExpressSale =
    createdVia === 'admin' &&
    (detail.status === 'paid' ||
      detail.status === 'partial' ||
      canCancel ||
      (detail.status === 'refunded' && Boolean(detail.bookingId)));

  const canVoidCompletely =
    detail.status !== 'cancelled' &&
    (detail.status !== 'refunded' ||
      (createdVia === 'admin' && Boolean(detail.bookingId)));

  return {
    canVoidExpressSale,
    canCancel,
    canRefund,
    canVoidCompletely,
    bookingCode,
  };
}
