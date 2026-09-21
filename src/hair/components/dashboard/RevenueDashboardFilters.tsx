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
      className="fyh-dashboard-card flex flex-col gap-4 p-4 sm:flex-row sm:flex-wrap sm:items-end"
    >
      {showBranchPicker ? (
        <div className="min-w-[12rem] flex-1">
          <p className="fyh-label text-xs">Branch</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={selectAll}
              className="rounded border border-[color:var(--fyh-border)] px-2 py-1 text-xs text-fyh-text-secondary hover:bg-fyh-surface-muted"
            >
              Select all
            </button>
            {locationOptions.map((loc) => (
              <label
                key={loc.locationId}
                className="flex cursor-pointer items-center gap-1.5 rounded border border-[color:var(--fyh-border)] px-2 py-1 text-xs"
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

      <label className="text-sm">
        <span className="fyh-label text-xs">From</span>
        <input
          name="from"
          type="date"
          defaultValue={fromDayKey}
          className="mt-1 block w-full min-w-[10rem] rounded border border-[color:var(--fyh-border)] bg-transparent px-2 py-1.5"
        />
      </label>
      <label className="text-sm">
        <span className="fyh-label text-xs">To</span>
        <input
          name="to"
          type="date"
          defaultValue={toDayKey}
          className="mt-1 block w-full min-w-[10rem] rounded border border-[color:var(--fyh-border)] bg-transparent px-2 py-1.5"
        />
      </label>
      <button
        type="submit"
        className="rounded bg-fyh-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90"
      >
        Apply
      </button>
    </form>
  );
}
