'use client';

import { useCallback, useState } from 'react';
import {
  previewPromoCodeAction,
  type PreviewCouponState,
} from '@/app/(customer)/booking/new/couponActions';
import { primaryBtn, secondaryBtn } from '@/src/lib/design-system/tokens';
import { paiseToInr } from '@/src/lib/format';

type Variant = 'light' | 'dark';

const variantStyles: Record<
  Variant,
  {
    shell: string;
    label: string;
    input: string;
    applyBtn: string;
    removeBtn: string;
    success: string;
    error: string;
  }
> = {
  light: {
    shell: 'rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-3',
    label: 'text-xs font-medium text-zinc-700',
    input:
      'h-10 flex-1 rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 shadow-sm focus:border-apg-orange focus:outline-none focus:ring-1 focus:ring-apg-orange/40',
    applyBtn:
      'shrink-0 rounded-lg border border-zinc-300 bg-white px-3 text-xs font-semibold text-zinc-800 hover:bg-zinc-100 disabled:opacity-60',
    removeBtn:
      'shrink-0 rounded-lg border border-rose-200 bg-rose-50 px-3 text-xs font-semibold text-rose-700 hover:bg-rose-100',
    success: 'text-xs text-emerald-700',
    error: 'text-xs text-rose-600',
  },
  dark: {
    shell: 'rounded-xl border border-white/10 bg-white/[0.04] px-4 py-4',
    label: 'text-xs font-semibold uppercase tracking-wider text-apg-silver',
    input:
      'h-10 flex-1 rounded-lg border border-white/15 bg-white/5 px-3 text-sm text-white placeholder:text-apg-silver/70 focus:border-apg-orange focus:outline-none focus:ring-1 focus:ring-apg-orange/40',
    applyBtn: `${secondaryBtn} shrink-0 !min-h-[40px] !px-4 !py-2 !text-xs`,
    removeBtn:
      'shrink-0 rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 text-xs font-semibold text-rose-200 hover:bg-rose-500/20',
    success: 'text-xs text-emerald-300',
    error: 'text-xs text-rose-300',
  },
};

export function CouponCodeField({
  subtotalPaise,
  onDiscountChange,
  onAppliedChange,
  context = 'booking_checkout',
  customerId,
  customerEmail,
  customerPhone,
  variant = 'light',
  initialCode = '',
  initialApplied = false,
  initialDiscountPaise = 0,
  initialLabel,
  disabled = false,
}: {
  subtotalPaise: number;
  onDiscountChange: (discountPaise: number) => void;
  onAppliedChange?: (applied: {
    code: string;
    discountPaise: number;
    label?: string;
  } | null) => void;
  context?: 'booking_checkout' | 'rent_invoice';
  customerId?: string;
  customerEmail?: string;
  customerPhone?: string;
  variant?: Variant;
  initialCode?: string;
  initialApplied?: boolean;
  initialDiscountPaise?: number;
  initialLabel?: string | null;
  disabled?: boolean;
}) {
  const styles = variantStyles[variant];
  const [code, setCode] = useState(initialCode);
  const [preview, setPreview] = useState<PreviewCouponState>(
    initialApplied && initialDiscountPaise > 0
      ? {
          status: 'applied',
          discountPaise: initialDiscountPaise,
          netRentPaise: subtotalPaise - initialDiscountPaise,
          label: initialLabel ?? undefined,
        }
      : { status: 'idle' },
  );
  const [pending, setPending] = useState(false);
  const [justApplied, setJustApplied] = useState(false);

  const clearPromo = useCallback(() => {
    setCode('');
    setPreview({ status: 'idle' });
    onDiscountChange(0);
    onAppliedChange?.(null);
    setJustApplied(false);
  }, [onAppliedChange, onDiscountChange]);

  const applyPreview = useCallback(async () => {
    const trimmed = code.trim();
    if (!trimmed) {
      clearPromo();
      return;
    }
    setPending(true);
    setJustApplied(false);
    try {
      const fd = new FormData();
      fd.set('couponCode', trimmed);
      fd.set('subtotalPaise', String(subtotalPaise));
      fd.set('context', context);
      if (customerId) fd.set('customerId', customerId);
      if (customerEmail) fd.set('customerEmail', customerEmail);
      if (customerPhone) fd.set('customerPhone', customerPhone);
      const result = await previewPromoCodeAction({ status: 'idle' }, fd);
      setPreview(result);
      if (result.status === 'applied') {
        onDiscountChange(result.discountPaise);
        onAppliedChange?.({
          code: trimmed.toUpperCase(),
          discountPaise: result.discountPaise,
          label: result.label,
        });
        setJustApplied(true);
        window.setTimeout(() => setJustApplied(false), 2400);
      } else {
        onDiscountChange(0);
        onAppliedChange?.(null);
      }
    } finally {
      setPending(false);
    }
  }, [
    clearPromo,
    code,
    context,
    customerEmail,
    customerId,
    customerPhone,
    onAppliedChange,
    onDiscountChange,
    subtotalPaise,
  ]);

  const isApplied = preview.status === 'applied';

  return (
    <div className={`${styles.shell} ${justApplied ? 'ring-2 ring-emerald-400/40 transition-shadow' : ''}`}>
      <label className={`block ${styles.label}`}>
        Promo code <span className="font-normal opacity-70">(optional)</span>
      </label>
      <div className="mt-2 flex flex-wrap gap-2">
        <input
          name="couponCode"
          value={code}
          disabled={disabled || isApplied}
          onChange={(e) => {
            setCode(e.target.value);
            if (!e.target.value.trim()) clearPromo();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void applyPreview();
            }
          }}
          placeholder="Enter code"
          autoComplete="off"
          className={styles.input}
        />
        {isApplied ? (
          <button type="button" onClick={clearPromo} className={styles.removeBtn}>
            Remove
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void applyPreview()}
            disabled={pending || disabled || !code.trim()}
            className={variant === 'dark' ? styles.applyBtn : styles.applyBtn}
          >
            {pending ? '…' : 'Apply'}
          </button>
        )}
      </div>
      {preview.status === 'applied' ? (
        <p className={`mt-2 ${styles.success} ${justApplied ? 'animate-pulse' : ''}`}>
          {preview.label ? `${preview.label} — ` : 'Promo applied — '}
          you save {paiseToInr(preview.discountPaise)}
        </p>
      ) : preview.status === 'invalid' ? (
        <p className={`mt-2 ${styles.error}`}>
          {preview.message ?? 'Invalid or expired promo code'}
        </p>
      ) : null}
    </div>
  );
}

