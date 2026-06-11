'use client';

import { usePathname, useRouter } from 'next/navigation';

export function OverviewMonthPicker({ billingMonth }: { billingMonth: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const monthValue = billingMonth.slice(0, 7);

  return (
    <label className="flex flex-col gap-1 text-sm">
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
        className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm"
      />
    </label>
  );
}
