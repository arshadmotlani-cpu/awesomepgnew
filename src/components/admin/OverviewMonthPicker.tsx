'use client';

import { usePathname, useRouter } from 'next/navigation';

export function OverviewMonthPicker({ billingMonth }: { billingMonth: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const monthValue = billingMonth.slice(0, 7);

  return (
    <label className="flex w-full min-w-0 flex-col gap-1 text-sm sm:w-auto">
      <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
        Report month
      </span>
      <input
        type="month"
        value={monthValue}
        onChange={(e) => {
          const next = e.target.value;
          router.push(next ? `${pathname}?month=${next}` : pathname);
          router.refresh();
        }}
        className="w-full min-w-0 rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-base text-zinc-900 shadow-sm sm:w-auto sm:py-2 sm:text-sm"
      />
    </label>
  );
}
