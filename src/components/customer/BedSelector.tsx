'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { paiseToInr } from '@/src/lib/format';
import { VACATING_NOTICE_MIN_DAYS } from '@/src/lib/dateDefaults';

export type BedSelectorBed = {
  bedId: string;
  bedCode: string;
  status: 'available' | 'maintenance' | 'blocked';
  isAvailableForRange: boolean;
  nextAvailableDate: string | null;
  dailyRatePaise: number;
  weeklyRatePaise: number;
  monthlyRatePaise: number;
  securityDepositPaise: number;
  dailySecurityDepositPaise: number;
  weeklySecurityDepositPaise: number;
  monthlySecurityDepositPaise: number;
};

function depositForMode(bed: BedSelectorBed, durationMode: string): number {
  const fallback = bed.securityDepositPaise;
  if (durationMode === 'daily') {
    return bed.dailySecurityDepositPaise > 0
      ? bed.dailySecurityDepositPaise
      : fallback;
  }
  if (durationMode === 'weekly') {
    return bed.weeklySecurityDepositPaise > 0
      ? bed.weeklySecurityDepositPaise
      : fallback;
  }
  return bed.monthlySecurityDepositPaise > 0
    ? bed.monthlySecurityDepositPaise
    : fallback;
}

type Props = {
  beds: BedSelectorBed[];
  startDate: string;
  endDate: string;
  durationMode: string;
  pgSlug: string;
  theme?: 'dark' | 'light';
};

/**
 * Bed selector with local checkbox state. Submitting takes the user to
 * `/booking/new` with every selected bed propagated as a `bed=<uuid>` query
 * parameter and the date range / mode preserved. The booking-new page does
 * the next round of validation server-side.
 */
export function BedSelector({ beds, startDate, endDate, durationMode, theme = 'light' }: Props) {
  const dark = theme === 'dark';
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const selectedCount = selected.size;
  const subtotal = useMemo(() => {
    let total = 0;
    for (const b of beds) {
      if (!selected.has(b.bedId)) continue;
      if (durationMode === 'daily') total += b.dailyRatePaise;
      else if (durationMode === 'weekly') total += b.weeklyRatePaise;
      else total += b.monthlyRatePaise;
    }
    return total;
  }, [beds, selected, durationMode]);

  function toggle(bedId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(bedId)) next.delete(bedId);
      else next.add(bedId);
      return next;
    });
  }

  function goToCart() {
    if (selectedCount === 0) return;
    const params = new URLSearchParams();
    params.set('start', startDate);
    params.set('end', endDate);
    params.set('mode', durationMode);
    for (const bedId of selected) params.append('bed', bedId);
    router.push(`/booking/new?${params.toString()}`);
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4" data-roachie-focus="bed-pick">
        {beds.map((bed) => {
          const isSelected = selected.has(bed.bedId);
          const isAvailable =
            bed.status === 'available' && bed.isAvailableForRange;
          return (
            <BedTile
              key={bed.bedId}
              bed={bed}
              durationMode={durationMode}
              isSelected={isSelected}
              isAvailable={isAvailable}
              onToggle={() => toggle(bed.bedId)}
              dark={dark}
            />
          );
        })}
      </div>

      <div
        className={
          dark
            ? 'sticky bottom-4 z-10 rounded-2xl border border-white/10 apg-glass px-4 py-4 shadow-2xl'
            : 'sticky bottom-0 z-10 -mx-4 border-t border-zinc-200 bg-white px-4 py-3 shadow-[0_-4px_12px_rgba(15,23,42,0.04)] sm:mx-0 sm:rounded-xl sm:border sm:shadow-sm'
        }
      >
        <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className={`text-sm font-semibold ${dark ? 'text-white' : 'text-zinc-900'}`}>
              {selectedCount === 0
                ? 'No beds selected'
                : `${selectedCount} bed${selectedCount === 1 ? '' : 's'} selected`}
            </p>
            <p className={`text-xs ${dark ? 'text-apg-silver' : 'text-zinc-500'}`}>
              {durationMode === 'open_ended'
                ? `Living here — billed monthly. Give ${VACATING_NOTICE_MIN_DAYS} days notice when you plan to leave.`
                : `Subtotal at ${durationMode} rate: ${
                    subtotal > 0 ? paiseToInr(subtotal) : '—'
                  } (excl. deposit)`}
            </p>
          </div>
          <button
            type="button"
            disabled={selectedCount === 0}
            onClick={goToCart}
            className={
              dark
                ? 'inline-flex items-center justify-center rounded-lg bg-apg-orange px-5 py-2.5 text-sm font-semibold text-white apg-glow-btn hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40'
                : 'inline-flex items-center justify-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-zinc-200 disabled:text-zinc-400'
            }
          >
            Continue to booking →
          </button>
        </div>
      </div>
    </div>
  );
}

