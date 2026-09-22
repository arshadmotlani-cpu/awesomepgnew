'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { TenantLocationOption } from '@/src/hair/actions/tenant';

type Props = {
  fromDayKey: string;
  toDayKey: string;
  locationsParam: string;
  locationOptions: TenantLocationOption[];
};

const dateInputClass =
  'mt-0.5 block h-9 min-h-9 w-full min-w-0 rounded border border-[color:var(--fyh-border)] bg-transparent px-2 py-1 text-sm';

export function RevenueDashboardFilters({
  fromDayKey,
  toDayKey,
  locationsParam,
  locationOptions,
}: Props) {
  const router = useRouter();
  const showBranchPicker = locationOptions.length > 1;

  const initialSelected = useMemo(() => {
    if (locationsParam === 'all' || !locationsParam.trim()) {
      return new Set(locationOptions.map((l) => l.locationId));
    }
    return new Set(locationsParam.split(',').map((s) => s.trim()).filter(Boolean));
  }, [locationsParam, locationOptions]);

  const [selected, setSelected] = useState<Set<string>>(initialSelected);

  function toggleLocation(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(locationOptions.map((l) => l.locationId)));
  }

  function apply(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const from = (form.elements.namedItem('from') as HTMLInputElement).value;
    const to = (form.elements.namedItem('to') as HTMLInputElement).value;
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (showBranchPicker) {
      const allSelected = selected.size >= locationOptions.length;
      params.set('locations', allSelected ? 'all' : [...selected].join(','));
    }
    router.push(`/dashboard/revenue?${params.toString()}`);
  }

  return (
    <form
      onSubmit={apply}
      className="border-b border-[color:var(--fyh-border)] pb-3 sm:fyh-dashboard-card sm:rounded-lg sm:border sm:p-3 sm:pb-3"
    >
      {showBranchPicker ? (
        <div className="mb-2 sm:mb-3">
          <p className="fyh-label text-[0.6875rem]">Branch</p>
          <div className="mt-1 flex max-h-20 flex-wrap gap-1.5 overflow-y-auto sm:max-h-none">
            <button
              type="button"
              onClick={selectAll}
              className="rounded border border-[color:var(--fyh-border)] px-2 py-0.5 text-[0.6875rem] text-fyh-text-secondary hover:bg-fyh-surface-muted"
            >
              Select all
            </button>
            {locationOptions.map((loc) => (
              <label
                key={loc.locationId}
                className="flex cursor-pointer items-center gap-1 rounded border border-[color:var(--fyh-border)] px-1.5 py-0.5 text-[0.6875rem]"
              >
                <input
                  type="checkbox"
                  checked={selected.has(loc.locationId)}
                  onChange={() => toggleLocation(loc.locationId)}
                  className="accent-fyh-accent"
                />
                <span className={loc.isActive ? '' : 'text-fyh-text-muted'}>{loc.locationName}</span>
              </label>
            ))}
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-2 items-end gap-x-2 gap-y-2 sm:flex sm:flex-wrap sm:gap-3">
        <label className="min-w-0">
          <span className="fyh-label text-[0.6875rem]">From</span>
          <input name="from" type="date" defaultValue={fromDayKey} className={dateInputClass} />
        </label>
        <label className="min-w-0">
          <span className="fyh-label text-[0.6875rem]">To</span>
          <input name="to" type="date" defaultValue={toDayKey} className={dateInputClass} />
        </label>
        <button
          type="submit"
          className="fyh-btn-primary col-span-2 h-9 min-h-9 w-full px-3 text-sm max-[360px]:w-full sm:col-span-1 sm:w-auto"
        >
          Apply
        </button>
      </div>
    </form>
  );
}
