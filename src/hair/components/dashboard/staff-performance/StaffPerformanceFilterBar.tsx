'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import {
  exportStaffPerformanceAction,
  type StaffPerformanceExportFormat,
} from '@/src/hair/actions/staffPerformanceExport';
import { FyhDatePicker } from '@/src/hair/components/ui/FyhDatePicker';
import type {
  StaffPerformanceComparisonMode,
  StaffPerformancePeriodPreset,
  StaffRevenueCategory,
} from '@/src/hair/lib/staffPerformancePeriod';
import type { RevenueDashboardLocationFilter } from '@/src/hair/services/revenueDashboardReportTypes';

const PRESETS: { id: StaffPerformancePeriodPreset; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
  { id: 'quarter', label: 'Quarter' },
  { id: 'year', label: 'Year' },
  { id: 'custom', label: 'Custom' },
];

const CATEGORIES: { id: StaffRevenueCategory; label: string }[] = [
  { id: 'combined', label: 'Combined' },
  { id: 'service', label: 'Services' },
  { id: 'product', label: 'Products' },
  { id: 'package', label: 'Packages' },
  { id: 'membership', label: 'Memberships' },
];

function buildHref(params: URLSearchParams) {
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export function StaffPerformanceFilterBar({
  salonName,
  periodPreset,
  category,
  staffIds,
  from,
  to,
  staffOptions,
  locationOptions,
  locationIds,
  comparisonMode,
}: {
  salonName: string;
  periodPreset: StaffPerformancePeriodPreset;
  category: StaffRevenueCategory;
  staffIds: string[];
  from: string | null;
  to: string | null;
  staffOptions: { id: string; name: string }[];
  locationOptions: { locationId: string; locationName: string; isActive: boolean }[];
  locationIds: RevenueDashboardLocationFilter;
  comparisonMode: StaffPerformanceComparisonMode;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [exportPending, startExport] = useTransition();
  const [exportError, setExportError] = useState<string | null>(null);
  const [staffOpen, setStaffOpen] = useState(false);

  const showBranchPicker = locationOptions.length > 1;
  const selectedLocations = useMemo(() => {
    if (locationIds === 'all' || !Array.isArray(locationIds)) {
      return new Set(locationOptions.map((l) => l.locationId));
    }
    return new Set(locationIds);
  }, [locationIds, locationOptions]);

  const filterRecord = useMemo(
    () => ({
      period: periodPreset,
      from: from ?? undefined,
      to: to ?? undefined,
      staff: staffIds.length ? staffIds.join(',') : undefined,
      category,
      locations:
        locationIds === 'all' || (Array.isArray(locationIds) && locationIds.length >= locationOptions.length)
          ? 'all'
          : Array.isArray(locationIds)
            ? locationIds.join(',')
            : 'all',
      compare: comparisonMode,
    }),
    [periodPreset, from, to, staffIds, category, locationIds, locationOptions.length, comparisonMode],
  );

  function push(next: Record<string, string | null | undefined>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v == null || v === '') params.delete(k);
      else params.set(k, v);
    }
    startTransition(() => {
      router.push(`/dashboard/staff-performance${buildHref(params)}`);
    });
  }

  function toggleStaff(id: string) {
    const set = new Set(staffIds);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    push({ staff: [...set].join(',') || null });
  }

  function runExport(format: StaffPerformanceExportFormat) {
    setExportError(null);
    startExport(async () => {
      const result = await exportStaffPerformanceAction({ filters: filterRecord, format });
      if (!result.ok) {
        setExportError(result.error);
        return;
      }
      if (result.format === 'xlsx') {
        const bin = atob(result.base64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const blob = new Blob([bytes], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = result.filename;
        a.click();
        URL.revokeObjectURL(url);
        return;
      }
      if (result.format === 'csv') {
        const blob = new Blob([result.content], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = result.filename;
        a.click();
        URL.revokeObjectURL(url);
        return;
      }
      const win = window.open('', '_blank');
      if (!win) {
        setExportError('Allow pop-ups to print PDF');
        return;
      }
      win.document.write(result.content);
      win.document.close();
    });
  }

  function toggleLocation(id: string) {
    const set = new Set(selectedLocations);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    if (set.size >= locationOptions.length) push({ locations: 'all' });
    else push({ locations: [...set].join(',') || null });
  }

  return (
    <div className="fyh-dashboard-card space-y-4 p-4">
      {showBranchPicker ? (
        <div>
          <p className="fyh-label text-xs">Branch</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => push({ locations: 'all' })}
              className="rounded border border-[color:var(--fyh-border)] px-2 py-1 text-xs"
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
                  checked={selectedLocations.has(loc.locationId)}
                  onChange={() => toggleLocation(loc.locationId)}
                  className="accent-fyh-accent"
                />
                {loc.locationName}
              </label>
            ))}
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            disabled={pending}
            onClick={() =>
              push({
                period: p.id,
                ...(p.id !== 'custom' ? { from: null, to: null } : {}),
              })
            }
            className={`rounded-md px-3 py-1.5 text-xs font-medium uppercase tracking-wide transition ${
              periodPreset === p.id
                ? 'bg-fyh-accent/20 text-fyh-accent'
                : 'bg-black/20 text-fyh-text-secondary hover:text-fyh-text'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {periodPreset === 'custom' ? (
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <p className="mb-1 text-[10px] uppercase tracking-wide text-fyh-text-muted">From</p>
            <FyhDatePicker
              value={from ?? ''}
              onChange={(v) => push({ period: 'custom', from: v || null })}
            />
          </div>
          <div>
            <p className="mb-1 text-[10px] uppercase tracking-wide text-fyh-text-muted">To</p>
            <FyhDatePicker
              value={to ?? ''}
              onChange={(v) => push({ period: 'custom', to: v || null })}
            />
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-start gap-4">
        <div>
          <p className="mb-1 text-[10px] uppercase tracking-wide text-fyh-text-muted">Salon</p>
          <div className="rounded-md border border-white/10 bg-black/25 px-3 py-2 text-sm text-fyh-text-secondary">
            {salonName}
            <span className="ml-2 text-[10px] uppercase tracking-wide text-fyh-text-muted">
              Locked
            </span>
          </div>
        </div>

        <div className="relative">
          <p className="mb-1 text-[10px] uppercase tracking-wide text-fyh-text-muted">Staff</p>
          <button
            type="button"
            onClick={() => setStaffOpen((o) => !o)}
            className="rounded-md border border-white/10 bg-black/25 px-3 py-2 text-sm text-fyh-text"
          >
            {staffIds.length ? `${staffIds.length} selected` : 'All staff'}
          </button>
          {staffOpen ? (
            <div className="absolute z-20 mt-1 max-h-56 w-56 overflow-auto rounded-md border border-white/10 bg-fyh-elevated p-2 shadow-lg">
              {staffOptions.map((s) => (
                <label
                  key={s.id}
                  className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-white/5"
                >
                  <input
                    type="checkbox"
                    checked={staffIds.includes(s.id)}
                    onChange={() => toggleStaff(s.id)}
                  />
                  <span className="truncate">{s.name}</span>
                </label>
              ))}
              {staffIds.length ? (
                <button
                  type="button"
                  className="mt-1 w-full text-left text-xs text-fyh-accent"
                  onClick={() => push({ staff: null })}
                >
                  Clear selection
                </button>
              ) : null}
            </div>
          ) : null}
        </div>

        <div>
          <p className="mb-1 text-[10px] uppercase tracking-wide text-fyh-text-muted">Category</p>
          <div className="flex flex-wrap gap-1">
            {CATEGORIES.map((c) => (
              <button
                key={c.id}
                type="button"
                disabled={pending}
                onClick={() => push({ category: c.id })}
                className={`rounded-md px-2.5 py-1.5 text-xs ${
                  category === c.id
                    ? 'bg-fyh-forest/25 text-fyh-forest'
                    : 'bg-black/20 text-fyh-text-secondary'
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-1 text-[10px] uppercase tracking-wide text-fyh-text-muted">Compare</p>
          <div className="flex flex-wrap gap-1">
            <button
              type="button"
              disabled={pending}
              onClick={() => push({ compare: 'previous_period' })}
              className={`rounded-md px-2.5 py-1.5 text-xs ${
                comparisonMode === 'previous_period'
                  ? 'bg-fyh-forest/25 text-fyh-forest'
                  : 'bg-black/20 text-fyh-text-secondary'
              }`}
            >
              Previous period
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => push({ compare: 'same_mtd_last_month' })}
              className={`rounded-md px-2.5 py-1.5 text-xs ${
                comparisonMode === 'same_mtd_last_month'
                  ? 'bg-fyh-forest/25 text-fyh-forest'
                  : 'bg-black/20 text-fyh-text-secondary'
              }`}
            >
              Same MTD last month
            </button>
          </div>
        </div>

        <div className="ml-auto flex flex-wrap items-end gap-2">
          <p className="mb-1 w-full text-right text-[10px] uppercase tracking-wide text-fyh-text-muted">
            Export
          </p>
          {(['xlsx', 'csv', 'pdf'] as const).map((fmt) => (
            <button
              key={fmt}
              type="button"
              disabled={exportPending}
              onClick={() => runExport(fmt)}
              className="fyh-btn-secondary px-3 py-1.5 text-xs uppercase tracking-wide disabled:opacity-50"
            >
              {fmt === 'xlsx' ? 'Excel' : fmt === 'csv' ? 'CSV' : 'PDF'}
            </button>
          ))}
        </div>
      </div>
      {exportError ? <p className="text-xs text-red-400">{exportError}</p> : null}
    </div>
  );
}
