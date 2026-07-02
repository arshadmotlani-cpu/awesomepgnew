/**
 * Express Booking POS — payment orchestration (paid / partial / due bill).
 */

import { formatDate } from '@/src/lib/dates';
import { revalidateFinancialViews } from '@/src/lib/billing/revalidateFinancialViews';
import { recordExpressCollection } from '@/src/services/expressCollection';
import { ensureMonthlyRentInvoice } from '@/src/services/rentInvoices';
import { syncRentInvoiceToUnified } from '@/src/services/unifiedInvoices';
import type { ExpressWalkInPaymentMethod } from '@/src/services/expressWalkInSale';

export type ExpressBookingPaymentStatus = 'paid_in_full' | 'partially_paid' | 'due_bill';

export type ExpressBookingPaymentInput = {
  customerId: string;
  bookingId: string;
  billingMonth: string;
  totalRentPaise: number;
  amountReceivedPaise: number;
  paymentStatus: ExpressBookingPaymentStatus;
  paymentMethod: ExpressWalkInPaymentMethod;
  notes?: string;
  actorId: string;
};

export type ExpressBookingPaymentResult =
  | {
      ok: true;
      rentRecordedPaise: number;
      balanceDuePaise: number;
      rentInvoiceId: string;
      rentInvoiceNumber: string | null;
      message: string;
    }
  | { ok: false; error: string };

function firstOfMonthFromDate(isoDate: string): string {
  return `${isoDate.slice(0, 7)}-01`;
}

/** Create or ensure rent invoice and apply payment status. */
export async function recordExpressBookingPayment(
  input: ExpressBookingPaymentInput,
): Promise<ExpressBookingPaymentResult> {
  const billingMonth = firstOfMonthFromDate(input.billingMonth);
  const totalRentPaise = Math.max(0, input.totalRentPaise);

  if (totalRentPaise <= 0) {
    return { ok: false, error: 'Rent amount must be greater than zero.' };
  }

  if (input.paymentStatus === 'partially_paid') {
    if (input.amountReceivedPaise <= 0) {
      return { ok: false, error: 'Enter the amount received for partial payment.' };
    }
    if (input.amountReceivedPaise >= totalRentPaise) {
      return {
        ok: false,
        error: 'Partial amount must be less than total rent. Use Paid in full instead.',
      };
    }
  }

  if (input.paymentStatus === 'due_bill') {
    const ensured = await ensureMonthlyRentInvoice({
      bookingId: input.bookingId,
      billingMonth,
      amountPaise: totalRentPaise,
      expressWalkInRetry: true,
    });
    if (!ensured.ok) {
      return { ok: false, error: ensured.error };
    }
    await syncRentInvoiceToUnified(ensured.invoiceId);
    revalidateFinancialViews();
    return {
      ok: true,
      rentRecordedPaise: 0,
      balanceDuePaise: totalRentPaise,
      rentInvoiceId: ensured.invoiceId,
      rentInvoiceNumber: ensured.invoiceNumber,
      message: `Due bill ${ensured.invoiceNumber} created — resident will see it in Bills Due.`,
    };
  }

  const amountToRecord =
    input.paymentStatus === 'paid_in_full' ? totalRentPaise : input.amountReceivedPaise;

  const collection = await recordExpressCollection({
    customerId: input.customerId,
    bookingId: input.bookingId,
    chargeType: 'rent',
    amountPaise: amountToRecord,
    billingMonth,
    paymentDate: formatDate(new Date()),
    paymentMethod: input.paymentMethod,
    notes: input.notes,
    createAsPaid: true,
    actorId: input.actorId,
  });

  if (!collection.ok) {
    return { ok: false, error: collection.error };
  }

  const balanceDuePaise = Math.max(0, totalRentPaise - amountToRecord);

  if (input.paymentStatus === 'partially_paid' && balanceDuePaise > 0) {
    const ensured = await ensureMonthlyRentInvoice({
      bookingId: input.bookingId,
      billingMonth,
      amountPaise: totalRentPaise,
      expressWalkInRetry: true,
    });
    if (ensured.ok && ensured.invoiceId) {
      await syncRentInvoiceToUnified(ensured.invoiceId);
    }
  }

  revalidateFinancialViews();

  return {
    ok: true,
    rentRecordedPaise: amountToRecord,
    balanceDuePaise,
    rentInvoiceId: collection.rentInvoiceId ?? '',
    rentInvoiceNumber: collection.invoiceNumber ?? null,
    message:
      input.paymentStatus === 'paid_in_full'
        ? `Paid invoice ${collection.invoiceNumber ?? ''} recorded.`
        : `Partial payment recorded — ₹${(balanceDuePaise / 100).toLocaleString('en-IN')} due in resident portal.`,
  };
}
