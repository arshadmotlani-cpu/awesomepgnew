'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  billingMonthQueryParam,
  formatBillingMonthLabel,
  shiftBillingMonth,
} from '@/src/lib/billing/monthNavigation';

export function OverviewMonthNav({ billingMonth }: { billingMonth: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const label = formatBillingMonthLabel(billingMonth);

  function navigateToMonth(nextMonth: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('month', billingMonthQueryParam(nextMonth));
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
    router.refresh();
  }

  return (
    <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-[#1A1F27] p-1">
      <button
        type="button"
        onClick={() => navigateToMonth(shiftBillingMonth(billingMonth, -1))}
        className="rounded-md px-2.5 py-1.5 text-sm text-apg-silver transition hover:bg-white/5 hover:text-white"
        aria-label="Previous month"
      >
        ←
      </button>
      <span className="min-w-[9rem] px-2 text-center text-sm font-semibold text-white">{label}</span>
      <button
        type="button"
        onClick={() => navigateToMonth(shiftBillingMonth(billingMonth, 1))}
        className="rounded-md px-2.5 py-1.5 text-sm text-apg-silver transition hover:bg-white/5 hover:text-white"
        aria-label="Next month"
      >
        →
      </button>
    </div>
  );
}
