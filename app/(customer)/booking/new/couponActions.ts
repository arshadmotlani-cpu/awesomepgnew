'use server';

import { applyDateCouponToRentSubtotal } from '@/src/lib/dateCoupon';

export type PreviewCouponState =
  | { status: 'idle' }
  | { status: 'applied'; discountPaise: number; netRentPaise: number }
  | { status: 'invalid' };

export async function previewDateCouponAction(
  _prev: PreviewCouponState,
  formData: FormData,
): Promise<PreviewCouponState> {
  const code = formData.get('couponCode')?.toString()?.trim() ?? '';
  const subtotalRaw = formData.get('subtotalPaise')?.toString()?.trim() ?? '';
  const subtotalPaise = Number.parseInt(subtotalRaw, 10);

  if (!code) return { status: 'idle' };
  if (!Number.isFinite(subtotalPaise) || subtotalPaise <= 0) {
    return { status: 'invalid' };
  }

  const result = applyDateCouponToRentSubtotal(subtotalPaise, code);
  if (!result.ok || !result.coupon) {
    return { status: 'invalid' };
  }

  return {
    status: 'applied',
    discountPaise: result.discountPaise,
    netRentPaise: result.netRentPaise,
  };
}
