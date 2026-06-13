'use client';

import { useCallback, useState } from 'react';
import {
  previewDateCouponAction,
  type PreviewCouponState,
} from '@/app/(customer)/booking/new/couponActions';
import { DATE_COUPON_DISCOUNT_PCT } from '@/src/lib/dateCoupon';
import { paiseToInr } from '@/src/lib/format';

export function CouponCodeField({
  subtotalPaise,
  onDiscountChange,
}: {
  subtotalPaise: number;
  onDiscountChange: (discountPaise: number) => void;
}) {
  const [code, setCode] = useState('');
  const [preview, setPreview] = useState<PreviewCouponState>({ status: 'idle' });
  const [pending, setPending] = useState(false);

  const applyPreview = useCallback(async () => {
    const trimmed = code.trim();
    if (!trimmed) {
      setPreview({ status: 'idle' });
      onDiscountChange(0);
      return;
    }
    setPending(true);
    try {
      const fd = new FormData();
      fd.set('couponCode', trimmed);
      fd.set('subtotalPaise', String(subtotalPaise));
      const result = await previewDateCouponAction({ status: 'idle' }, fd);
      setPreview(result);
      onDiscountChange(result.status === 'applied' ? result.discountPaise : 0);
    } finally {
      setPending(false);
    }
  }, [code, onDiscountChange, subtotalPaise]);

  return (
    <div className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-3">
      <label className="block text-xs font-medium text-zinc-700">
        Coupon code <span className="text-zinc-400">(optional)</span>
      </label>
      <div className="mt-2 flex gap-2">
        <input
          name="couponCode"
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            if (!e.target.value.trim()) {
              setPreview({ status: 'idle' });
              onDiscountChange(0);
            }
          }}
          placeholder="DDMMYY"
          inputMode="numeric"
          maxLength={6}
          className="h-9 flex-1 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
        <button
          type="button"
          onClick={() => void applyPreview()}
          disabled={pending}
          className="shrink-0 rounded-md border border-zinc-300 bg-white px-3 text-xs font-semibold text-zinc-800 hover:bg-zinc-100 disabled:opacity-60"
        >
          {pending ? '…' : 'Apply'}
        </button>
      </div>
      {preview.status === 'applied' ? (
        <p className="mt-2 text-xs text-emerald-700">
          {DATE_COUPON_DISCOUNT_PCT}% rent discount applied — save {paiseToInr(preview.discountPaise)}
        </p>
      ) : preview.status === 'invalid' ? (
        <p className="mt-2 text-xs text-rose-600">Invalid coupon</p>
      ) : (
        <p className="mt-2 text-xs text-zinc-500">
          {DATE_COUPON_DISCOUNT_PCT}% off rent only — deposit unchanged.
        </p>
      )}
    </div>
  );
}
