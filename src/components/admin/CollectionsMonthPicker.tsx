'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

export function CollectionsMonthPicker({ billingMonth }: { billingMonth: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const monthValue = billingMonth.slice(0, 7);

  return (
    <label className="flex w-full flex-col gap-1 text-sm">
      <span className="text-xs font-medium uppercase tracking-wide text-apg-silver">
        Billing month
      </span>
      <input
        type="month"
        value={monthValue}
        onChange={(e) => {
          const next = e.target.value;
          const params = new URLSearchParams(searchParams.toString());
          if (next) {
            params.set('month', `${next}-01`);
          } else {
            params.delete('month');
          }
          const qs = params.toString();
          router.push(qs ? `${pathname}?${qs}` : pathname);
          router.refresh();
        }}
        className="apg-admin-field w-full rounded-lg border border-white/10 bg-[#12161D] px-3 py-2 text-sm text-white"
      />
    </label>
  );
}
