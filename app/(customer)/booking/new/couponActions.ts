'use server';

import { resolveCheckoutDiscount } from '@/src/lib/billing/discountEngine';
import {
  previewCouponStateFromDiscount,
  type PreviewCouponState,
} from '@/src/lib/booking/bookingCouponReview';

export type { PreviewCouponState };

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

  try {
    const result = await resolveCheckoutDiscount({
      kind: context === 'rent_invoice' ? 'rent_invoice' : 'booking_checkout',
      amountPaise: subtotalPaise,
      promoCode: code,
      customerId,
      customerEmail,
      customerPhone,
    });

    return previewCouponStateFromDiscount(result, subtotalPaise);
  } catch (err) {
    console.error('[previewPromoCodeAction] unexpected failure', {
      code: code.toUpperCase(),
      context,
      message: err instanceof Error ? err.message : String(err),
    });
    return {
      status: 'invalid',
      message: 'Could not validate promo code. Try again.',
    };
  }
}

/** @deprecated Use previewPromoCodeAction */
export async function previewDateCouponAction(
  prev: PreviewCouponState,
  formData: FormData,
): Promise<PreviewCouponState> {
  return previewPromoCodeAction(prev, formData);
}