function BedTile({
  bed,
  durationMode,
  isSelected,
  isAvailable,
  onToggle,
  dark = false,
}: {
  bed: BedSelectorBed;
  durationMode: string;
  isSelected: boolean;
  isAvailable: boolean;
  onToggle: () => void;
  dark?: boolean;
}) {
  const rate =
    durationMode === 'daily'
      ? bed.dailyRatePaise
      : durationMode === 'weekly'
        ? bed.weeklyRatePaise
        : bed.monthlyRatePaise;
  const rateLabel =
    durationMode === 'daily'
      ? '/day'
      : durationMode === 'weekly'
        ? '/week'
        : '/mo';
  const depositPaise = depositForMode(bed, durationMode);

  let stateLabel: string;
  let stateClass: string;
  if (bed.status === 'blocked') {
    stateLabel = 'Blocked';
    stateClass = dark ? 'bg-white/5 text-apg-muted' : 'bg-zinc-100 text-zinc-500';
  } else if (bed.status === 'maintenance') {
    stateLabel = 'Maintenance';
    stateClass = dark ? 'bg-amber-500/15 text-amber-200' : 'bg-amber-50 text-amber-700';
  } else if (!bed.isAvailableForRange) {
    stateLabel = bed.nextAvailableDate
      ? `Booked · next ${bed.nextAvailableDate}`
      : 'Booked';
    stateClass = dark ? 'bg-rose-500/15 text-rose-200' : 'bg-rose-50 text-rose-700';
  } else {
    stateLabel = 'Available';
    stateClass = dark ? 'bg-emerald-500/15 text-emerald-200' : 'bg-emerald-50 text-emerald-700';
  }

  const tileBase = dark
    ? 'flex flex-col items-start gap-2 rounded-xl border p-3 text-left transition-all '
    : 'flex flex-col items-start gap-2 rounded-lg border p-3 text-left transition-all ';

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={!isAvailable}
      aria-pressed={isSelected}
      className={
        tileBase +
        (!isAvailable
          ? dark
            ? 'cursor-not-allowed border-white/5 bg-white/[0.02] opacity-60'
            : 'cursor-not-allowed border-zinc-200 bg-zinc-50 opacity-70'
          : isSelected
            ? dark
              ? 'border-apg-orange bg-apg-orange/10 ring-2 ring-apg-orange/40'
              : 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-300'
            : dark
              ? 'border-white/10 apg-glass-light hover:border-apg-orange/40'
              : 'border-zinc-200 bg-white hover:border-indigo-300 hover:shadow-sm')
      }
    >
      <div className="flex w-full items-center justify-between">
        <span className={`text-sm font-semibold ${dark ? 'text-white' : 'text-zinc-900'}`}>
          {bed.bedCode}
        </span>
        {isAvailable ? (
          <span
            className={`flex h-4 w-4 items-center justify-center rounded border ${
              isSelected
                ? dark
                  ? 'border-apg-orange bg-apg-orange text-white'
                  : 'border-indigo-600 bg-indigo-600 text-white'
                : dark
                  ? 'border-white/20 bg-transparent'
                  : 'border-zinc-300 bg-white'
            }`}
            aria-hidden
          >
            {isSelected ? (
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path
                  d="M2 5l2 2 4-4"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            ) : null}
          </span>
        ) : null}
      </div>
      <span
        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${stateClass}`}
      >
        {stateLabel}
      </span>
      {isAvailable ? (
        <>
          <span className={`text-xs ${dark ? 'text-apg-silver' : 'text-zinc-700'}`}>
            {rate > 0 ? paiseToInr(rate) : '—'}
            <span className={dark ? ' text-apg-muted' : ' text-zinc-500'}> {rateLabel}</span>
          </span>
          {depositPaise > 0 ? (
            <span className={`text-[10px] ${dark ? 'text-apg-muted' : 'text-zinc-500'}`}>
              + {paiseToInr(depositPaise)} deposit
            </span>
          ) : null}
        </>
      ) : (
        <span className={`text-[10px] ${dark ? 'text-apg-muted' : 'text-zinc-500'}`}>
          Occupied — rates not shown
        </span>
      )}
    </button>
  );
}
