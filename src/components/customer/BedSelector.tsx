'use client';

import { useMemo, useState } from 'react';
import { paiseToInr, formatDate } from '@/src/lib/format';
import { dispatchRoachieReminder } from '@/src/lib/cockroach/roachieReminders';
import { BookingEducationBar } from './BookingEducationBar';
import { BedBookingPanel } from './BedBookingPanel';
import { RoachieTourDemoBeds } from './RoachieTourDemoBeds';

export type BedSelectorBed = {
  bedId: string;
  bedCode: string;
  status: 'available' | 'maintenance' | 'blocked';
  /** Free on the reference date (today). */
  isAvailableNow: boolean;
  /** When occupied, earliest date the bed frees up. */
  nextAvailableDate: string | null;
  /** Unpaid checkouts in progress for this bed today. */
  interestCount?: number;
  /** Guest gave notice — bed opens after this date. */
  vacatingDate?: string | null;
  vacatingStatus?: 'pending' | 'approved' | null;
  /** Future admin/customer reservation. */
  reservedFrom?: string | null;
  /** Latest checkout when a future booking caps the stay. */
  availableUntilDate?: string | null;
  dailyRatePaise: number;
  weeklyRatePaise: number;
  monthlyRatePaise: number;
  securityDepositPaise: number;
  dailySecurityDepositPaise: number;
  weeklySecurityDepositPaise: number;
  monthlySecurityDepositPaise: number;
};

type TourRole = 'bed-available' | 'bed-notice' | 'bed-capped' | null;

type Props = {
  beds: BedSelectorBed[];
  theme?: 'dark' | 'light';
};

function assignTourRoles(beds: BedSelectorBed[]): Map<string, TourRole> {
  const roles = new Map<string, TourRole>();
  let hasAvailable = false;
  let hasNotice = false;
  let hasCapped = false;

  for (const bed of beds) {
    if (bed.status !== 'available') continue;

    if (!hasAvailable && bed.isAvailableNow) {
      roles.set(bed.bedId, 'bed-available');
      hasAvailable = true;
      continue;
    }

    if (
      !hasNotice &&
      !bed.isAvailableNow &&
      bed.nextAvailableDate &&
      bed.vacatingDate
    ) {
      roles.set(bed.bedId, 'bed-notice');
      hasNotice = true;
      continue;
    }

    if (!hasCapped && bed.availableUntilDate) {
      roles.set(bed.bedId, 'bed-capped');
      hasCapped = true;
    }
  }

  if (!hasNotice) {
    for (const bed of beds) {
      if (roles.has(bed.bedId)) continue;
      if (
        bed.status === 'available' &&
        !bed.isAvailableNow &&
        bed.nextAvailableDate &&
        !bed.availableUntilDate
      ) {
        roles.set(bed.bedId, 'bed-notice');
        hasNotice = true;
        break;
      }
    }
  }

  return roles;
}

/**
 * Bed-first selector: pick bed(s), then open the booking panel to choose dates
 * validated against per-bed availability timelines.
 */
export function BedSelector({ beds, theme = 'light' }: Props) {
  const dark = theme === 'dark';
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [panelOpen, setPanelOpen] = useState(false);

  const tourRoles = useMemo(() => assignTourRoles(beds), [beds]);
  const hasNoticeBed = [...tourRoles.values()].includes('bed-notice');
  const hasCappedBed = [...tourRoles.values()].includes('bed-capped');

  const selectedBeds = useMemo(
    () => beds.filter((b) => selected.has(b.bedId)),
    [beds, selected],
  );

  const sampleBed = beds.find((b) => b.monthlyRatePaise > 0) ?? beds[0];

  const bookableCount = beds.filter(
    (b) => b.status === 'available' && (b.isAvailableNow || b.nextAvailableDate),
  ).length;

  function toggle(bedId: string) {
    const bed = beds.find((b) => b.bedId === bedId);
    if (!bed || bed.status !== 'available') return;
    if (!bed.isAvailableNow && !bed.nextAvailableDate) return;

    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(bedId)) next.delete(bedId);
      else next.add(bedId);
      return next;
    });
  }

  function openPanelForBed(bedId: string) {
    const bed = beds.find((b) => b.bedId === bedId);
    if (!bed || bed.status !== 'available') return;
    if (!bed.isAvailableNow && !bed.nextAvailableDate) return;
    setSelected(new Set([bedId]));
    setPanelOpen(true);
  }

  function openPanelForSelection() {
    if (selected.size === 0) return;
    setPanelOpen(true);
  }

  return (
    <>
      <div className="space-y-4">
        <div
          className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4"
          data-roachie-focus="bed-pick"
          data-roachie-tour="bed-grid"
        >
          {beds.map((bed) => {
            const isSelected = selected.has(bed.bedId);
            const canBook =
              bed.status === 'available' &&
              (bed.isAvailableNow || Boolean(bed.nextAvailableDate));
            const tourRole = tourRoles.get(bed.bedId) ?? null;
            return (
              <BedTile
                key={bed.bedId}
                bed={bed}
                isSelected={isSelected}
                canBook={canBook}
                tourRole={tourRole}
                onToggle={() => toggle(bed.bedId)}
                onBook={() => openPanelForBed(bed.bedId)}
                onPreBook={() => {
                  dispatchRoachieReminder('pre-book');
                  openPanelForBed(bed.bedId);
                }}
                onReserve={() => {
                  dispatchRoachieReminder('reserve');
                  openPanelForBed(bed.bedId);
                }}
                dark={dark}
              />
            );
          })}
        </div>

        <RoachieTourDemoBeds
          showNotice={!hasNoticeBed}
          showCapped={!hasCappedBed}
          theme={theme}
        />

        <BookingEducationBar
          theme={theme}
          sampleMonthlyPaise={sampleBed?.monthlyRatePaise || 12_000_00}
          sampleDepositPaise={
            sampleBed?.monthlySecurityDepositPaise ||
            sampleBed?.securityDepositPaise ||
            5_000_00
          }
        />

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
                {selected.size === 0
                  ? `${bookableCount} bed${bookableCount === 1 ? '' : 's'} bookable`
                  : `${selected.size} bed${selected.size === 1 ? '' : 's'} selected`}
              </p>
              <p className={`text-xs ${dark ? 'text-apg-silver' : 'text-zinc-500'}`}>
                Tap a bed to book, or select several then continue
              </p>
            </div>
            <button
              type="button"
              disabled={selected.size === 0}
              onClick={openPanelForSelection}
              className={
                dark
                  ? 'inline-flex items-center justify-center rounded-lg bg-apg-orange px-5 py-2.5 text-sm font-semibold text-white apg-glow-btn hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40'
                  : 'inline-flex items-center justify-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-zinc-200 disabled:text-zinc-400'
              }
            >
              Choose dates →
            </button>
          </div>
        </div>
      </div>

      {panelOpen && selectedBeds.length > 0 ? (
        <BedBookingPanel
          beds={selectedBeds}
          theme={theme}
          onClose={() => setPanelOpen(false)}
        />
      ) : null}
    </>
  );
}

