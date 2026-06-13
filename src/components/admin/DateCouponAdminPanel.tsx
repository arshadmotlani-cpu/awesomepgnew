'use client';

import { useCallback, useState } from 'react';
import { DATE_COUPON_DISCOUNT_PCT } from '@/src/lib/dateCoupon';
import { paiseToInr } from '@/src/lib/format';

export function DateCouponAdminPanel({
  todayCode,
  yesterdayCode,
  todayDate,
  usageCountToday,
  totalDiscountPaiseToday,
}: {
  todayCode: string;
  yesterdayCode: string;
  todayDate: string;
  usageCountToday: number;
  totalDiscountPaiseToday: number;
}) {
  const [copied, setCopied] = useState(false);

  const copyToday = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(todayCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Copy today\'s coupon:', todayCode);
    }
  }, [todayCode]);

  return (
    <section className="rounded-2xl border border-white/10 bg-[#1A1F27] p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-apg-orange">
        Today&apos;s rent coupon
      </h2>
      <p className="mt-1 text-xs text-apg-silver">
        Auto-generated from date ({todayDate} IST) · {DATE_COUPON_DISCOUNT_PCT}% off rent only · no
        manual editing
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <code className="rounded-xl border border-emerald-400/40 bg-emerald-500/10 px-4 py-3 text-2xl font-bold tracking-widest text-emerald-200">
          {todayCode}
        </code>
        <button
          type="button"
          onClick={() => void copyToday()}
          className="rounded-lg bg-[#FF5A1F] px-4 py-2 text-sm font-semibold text-white hover:brightness-110"
        >
          {copied ? 'Copied' : 'Copy for promotion'}
        </button>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <Stat label="Uses today" value={String(usageCountToday)} />
        <Stat label="Discount given today" value={paiseToInr(totalDiscountPaiseToday)} />
        <Stat label="Yesterday (expired)" value={yesterdayCode} muted />
      </div>
    </section>
  );
}

function Stat({
  label,
  value,
  muted,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
      <p className="text-[10px] font-medium uppercase tracking-wide text-apg-silver">{label}</p>
      <p className={`mt-1 text-lg font-semibold ${muted ? 'text-apg-silver' : 'text-white'}`}>
        {value}
      </p>
    </div>
  );
}