/** Persisted rent-invoice promo — calls server apply/remove. */
export function RentInvoicePromoField({
  invoiceId,
  rentPaise,
  initialPromoCode,
  initialDiscountPaise,
  customerId,
  onTotalsChange,
  variant = 'dark',
}: {
  invoiceId: string;
  rentPaise: number;
  initialPromoCode?: string | null;
  initialDiscountPaise?: number;
  customerId: string;
  onTotalsChange: (totals: { discountPaise: number; outstandingPaise: number; promoCode: string | null }) => void;
  variant?: Variant;
}) {
  const [code, setCode] = useState(initialPromoCode ?? '');
  const [discountPaise, setDiscountPaise] = useState(initialDiscountPaise ?? 0);
  const [label, setLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [justApplied, setJustApplied] = useState(false);
  const styles = variantStyles[variant];

  const syncTotals = useCallback(
    (nextDiscount: number, promo: string | null) => {
      onTotalsChange({
        discountPaise: nextDiscount,
        outstandingPaise: Math.max(0, rentPaise - nextDiscount),
        promoCode: promo,
      });
    },
    [onTotalsChange, rentPaise],
  );

  const apply = useCallback(async () => {
    const trimmed = code.trim();
    if (!trimmed) return;
    setPending(true);
    setError(null);
    try {
      const { applyRentPromoAction } = await import(
        '@/app/(customer)/account/resident/pay-rent/promoActions'
      );
      const result = await applyRentPromoAction(invoiceId, trimmed);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setDiscountPaise(result.discountPaise);
      setCode(result.promoCode);
      setLabel(result.label);
      syncTotals(result.discountPaise, result.promoCode);
      setJustApplied(true);
      window.setTimeout(() => setJustApplied(false), 2400);
    } finally {
      setPending(false);
    }
  }, [code, invoiceId, syncTotals]);

  const remove = useCallback(async () => {
    setPending(true);
    setError(null);
    try {
      const { removeRentPromoAction } = await import(
        '@/app/(customer)/account/resident/pay-rent/promoActions'
      );
      const result = await removeRentPromoAction(invoiceId);
      if (!result.ok) {
        setError(result.error ?? 'Could not remove promo.');
        return;
      }
      setDiscountPaise(0);
      setLabel(null);
      setCode('');
      syncTotals(0, null);
    } finally {
      setPending(false);
    }
  }, [invoiceId, syncTotals]);

  const hasPromo = discountPaise > 0;

  return (
    <div
      className={`${styles.shell} ${justApplied ? 'ring-2 ring-emerald-400/40 transition-shadow' : ''}`}
    >
      <label className={`block ${styles.label}`}>Step 2 — Promo code</label>
      <div className="mt-2 flex flex-wrap gap-2">
        <input
          value={code}
          disabled={hasPromo || pending}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void apply();
            }
          }}
          placeholder="Enter promo code"
          className={styles.input}
        />
        {hasPromo ? (
          <button type="button" onClick={() => void remove()} disabled={pending} className={styles.removeBtn}>
            Remove
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void apply()}
            disabled={pending || !code.trim()}
            className={variant === 'dark' ? `${primaryBtn} shrink-0 !min-h-[40px] !px-4 !py-2 !text-xs` : styles.applyBtn}
          >
            {pending ? '…' : 'Apply'}
          </button>
        )}
      </div>
      {hasPromo ? (
        <p className={`mt-2 ${styles.success} ${justApplied ? 'animate-pulse' : ''}`}>
          {label ? `${label} — ` : `Promo ${code} — `}
          you save {paiseToInr(discountPaise)}
        </p>
      ) : error ? (
        <p className={`mt-2 ${styles.error}`}>{error}</p>
      ) : (
        <p className="mt-2 text-xs text-apg-silver">
          Apply before payment — discount is locked once you upload proof.
        </p>
      )}
    </div>
  );
}
