/**
 * Rent invoice promo — apply / remove before payment proof upload.
 */
import { and, eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  couponRedemptions,
  customers,
  discountApplications,
  rentInvoices,
} from '@/src/db/schema';
import {
  resolveCheckoutDiscount,
  type ResolvedDiscount,
} from '@/src/lib/billing/discountEngine';
import { isRentInvoicePaymentLocked } from '@/src/lib/billing/invoiceStateMachine';

export type ApplyRentPromoResult =
  | {
      ok: true;
      discountPaise: number;
      promoCode: string;
      label: string | null;
      finalRentPaise: number;
    }
  | { ok: false; error: string };

export type RemoveRentPromoResult = { ok: true } | { ok: false; error: string };

async function loadPayableInvoice(invoiceId: string, customerId: string) {
  const [row] = await db
    .select({
      id: rentInvoices.id,
      customerId: rentInvoices.customerId,
      bookingId: rentInvoices.bookingId,
      rentPaise: rentInvoices.rentPaise,
      discountPaise: rentInvoices.discountPaise,
      promoCode: rentInvoices.promoCode,
      status: rentInvoices.status,
      paymentProofUrl: rentInvoices.paymentProofUrl,
      email: customers.email,
      phone: customers.phone,
    })
    .from(rentInvoices)
    .innerJoin(customers, eq(customers.id, rentInvoices.customerId))
    .where(eq(rentInvoices.id, invoiceId))
    .limit(1);

  if (!row || row.customerId !== customerId) {
    return null;
  }
  return row;
}

function payableStatusError(status: string): string | null {
  if (status === 'paid') return 'This invoice is already paid.';
  if (status === 'cancelled') return 'This invoice was cancelled.';
  if (isRentInvoicePaymentLocked(status) && status !== 'payment_in_progress') {
    return 'This invoice cannot be modified.';
  }
  if (!['pending', 'overdue', 'payment_in_progress'].includes(status)) {
    return 'This invoice is not open for payment.';
  }
  return null;
}

export async function applyPromoToRentInvoice(input: {
  invoiceId: string;
  customerId: string;
  promoCode: string;
}): Promise<ApplyRentPromoResult> {
  const invoice = await loadPayableInvoice(input.invoiceId, input.customerId);
  if (!invoice) return { ok: false, error: 'Invoice not found.' };

  const statusErr = payableStatusError(invoice.status);
  if (statusErr) return { ok: false, error: statusErr };

  const code = input.promoCode.trim();
  if (!code) return { ok: false, error: 'Enter a promo code.' };

  const resolved = await resolveCheckoutDiscount({
    kind: 'rent_invoice',
    amountPaise: invoice.rentPaise,
    promoCode: code,
    customerId: input.customerId,
    customerEmail: invoice.email,
    customerPhone: invoice.phone,
  });

  if ('error' in resolved) {
    return { ok: false, error: resolved.error };
  }
  if (resolved.discountPaise <= 0) {
    return { ok: false, error: 'Invalid or expired promo code' };
  }

  await persistRentPromo(invoice.id, invoice.rentPaise, resolved, input.customerId);

  return {
    ok: true,
    discountPaise: resolved.discountPaise,
    promoCode: resolved.code ?? code.toUpperCase(),
    label: resolved.label,
    finalRentPaise: invoice.rentPaise - resolved.discountPaise,
  };
}

async function persistRentPromo(
  invoiceId: string,
  rentPaise: number,
  resolved: ResolvedDiscount,
  customerId: string,
) {
  const discountPaise = resolved.discountPaise;
  const promoCode = resolved.code;
  const finalAmountPaise = rentPaise - discountPaise;

  await db.transaction(async (tx) => {
    await tx
      .update(rentInvoices)
      .set({
        discountPaise,
        promoCode,
        updatedAt: new Date(),
      })
      .where(eq(rentInvoices.id, invoiceId));

    await tx.insert(discountApplications).values({
      discountType:
        resolved.discountType === 'date_coupon'
          ? 'date_coupon'
          : resolved.discountType === 'referral'
            ? 'referral'
            : 'promo_code',
      originalAmountPaise: rentPaise,
      discountAmountPaise: discountPaise,
      finalAmountPaise,
      appliedByCustomerId: customerId,
      rentInvoiceId: invoiceId,
      couponCode:
        resolved.discountType === 'date_coupon' || resolved.discountType === 'promo_code'
          ? promoCode
          : null,
      referralCode: resolved.discountType === 'referral' ? promoCode : null,
      reason: resolved.label ?? resolved.reason ?? null,
    });

    if (resolved.discountType === 'date_coupon' && resolved.dateCoupon) {
      await tx.insert(couponRedemptions).values({
        customerId,
        couponCode: resolved.dateCoupon.code,
        couponDate: resolved.dateCoupon.couponDate,
        rentInvoiceId: invoiceId,
        discountPaise,
      });
    }
  });

  const { syncRentInvoiceToUnified } = await import('@/src/services/unifiedInvoices');
  await syncRentInvoiceToUnified(invoiceId).catch(() => undefined);
}

export async function removePromoFromRentInvoice(input: {
  invoiceId: string;
  customerId: string;
}): Promise<RemoveRentPromoResult> {
  const invoice = await loadPayableInvoice(input.invoiceId, input.customerId);
  if (!invoice) return { ok: false, error: 'Invoice not found.' };

  const statusErr = payableStatusError(invoice.status);
  if (statusErr) return { ok: false, error: statusErr };

  if ((invoice.discountPaise ?? 0) <= 0 && !invoice.promoCode) {
    return { ok: true };
  }

  await db
    .update(rentInvoices)
    .set({
      discountPaise: 0,
      promoCode: null,
      updatedAt: new Date(),
    })
    .where(eq(rentInvoices.id, invoice.id));

  const { syncRentInvoiceToUnified } = await import('@/src/services/unifiedInvoices');
  await syncRentInvoiceToUnified(invoice.id).catch(() => undefined);

  return { ok: true };
}
