'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import {
  exportStaffPerformanceAction,
  type StaffPerformanceExportFormat,
} from '@/src/hair/actions/staffPerformanceExport';
import {
  shiftStaffPerformanceDayRange,
  type StaffRevenueCategory,
} from '@/src/hair/lib/staffPerformancePeriod';
import { formatStaffPerformanceDayLabel } from '@/src/hair/lib/formatStaffPerformanceDay';
import type { RevenueDashboardLocationFilter } from '@/src/hair/services/revenueDashboardReportTypes';

const CATEGORIES: { id: StaffRevenueCategory; label: string }[] = [
  { id: 'combined', label: 'Combined' },
  { id: 'service', label: 'Services' },
  { id: 'product', label: 'Products' },
  { id: 'package', label: 'Packages' },
  { id: 'membership', label: 'Memberships' },
];

const dateInputClass =
  'block h-9 min-h-9 w-full min-w-0 rounded-md border border-[color:var(--fyh-border)] bg-white px-2 py-1 text-sm text-fyh-text shadow-sm';

function buildHref(params: URLSearchParams) {
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export function StaffPerformanceFilterBar({
  salonName,
  fromDayKey,
  toDayKey,
  category,
  staffIds,
  staffOptions,
  locationOptions,
  locationIds,
}: {
  salonName: string;
  fromDayKey: string;
  toDayKey: string;
  category: StaffRevenueCategory;
  staffIds: string[];
  staffOptions: { id: string; name: string }[];
  locationOptions: { locationId: string; locationName: string; isActive: boolean }[];
  locationIds: RevenueDashboardLocationFilter;
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
      from: fromDayKey,
      to: toDayKey,
      staff: staffIds.length ? staffIds.join(',') : undefined,
      category,
      locations:
        locationIds === 'all' ||
        (Array.isArray(locationIds) && locationIds.length >= locationOptions.length)
          ? 'all'
          : Array.isArray(locationIds)
            ? locationIds.join(',')
            : 'all',
    }),
    [fromDayKey, toDayKey, staffIds, category, locationIds, locationOptions.length],
  );

  function push(next: Record<string, string | null | undefined>) {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('period');
    params.delete('compare');
    for (const [k, v] of Object.entries(next)) {
      if (v == null || v === '') params.delete(k);
      else params.set(k, v);
    }
    startTransition(() => {
      router.push(`/dashboard/staff-performance${buildHref(params)}`);
    });
  }

  function applyDayRange(from: string, to: string) {
    let nextFrom = from.slice(0, 10);
    let nextTo = to.slice(0, 10);
    if (nextFrom > nextTo) {
      const swap = nextFrom;
      nextFrom = nextTo;
      nextTo = swap;
    }
    push({ from: nextFrom, to: nextTo });
  }

  function shiftRange(dayDelta: number) {
    const shifted = shiftStaffPerformanceDayRange(fromDayKey, toDayKey, dayDelta);
    push({ from: shifted.fromDayKey, to: shifted.toDayKey });
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
    <div className="space-y-4 rounded-lg border border-[color:var(--fyh-border)] bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <button
          type="button"
          disabled={pending}
          onClick={() => shiftRange(-1)}
          className="fyh-btn-secondary inline-flex h-9 items-center justify-center gap-1 px-3 text-sm disabled:opacity-50"
          aria-label="Previous day or range"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
          <span className="hidden sm:inline">Previous</span>
        </button>

        <label className="min-w-[9.5rem] flex-1">
          <span className="fyh-label text-[0.6875rem]">From</span>
          <input
            type="date"
            className={dateInputClass}
            value={fromDayKey}
            max={toDayKey}
            disabled={pending}
            onChange={(e) => applyDayRange(e.target.value, toDayKey)}
          />
        </label>
        <label className="min-w-[9.5rem] flex-1">
          <span className="fyh-label text-[0.6875rem]">To</span>
          <input
            type="date"
            className={dateInputClass}
            value={toDayKey}
            min={fromDayKey}
            disabled={pending}
            onChange={(e) => applyDayRange(fromDayKey, e.target.value)}
          />
        </label>

        <button
          type="button"
          disabled={pending}
          onClick={() => shiftRange(1)}
          className="fyh-btn-secondary inline-flex h-9 items-center justify-center gap-1 px-3 text-sm disabled:opacity-50"
          aria-label="Next day or range"
        >
          <span className="hidden sm:inline">Next</span>
          <ChevronRight className="h-4 w-4" aria-hidden />
        </button>

        <p className="w-full text-center text-xs text-fyh-text-muted sm:order-first sm:w-auto sm:flex-1 sm:text-left">
          {formatStaffPerformanceDayLabel(fromDayKey)}
          {fromDayKey !== toDayKey ? ` → ${formatStaffPerformanceDayLabel(toDayKey)}` : ''}
        </p>
      </div>

      {showBranchPicker ? (
        <div>
          <p className="fyh-label text-xs">Branch</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => push({ locations: 'all' })}
              className="rounded-md border border-[color:var(--fyh-border)] bg-fyh-surface-muted px-2 py-1 text-xs text-fyh-text-secondary hover:bg-fyh-surface-muted/80"
            >
              Select all
            </button>
            {locationOptions.map((loc) => (
              <label
                key={loc.locationId}
                className="flex cursor-pointer items-center gap-1.5 rounded-md border border-[color:var(--fyh-border)] bg-white px-2 py-1 text-xs"
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

      <div className="flex flex-wrap items-start gap-4 border-t border-[color:var(--fyh-border)] pt-4">
        <div>
          <p className="fyh-label text-xs">Salon</p>
          <div className="mt-1 rounded-md border border-[color:var(--fyh-border)] bg-fyh-surface-muted px-3 py-2 text-sm text-fyh-text">
            {salonName}
          </div>
        </div>

        <div className="relative">
          <p className="fyh-label text-xs">Staff</p>
          <button
            type="button"
            onClick={() => setStaffOpen((o) => !o)}
            className="mt-1 rounded-md border border-[color:var(--fyh-border)] bg-white px-3 py-2 text-sm text-fyh-text shadow-sm hover:bg-fyh-surface-muted"
          >
            {staffIds.length ? `${staffIds.length} selected` : 'All staff'}
          </button>
          {staffOpen ? (
            <div className="absolute z-20 mt-1 max-h-56 w-56 overflow-auto rounded-md border border-[color:var(--fyh-border)] bg-white p-2 shadow-lg">
              {staffOptions.map((s) => (
                <label
                  key={s.id}
                  className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-fyh-surface-muted"
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
          <p className="fyh-label text-xs">Category</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {CATEGORIES.map((c) => (
              <button
                key={c.id}
                type="button"
                disabled={pending}
                onClick={() => push({ category: c.id })}
                className={`rounded-md px-2.5 py-1.5 text-xs font-medium ${
                  category === c.id
                    ? 'bg-fyh-accent/15 text-fyh-accent ring-1 ring-fyh-accent/30'
                    : 'border border-[color:var(--fyh-border)] bg-white text-fyh-text-secondary hover:bg-fyh-surface-muted'
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        <div className="ml-auto flex flex-wrap items-end gap-2">
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
      {exportError ? <p className="text-xs text-red-600">{exportError}</p> : null}
    </div>
  );
}
