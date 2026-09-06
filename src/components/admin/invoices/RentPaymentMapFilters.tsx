'use client';

import { useCallback, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { OverviewMonthNav } from '@/src/components/admin/OverviewMonthNav';

export function RentPaymentMapFilters({
  pgs,
  billingMonth,
  selectedPgId,
}: {
  pgs: Array<{ id: string; name: string }>;
  billingMonth: string;
  selectedPgId?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const pushPg = useCallback(
    (pgId: string | undefined) => {
      const params = new URLSearchParams(searchParams.toString());
      if (pgId) params.set('pg', pgId);
      else params.delete('pg');
      startTransition(() => {
        router.replace(`${pathname}?${params.toString()}`, { scroll: false });
      });
    },
    [pathname, router, searchParams],
  );

  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="block min-w-[12rem] text-[10px] font-semibold uppercase tracking-wide text-apg-silver">
        PG
        <select
          className="mt-1 w-full rounded-lg border border-white/10 bg-[#1A1F27] px-3 py-2 text-sm text-white"
          value={selectedPgId ?? ''}
          onChange={(e) => pushPg(e.target.value || undefined)}
        >
          <option value="">All PGs</option>
          {pgs.map((pg) => (
            <option key={pg.id} value={pg.id}>
              {pg.name}
            </option>
          ))}
        </select>
      </label>
      <div>
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-apg-silver">
          Billing month
        </p>
        <OverviewMonthNav billingMonth={billingMonth} />
      </div>
    </div>
  );
}
