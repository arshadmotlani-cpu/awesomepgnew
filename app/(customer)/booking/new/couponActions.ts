'use server';

import { resolveCheckoutDiscount } from '@/src/lib/billing/discountEngine';

export type PreviewCouponState =
  | { status: 'idle' }
  | { status: 'applied'; discountPaise: number; netRentPaise: number; label?: string }
  | { status: 'invalid'; message?: string };

export type PreviewCouponContext = 'booking_checkout' | 'rent_invoice';

export async function previewPromoCodeAction(
  _prev: PreviewCouponState,
  formData: FormData,
): Promise<PreviewCouponState> {
  const code = formData.get('couponCode')?.toString()?.trim() ?? '';
  const subtotalRaw = formData.get('subtotalPaise')?.toString()?.trim() ?? '';
  const subtotalPaise = Number.parseInt(subtotalRaw, 10);
  const context = (formData.get('context')?.toString() ?? 'booking_checkout') as PreviewCouponContext;
  const customerId = formData.get('customerId')?.toString()?.trim() || undefined;
  const customerEmail = formData.get('customerEmail')?.toString()?.trim() || undefined;
  const customerPhone = formData.get('customerPhone')?.toString()?.trim() || undefined;

  if (!code) return { status: 'idle' };
  if (!Number.isFinite(subtotalPaise) || subtotalPaise <= 0) {
    return { status: 'invalid', message: 'Invalid amount' };
  }

  const result = await resolveCheckoutDiscount({
    kind: context === 'rent_invoice' ? 'rent_invoice' : 'booking_checkout',
    amountPaise: subtotalPaise,
    promoCode: code,
    customerId,
    customerEmail,
    customerPhone,
  });

  if ('error' in result) {
    return { status: 'invalid', message: result.error };
  }
  if (result.discountPaise <= 0) {
    return { status: 'invalid', message: 'Invalid or expired promo code' };
  }

  return {
    status: 'applied',
    discountPaise: result.discountPaise,
    netRentPaise: subtotalPaise - result.discountPaise,
    label: result.label ?? undefined,
  };
}

/** @deprecated Use previewPromoCodeAction */
export async function previewDateCouponAction(
  prev: PreviewCouponState,
  formData: FormData,
): Promise<PreviewCouponState> {
  return previewPromoCodeAction(prev, formData);
}
