'use server';

import { resolveCheckoutDiscount } from '@/src/lib/billing/discountEngine';
import {
  previewCouponStateFromDiscount,
  type PreviewCouponState,
} from '@/src/lib/booking/bookingCouponReview';

export type PreviewCouponContext = 'booking_checkout' | 'rent_invoice';

/**
 * Do NOT re-export PreviewCouponState from this 'use server' file.
 * Turbopack emitted a value binding for `export type { PreviewCouponState }`,
 * which crashed module evaluation: ReferenceError: PreviewCouponState is not defined.
 * Import the type from `@/src/lib/booking/bookingCouponReview` instead.
 */

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

  // #region agent log
  fetch('http://127.0.0.1:7596/ingest/7ac86f2a-cbab-4d25-8804-7532d754a1bb', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '2142b1' },
    body: JSON.stringify({
      sessionId: '2142b1',
      runId: 'pre-fix',
      hypothesisId: 'A',
      location: 'couponActions.ts:entry',
      message: 'previewPromoCodeAction entered',
      data: {
        codeLen: code.length,
        isDateCoupon: /^\d{6}$/.test(code),
        hasCustomerId: Boolean(customerId),
        subtotalPaise,
        context,
      },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion

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

    const preview = previewCouponStateFromDiscount(result, subtotalPaise);

    // #region agent log
    fetch('http://127.0.0.1:7596/ingest/7ac86f2a-cbab-4d25-8804-7532d754a1bb', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '2142b1' },
      body: JSON.stringify({
        sessionId: '2142b1',
        runId: 'pre-fix',
        hypothesisId: 'A',
        location: 'couponActions.ts:success',
        message: 'previewPromoCodeAction success',
        data: {
          status: preview.status,
          discountPaise: preview.status === 'applied' ? preview.discountPaise : 0,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion

    return preview;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[previewPromoCodeAction] unexpected failure', {
      code: code.toUpperCase(),
      context,
      message,
    });

    // #region agent log
    fetch('http://127.0.0.1:7596/ingest/7ac86f2a-cbab-4d25-8804-7532d754a1bb', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '2142b1' },
      body: JSON.stringify({
        sessionId: '2142b1',
        runId: 'pre-fix',
        hypothesisId: 'B',
        location: 'couponActions.ts:catch',
        message: 'previewPromoCodeAction caught error',
        data: { errMessage: message.slice(0, 200) },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion

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