function BedTile({
  bed,
  isSelected,
  canBook,
  tourRole,
  onToggle,
  onBook,
  onPreBook,
  onReserve,
  dark = false,
}: {
  bed: BedSelectorBed;
  isSelected: boolean;
  canBook: boolean;
  tourRole: TourRole;
  onToggle: () => void;
  onBook: () => void;
  onPreBook: () => void;
  onReserve: () => void;
  dark?: boolean;
}) {
  const rate = bed.monthlyRatePaise;
  const depositPaise = bed.monthlySecurityDepositPaise || bed.securityDepositPaise;
  const interestCount = bed.interestCount ?? 0;
  const hasVacatingNotice = Boolean(bed.vacatingDate);
  const isNotice =
    tourRole === 'bed-notice' ||
    (hasVacatingNotice && bed.vacatingStatus === 'pending') ||
    (!bed.isAvailableNow && Boolean(bed.nextAvailableDate) && hasVacatingNotice);
  const isPreBookApproved =
    hasVacatingNotice && bed.vacatingStatus === 'approved' && Boolean(bed.vacatingDate);
  const isReserved = Boolean(bed.reservedFrom);
  const isCapped = tourRole === 'bed-capped';
  const isFutureOnly = !bed.isAvailableNow && Boolean(bed.nextAvailableDate);

  let stateLabel: string;
  let stateClass: string;
  if (bed.status === 'blocked') {
    stateLabel = 'Blocked';
    stateClass = dark ? 'bg-white/5 text-apg-muted' : 'bg-zinc-100 text-zinc-500';
  } else if (bed.status === 'maintenance') {
    stateLabel = 'Maintenance';
    stateClass = dark ? 'bg-amber-500/15 text-amber-200' : 'bg-amber-50 text-amber-700';
  } else if (isReserved) {
    stateLabel = `Reserved · ${formatDate(bed.reservedFrom!)}`;
    stateClass = dark
      ? 'bg-violet-500/15 text-violet-100 ring-1 ring-violet-400/30'
      : 'bg-violet-50 text-violet-800 ring-1 ring-violet-200';
  } else if (isPreBookApproved && bed.vacatingDate) {
    stateLabel = `Pre-book from ${formatDate(bed.vacatingDate)}`;
    stateClass = dark
      ? 'bg-sky-500/15 text-sky-100 ring-1 ring-sky-400/30'
      : 'bg-sky-50 text-sky-800 ring-1 ring-sky-200';
  } else if (isNotice) {
    const leaveDate = bed.vacatingDate ?? bed.nextAvailableDate;
    stateLabel = leaveDate
      ? `Leaving Soon · ${formatDate(leaveDate)}`
      : 'Leaving Soon';
    stateClass = dark
      ? 'bg-amber-500/20 text-amber-100 ring-1 ring-amber-400/30'
      : 'bg-amber-50 text-amber-800 ring-1 ring-amber-200';
  } else if (isCapped && bed.availableUntilDate) {
    stateLabel = `Available until: ${formatDate(bed.availableUntilDate)}`;
    stateClass = dark
      ? 'bg-rose-500/15 text-rose-100 ring-1 ring-rose-400/25'
      : 'bg-rose-50 text-rose-800 ring-1 ring-rose-200';
  } else if (bed.isAvailableNow) {
    stateLabel = 'Available now';
    stateClass = dark ? 'bg-emerald-500/15 text-emerald-200' : 'bg-emerald-50 text-emerald-700';
  } else if (bed.nextAvailableDate) {
    stateLabel = `From ${formatDate(bed.nextAvailableDate)}`;
    stateClass = dark ? 'bg-sky-500/15 text-sky-200' : 'bg-sky-50 text-sky-700';
  } else {
    stateLabel = 'Fully booked';
    stateClass = dark ? 'bg-rose-500/15 text-rose-200' : 'bg-rose-50 text-rose-700';
  }

  const tourAttr = tourRole ? { 'data-roachie-tour': tourRole } : undefined;

  const tileBase = dark
    ? 'relative flex flex-col items-start gap-2 rounded-xl border p-3 text-left transition-all '
    : 'relative flex flex-col items-start gap-2 rounded-lg border p-3 text-left transition-all ';

  return (
    <div
      {...tourAttr}
      className={
        tileBase +
        (!canBook
          ? dark
            ? 'border-white/5 bg-white/[0.02] opacity-60'
            : 'border-zinc-200 bg-zinc-50 opacity-70'
          : isSelected
            ? dark
              ? 'border-apg-orange bg-apg-orange/10 ring-2 ring-apg-orange/40'
              : 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-300'
            : dark
              ? 'border-white/10 apg-glass-light hover:border-apg-orange/40'
              : 'border-zinc-200 bg-white hover:border-indigo-300 hover:shadow-sm')
      }
    >
      <button
        type="button"
        onClick={onToggle}
        disabled={!canBook}
        aria-pressed={isSelected}
        className="absolute inset-0 z-0 rounded-xl"
        aria-label={`Select bed ${bed.bedCode}`}
      />
      <div className="relative z-10 flex w-full items-center justify-between pointer-events-none">
        <span className={`text-sm font-semibold ${dark ? 'text-white' : 'text-zinc-900'}`}>
          {bed.bedCode}
        </span>
        {canBook ? (
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
        className={`relative z-10 rounded-full px-2 py-0.5 text-[10px] font-semibold ${stateClass}`}
      >
        {stateLabel}
      </span>
      {canBook ? (
        <>
          <span className={`relative z-10 text-xs ${dark ? 'text-apg-silver' : 'text-zinc-700'}`}>
            {rate > 0 ? paiseToInr(rate) : '—'}
            <span className={dark ? ' text-apg-muted' : ' text-zinc-500'}> /mo</span>
          </span>
          {depositPaise > 0 ? (
            <span className={`relative z-10 text-[10px] ${dark ? 'text-apg-muted' : 'text-zinc-500'}`}>
              + {paiseToInr(depositPaise)} deposit
            </span>
          ) : null}
          {interestCount > 0 ? (
            <span
              className={`relative z-10 text-[10px] font-medium ${
                dark ? 'text-amber-200/90' : 'text-amber-700'
              }`}
            >
              {interestCount} interested — bed still open until payment approved
            </span>
          ) : null}
          <div className="relative z-10 mt-1 flex w-full flex-col gap-1 pointer-events-auto">
            {isFutureOnly ? (
              <button
                type="button"
                data-roachie-tour="pre-book"
                onClick={(e) => {
                  e.stopPropagation();
                  onPreBook();
                }}
                className={
                  'w-full rounded-md px-2 py-1.5 text-[11px] font-semibold ' +
                  (dark
                    ? 'border border-sky-400/40 bg-sky-500/15 text-sky-100 hover:bg-sky-500/25'
                    : 'border border-sky-300 bg-sky-50 text-sky-800 hover:bg-sky-100')
                }
              >
                Pre-Book
              </button>
            ) : (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onBook();
                }}
                className={
                  'w-full rounded-md px-2 py-1.5 text-[11px] font-semibold ' +
                  (dark
                    ? 'bg-apg-orange/90 text-white hover:bg-apg-orange'
                    : 'bg-indigo-600 text-white hover:bg-indigo-700')
                }
              >
                Book this bed
              </button>
            )}
            <button
              type="button"
              data-roachie-tour="reserve"
              onClick={(e) => {
                e.stopPropagation();
                onReserve();
              }}
              className={
                'w-full rounded-md px-2 py-1.5 text-[11px] font-semibold ' +
                (dark
                  ? 'border border-apg-orange/40 bg-apg-orange/10 text-white hover:bg-apg-orange/20'
                  : 'border border-indigo-400 bg-indigo-50 text-indigo-800 hover:bg-indigo-100')
              }
            >
              Reserve early (50% rent)
            </button>
          </div>
        </>
      ) : (
        <span className={`relative z-10 text-[10px] ${dark ? 'text-apg-muted' : 'text-zinc-500'}`}>
          Not bookable
        </span>
      )}
    </div>
  );
}
