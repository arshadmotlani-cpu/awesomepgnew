/**
 * Fully void an invoice and undo express walk-in side effects (booking, deposit, occupancy).
 */

import { eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { bookings, customers } from '@/src/db/schema';
import { getActiveTenancyForCustomer } from '@/src/lib/residentActiveTenancy';
import { revalidateFinancialViews } from '@/src/lib/billing/revalidateFinancialViews';
import { rollbackExpressWalkInSale } from '@/src/services/expressWalkInRollback';
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

/** Undo express walk-in or standard invoice — booking freed, deposits zeroed, resident hidden when safe. */
export async function voidInvoiceCompletely(
  invoiceId: string,
  reason: string,
  actor: { type: string; id: string | null },
  options?: { archiveCustomer?: boolean },
): Promise<VoidInvoiceResult> {
  const detail = await getUnifiedInvoiceDetail(invoiceId);
  if (!detail) return { ok: false, error: 'Invoice not found.' };

  if (detail.status === 'cancelled' || detail.status === 'refunded') {
    return { ok: false, error: 'Invoice is already voided.' };
  }

  let bookingCode: string | null = null;
  let createdVia: string | null = null;
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
  }

  const isAdminWalkIn =
    createdVia === 'admin' &&
    Boolean(detail.bookingId) &&
    Boolean(bookingCode) &&
    detail.status === 'paid';

  if (isAdminWalkIn && detail.bookingId && bookingCode && actor.id) {
    const rolled = await rollbackExpressWalkInSale({
      bookingId: detail.bookingId,
      bookingCode,
      customerId: detail.customerId,
      adminId: actor.id,
      reason: `[void invoice] ${reason}`,
    });
    if (!rolled.ok) {
      return { ok: false, error: rolled.error };
    }

    let archivedCustomer = false;
    if (options?.archiveCustomer !== false) {
      archivedCustomer = await archiveCustomerIfNoTenancy(detail.customerId);
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
    (detail.status === 'paid' || detail.status === 'partial' || canCancel);

  return {
    canVoidExpressSale,
    canCancel,
    canRefund,
    canVoidCompletely:
      detail.status !== 'cancelled' && detail.status !== 'refunded',
    bookingCode,
  };
}
