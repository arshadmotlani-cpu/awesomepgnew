'use client';

import { useCallback, useEffect, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { BillingCollectionDateFilter } from '@/src/lib/admin/billingCollectionsFilter';
import type { BillingCentreDashboardFilters } from '@/src/lib/admin/billingCentreDashboardPresentation';

const PAID_PERIODS: Array<{ id: BillingCollectionDateFilter; label: string }> = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'week', label: 'Last 7 days' },
];

export function BillingCentreStickyFilters({
  pgs,
  filters,
}: {
  pgs: Array<{ id: string; name: string }>;
  filters: BillingCentreDashboardFilters;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const pushFilters = useCallback(
    (next: Partial<BillingCentreDashboardFilters>) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('tab', 'dashboard');

      const merged = { ...filters, ...next };
      if (merged.pgId) params.set('pg', merged.pgId);
      else params.delete('pg');
      if (merged.roomQuery) params.set('room', merged.roomQuery);
      else params.delete('room');
      if (merged.residentQuery) params.set('resident', merged.residentQuery);
      else params.delete('resident');
      if (merged.paidPeriod && merged.paidPeriod !== 'today') {
        params.set('paidPeriod', merged.paidPeriod);
      } else {
        params.delete('paidPeriod');
      }

      startTransition(() => {
        router.replace(`${pathname}?${params.toString()}`, { scroll: false });
      });
    },
    [filters, pathname, router, searchParams],
  );

  return (
    <div className="sticky top-0 z-20 -mx-1 mb-4 rounded-xl border border-white/10 bg-[#12161C]/95 px-3 py-3 backdrop-blur-sm">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block min-w-0 text-[10px] font-semibold uppercase tracking-wide text-apg-silver">
          PG
          <select
            className="mt-1 w-full rounded-lg border border-white/10 bg-[#0d1015] px-2 py-1.5 text-xs text-white"
            value={filters.pgId ?? ''}
            onChange={(e) => pushFilters({ pgId: e.target.value || undefined })}
          >
            <option value="">All PGs</option>
            {pgs.map((pg) => (
              <option key={pg.id} value={pg.id}>
                {pg.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block min-w-0 text-[10px] font-semibold uppercase tracking-wide text-apg-silver">
          Room
          <input
            className="mt-1 w-full rounded-lg border border-white/10 bg-[#0d1015] px-2 py-1.5 text-xs text-white"
            placeholder="Room #"
            value={filters.roomQuery ?? ''}
            onChange={(e) => pushFilters({ roomQuery: e.target.value || undefined })}
          />
        </label>
        <label className="block min-w-0 text-[10px] font-semibold uppercase tracking-wide text-apg-silver">
          Resident
          <input
            className="mt-1 w-full rounded-lg border border-white/10 bg-[#0d1015] px-2 py-1.5 text-xs text-white"
            placeholder="Name or phone"
            value={filters.residentQuery ?? ''}
            onChange={(e) => pushFilters({ residentQuery: e.target.value || undefined })}
          />
        </label>
        <label className="block min-w-0 text-[10px] font-semibold uppercase tracking-wide text-apg-silver">
          Paid period
          <select
            className="mt-1 w-full rounded-lg border border-white/10 bg-[#0d1015] px-2 py-1.5 text-xs text-white"
            value={filters.paidPeriod ?? 'today'}
            onChange={(e) =>
              pushFilters({ paidPeriod: e.target.value as BillingCollectionDateFilter })
            }
          >
            {PAID_PERIODS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}

export function BillingCentreAutoRefresh({ enabled }: { enabled: boolean }) {
  const router = useRouter();

  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => router.refresh(), 90_000);
    return () => window.clearInterval(id);
  }, [enabled, router]);

  return null;
}
