'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { previewPromoCodeAction } from '@/app/(customer)/booking/new/couponActions';
import type { PreviewCouponState } from '@/src/lib/booking/bookingCouponReview';
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
  title = 'Promo code',
  omitInputName = false,
}: {
  subtotalPaise: number;
  /** @deprecated Prefer onAppliedChange — discount is carried on the applied coupon object. */
  onDiscountChange?: (discountPaise: number) => void;
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
  /** Override the field label (e.g. "Have a Coupon Code?"). */
  title?: string;
  /**
   * When true, do not set `name` on the visible input so a parent form can
   * submit a single hidden `couponCode` without double-posting.
   */
  omitInputName?: boolean;
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
  const applyRequestIdRef = useRef(0);
  /** Prevents one-frame parent lag from wiping a successful local Apply. */
  const expectParentApplyRef = useRef(false);

  useEffect(() => {
    if (initialApplied && initialDiscountPaise > 0) {
      expectParentApplyRef.current = false;
      setCode(initialCode);
      setPreview({
        status: 'applied',
        discountPaise: initialDiscountPaise,
        netRentPaise: subtotalPaise - initialDiscountPaise,
        label: initialLabel ?? undefined,
      });
      return;
    }
    if (expectParentApplyRef.current) return;
    if (!initialApplied && !initialCode.trim()) {
      setPreview((prev) => (prev.status === 'applied' ? { status: 'idle' } : prev));
    }
  }, [
    initialApplied,
    initialCode,
    initialDiscountPaise,
    initialLabel,
    subtotalPaise,
  ]);

  const syncParentDiscount = useCallback(
    (discountPaise: number) => {
      onDiscountChange?.(discountPaise);
    },
    [onDiscountChange],
  );

  const clearPromo = useCallback(() => {
    expectParentApplyRef.current = false;
    setCode('');
    setPreview({ status: 'idle' });
    syncParentDiscount(0);
    onAppliedChange?.(null);
    setJustApplied(false);
  }, [onAppliedChange, syncParentDiscount]);

  const applyPreview = useCallback(async () => {
    const trimmed = code.trim();
    if (!trimmed) {
      clearPromo();
      return;
    }
    setPending(true);
    setJustApplied(false);
    const requestId = ++applyRequestIdRef.current;
    // #region agent log
    fetch('http://127.0.0.1:7596/ingest/7ac86f2a-cbab-4d25-8804-7532d754a1bb', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '2142b1' },
      body: JSON.stringify({
        sessionId: '2142b1',
        runId: 'pre-fix',
        hypothesisId: 'C',
        location: 'CouponCodeField.tsx:applyPreview',
        message: 'client Apply clicked',
        data: {
          codeLen: trimmed.length,
          isDateCoupon: /^\d{6}$/.test(trimmed),
          hasCustomerId: Boolean(customerId),
          subtotalPaise,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    try {
      const fd = new FormData();
      fd.set('couponCode', trimmed);
      fd.set('subtotalPaise', String(subtotalPaise));
      fd.set('context', context);
      if (customerId) fd.set('customerId', customerId);
      if (customerEmail) fd.set('customerEmail', customerEmail);
      if (customerPhone) fd.set('customerPhone', customerPhone);
      const result = await previewPromoCodeAction({ status: 'idle' }, fd);
      if (requestId !== applyRequestIdRef.current) return;
      // #region agent log
      fetch('http://127.0.0.1:7596/ingest/7ac86f2a-cbab-4d25-8804-7532d754a1bb', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '2142b1' },
        body: JSON.stringify({
          sessionId: '2142b1',
          runId: 'pre-fix',
          hypothesisId: 'C',
          location: 'CouponCodeField.tsx:result',
          message: 'client received preview result',
          data: {
            status: result.status,
            discountPaise: result.status === 'applied' ? result.discountPaise : 0,
          },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
      if (typeof window !== 'undefined') {
        console.info('[booking-coupon]', {
          event: 'preview_result',
          status: result.status,
          code: trimmed.toUpperCase(),
          discountPaise: result.status === 'applied' ? result.discountPaise : 0,
          message: result.status === 'invalid' ? result.message : undefined,
          at: new Date().toISOString(),
        });
      }
      if (result.status === 'applied') {
        const applied = {
          code: trimmed.toUpperCase(),
          discountPaise: result.discountPaise,
          label: result.label,
        };
        expectParentApplyRef.current = true;
        // Parent first so review totals update before local pending flips.
        onAppliedChange?.(applied);
        syncParentDiscount(result.discountPaise);
        setPreview(result);
        setJustApplied(true);
        window.setTimeout(() => setJustApplied(false), 2400);
      } else {
        expectParentApplyRef.current = false;
        onAppliedChange?.(null);
        syncParentDiscount(0);
        setPreview(result);
      }
    } catch (err) {
      if (requestId !== applyRequestIdRef.current) return;
      const message =
        err instanceof Error ? err.message : 'Could not validate promo code. Try again.';
      // #region agent log
      fetch('http://127.0.0.1:7596/ingest/7ac86f2a-cbab-4d25-8804-7532d754a1bb', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '2142b1' },
        body: JSON.stringify({
          sessionId: '2142b1',
          runId: 'pre-fix',
          hypothesisId: 'A',
          location: 'CouponCodeField.tsx:catch',
          message: 'client caught preview error',
          data: { errMessage: message.slice(0, 200) },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
      setPreview({ status: 'invalid', message });
      syncParentDiscount(0);
      onAppliedChange?.(null);
      if (typeof window !== 'undefined') {
        console.info('[booking-coupon]', {
          event: 'preview_error',
          code: trimmed.toUpperCase(),
          message,
          at: new Date().toISOString(),
        });
      }
    } finally {
      if (requestId === applyRequestIdRef.current) {
        setPending(false);
      }
    }
  }, [
    clearPromo,
    code,
    context,
    customerEmail,
    customerId,
    customerPhone,
    onAppliedChange,
    syncParentDiscount,
    subtotalPaise,
  ]);

  const isApplied = preview.status === 'applied';

  return (
    <div className={`${styles.shell} ${justApplied ? 'ring-2 ring-emerald-400/40 transition-shadow' : ''}`}>
      <label className={`block ${styles.label}`}>
        {title}{' '}
        {!isApplied ? <span className="font-normal opacity-70">(optional)</span> : null}
      </label>
      <div className="mt-2 flex flex-wrap gap-2">
        <input
          name={omitInputName ? undefined : 'couponCode'}
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
            Remove Coupon
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void applyPreview()}
            disabled={pending || disabled || !code.trim()}
            className={styles.applyBtn}
          >
            {pending ? '…' : 'Apply'}
          </button>
        )}
      </div>
      {preview.status === 'applied' ? (
        <p className={`mt-2 ${styles.success} ${justApplied ? 'animate-pulse' : ''}`}>
          Applied ✓
          {preview.label ? ` · ${preview.label}` : ''} — you save{' '}
          {paiseToInr(preview.discountPaise)}
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
