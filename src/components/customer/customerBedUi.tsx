'use client';

import { useEffect, useId, useState } from 'react';
import {
  CUSTOMER_BED_KIND_CLASS,
  deriveCustomerBedAvailabilityView,
} from '@/src/lib/bedAvailabilityState';
import { reserveBufferDate } from '@/src/lib/bedReservePolicy';
import { customerBookableFromDate } from '@/src/lib/dates';
import { displayMonthlyDepositPaise } from '@/src/lib/customerDepositDisplay';
import { formatDate, paiseToInr } from '@/src/lib/format';
import type { BedSelectorBed } from './customerBedTypes';
import { BedStateTile, type BedVisualState } from '@/src/components/customer/design-system';
import type { BedAvailabilityKind } from '@/src/lib/bedAvailabilityState';

function bedAvailability(bed: BedSelectorBed) {
  return deriveCustomerBedAvailabilityView({
    bedStatus: bed.status,
    isAvailableNow: bed.isAvailableNow,
    manualOccupied: bed.manualOccupied,
    nextAvailableDate: bed.nextAvailableDate,
    vacatingDate: bed.vacatingDate,
    vacatingStatus: bed.vacatingStatus,
    reservedFrom: bed.reservedFrom,
    activeBedReserveCheckIn: bed.activeBedReserveCheckIn,
    availableUntilDate: bed.availableUntilDate,
    noticeInterestCount: bed.noticeInterestCount,
    holdInterestCount: bed.interestCount,
  });
}

export function canBookBed(bed: BedSelectorBed): boolean {
  const bookableFrom = customerBookableFromDate(bed.nextAvailableDate);
  return (
    bed.status === 'available' &&
    (bed.isAvailableNow ||
      Boolean(bookableFrom) ||
      Boolean(bed.vacatingDate) ||
      Boolean(bed.activeBedReserveCheckIn))
  );
}

function visualStateForKind(kind: BedAvailabilityKind, selected?: boolean): BedVisualState {
  if (selected) return 'selected';
  switch (kind) {
    case 'open_now':
    case 'pre_bookable':
      return 'available';
    case 'notice':
      return 'notice';
    case 'reserved':
    case 'booked':
    case 'hold_interest':
      return 'reserved';
    default:
      return 'occupied';
  }
}

export function CustomerBedTile({
  bed,
  isSelected,
  onSelect,
}: {
  bed: BedSelectorBed;
  isSelected?: boolean;
  onSelect: () => void;
}) {
  const availability = bedAvailability(bed);
  const bookable = canBookBed(bed);
  const state = visualStateForKind(availability.kind, isSelected);

  return (
    <BedStateTile
      bedCode={bed.bedCode}
      label={availability.label}
      sublabel={availability.sublabel}
      state={state}
      selected={isSelected}
      disabled={!bookable && availability.kind !== 'notice' && !isSelected}
      onSelect={onSelect}
    />
  );
}

function BedPricingDetails({
  bed,
  isNotice,
  shortStayOnly,
}: {
  bed: BedSelectorBed;
  isNotice: boolean;
  shortStayOnly?: boolean;
}) {
  const rate = bed.monthlyRatePaise;
  const deposit = displayMonthlyDepositPaise(bed);
  const bookableFrom = customerBookableFromDate(bed.nextAvailableDate);

  return (
    <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
      {shortStayOnly ? (
        <>
          <dt className="text-apg-silver">Daily from</dt>
          <dd className="text-right font-medium text-white">
            {bed.dailyRatePaise > 0 ? paiseToInr(bed.dailyRatePaise) : '—'}
          </dd>
          <dt className="text-apg-silver">Weekly from</dt>
          <dd className="text-right font-medium text-white">
            {bed.weeklyRatePaise > 0 ? paiseToInr(bed.weeklyRatePaise) : '—'}
          </dd>
        </>
      ) : (
        <>
          <dt className="text-apg-silver">Rent</dt>
          <dd className="text-right font-medium text-white">
            {rate > 0 ? `${paiseToInr(rate)}/mo` : '—'}
          </dd>
          {deposit > 0 ? (
            <>
              <dt className="text-apg-silver">Deposit</dt>
              <dd className="text-right text-white">{paiseToInr(deposit)}</dd>
            </>
          ) : null}
        </>
      )}
      {isNotice && bed.vacatingDate ? (
        <>
          <dt className="text-apg-silver">Opens</dt>
          <dd className="text-right text-white">{formatDate(bed.vacatingDate)}</dd>
        </>
      ) : null}
      {!isNotice && bookableFrom && !bed.isAvailableNow ? (
        <>
          <dt className="text-apg-silver">Available from</dt>
          <dd className="text-right text-white">{formatDate(bookableFrom)}</dd>
        </>
      ) : null}
    </dl>
  );
}

export function CustomerBedDetailSheet({
  bed,
  roomLabel,
  onClose,
  onBook,
  onPreBook,
  onReserve,
  onNoticeInterestUpdate,
}: {
  bed: BedSelectorBed;
  roomLabel: string;
  onClose: () => void;
  onBook: (options?: { shortStayOnly?: boolean; reserveCheckIn?: string }) => void;
  onPreBook: () => void;
  onReserve: () => void;
  onNoticeInterestUpdate?: (bedId: string, count: number) => void;
}) {
  const sheetRootId = useId().replace(/:/g, '');
  const [noticeCount, setNoticeCount] = useState(bed.noticeInterestCount ?? 0);

  useEffect(() => {
    setNoticeCount(bed.noticeInterestCount ?? 0);
  }, [bed.bedId, bed.noticeInterestCount]);

  const availability = bedAvailability({ ...bed, noticeInterestCount: noticeCount });
  const isNotice = availability.kind === 'notice';
  const isAvailable = availability.kind === 'open_now' || availability.kind === 'hold_interest';
  const isReserved = availability.kind === 'reserved';
  const reserveCheckIn = bed.activeBedReserveCheckIn ?? null;
  const reserveLastStay = reserveCheckIn ? reserveBufferDate(reserveCheckIn) : null;
  const bookableFrom = customerBookableFromDate(bed.nextAvailableDate);
  const isFuturePreBook = !bed.isAvailableNow && Boolean(bookableFrom) && !isNotice && !isReserved;
  const showBookActions = canBookBed(bed) && !isReserved;
  const showReserve = showBookActions && !bed.activeBedReserveCheckIn;
  const opensDate = isNotice ? bed.vacatingDate : isFuturePreBook ? bookableFrom : null;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    if (!isNotice && !isAvailable) return;
    void fetch(`/api/beds/${bed.bedId}/interest`, { method: 'POST' })
      .then((res) => res.json())
      .then((data: { ok?: boolean; totalInterest?: number }) => {
        if (data.ok && typeof data.totalInterest === 'number') {
          setNoticeCount(data.totalInterest);
          onNoticeInterestUpdate?.(bed.bedId, data.totalInterest);
        }
      })
      .catch(() => undefined);
  }, [bed.bedId, isNotice, isAvailable, onNoticeInterestUpdate]);

  return (
    <>
      <div
        className="fixed inset-0 z-[99950] flex items-end justify-center bg-black/60 p-4 sm:items-center"
        onClick={onClose}
        role="presentation"
      >
        <div
          id={sheetRootId}
          className="relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-white/10 bg-[#1A1F27] p-5 shadow-2xl"
          role="dialog"
          aria-modal
          data-roachie-tour="bed-detail-sheet"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-apg-orange">
                {roomLabel}
              </p>
              <h2 className="text-xl font-semibold text-white">Bed {bed.bedCode}</h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-2 py-1 text-apg-silver hover:bg-white/5 hover:text-white"
              aria-label="Close"
            >
              ✕
            </button>
          </div>

          <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
            <p className="text-sm font-semibold text-white">{availability.label}</p>
            {availability.sublabel ? (
              <p className="mt-1 text-xs text-apg-silver">{availability.sublabel}</p>
            ) : null}
            {isNotice || (isAvailable && noticeCount > 0) ? (
              <p className="mt-2 text-xs font-medium text-orange-200">
                {noticeCount > 0
                  ? `${noticeCount} ${noticeCount === 1 ? 'person is' : 'people are'} interested in this bed`
                  : isNotice
                    ? 'Someone is still living here — you can pre-book or reserve for when they leave.'
                    : null}
              </p>
            ) : null}
          </div>

          {isReserved && reserveCheckIn && reserveLastStay ? (
            <div className="mt-4 rounded-xl border border-violet-400/30 bg-violet-500/10 px-4 py-3 text-sm">
              <p className="font-semibold text-violet-100">Someone is holding this bed</p>
              <p className="mt-2 text-xs leading-relaxed text-apg-silver">
                They are <strong className="text-white">not living here yet</strong> — they paid to
                keep the bed until they move in on{' '}
                <strong className="text-white">{formatDate(reserveCheckIn)}</strong>.
              </p>
              <p className="mt-2 text-xs leading-relaxed text-apg-silver">
                Until then, you can book a <strong className="text-white">daily or weekly</strong>{' '}
                stay if you need the bed sooner. Your checkout must be on or before{' '}
                <strong className="text-white">{formatDate(reserveLastStay)}</strong> (one day is
                kept free for cleaning before the holder arrives).
              </p>
              <p className="mt-2 text-xs text-apg-silver">
                Monthly or open-ended move-in is not available on this bed right now.
              </p>
            </div>
          ) : null}

          {showBookActions ? (
            <BedPricingDetails bed={bed} isNotice={isNotice} />
          ) : isReserved ? (
            <BedPricingDetails bed={bed} isNotice={false} shortStayOnly />
          ) : (
            <p className="mt-4 text-sm text-apg-silver">
              {availability.kind === 'occupied'
                ? 'Someone is living here right now. Check back when the bed opens up.'
                : 'This bed is not available for booking at the moment.'}
            </p>
          )}

          {isReserved ? (
            <div className="mt-5 flex flex-col gap-2">
              <button
                type="button"
                onClick={() =>
                  onBook({ shortStayOnly: true, reserveCheckIn: reserveCheckIn ?? undefined })
                }
                className="w-full rounded-lg bg-apg-orange py-2.5 text-sm font-semibold text-white apg-glow-btn hover:brightness-110"
              >
                Book daily or weekly stay
              </button>
              <button
                type="button"
                onClick={onClose}
                className="w-full rounded-lg border border-white/15 py-2.5 text-sm font-semibold text-apg-silver hover:bg-white/5 hover:text-white"
              >
                Close
              </button>
            </div>
          ) : isNotice ? (
            <div className="mt-5 flex flex-col gap-2" data-roachie-tour="bed-sheet-actions">
              <button
                type="button"
                data-roachie-bed-action="pre-book"
                onClick={onPreBook}
                className="w-full rounded-lg bg-apg-orange py-2.5 text-sm font-semibold text-white apg-glow-btn hover:brightness-110"
              >
                Pre-book — check in when bed opens
              </button>
              {showReserve ? (
                <button
                  type="button"
                  data-roachie-bed-action="reserve"
                  onClick={onReserve}
                  className="w-full rounded-lg border border-apg-orange/40 bg-apg-orange/10 py-2.5 text-sm font-semibold text-white hover:bg-apg-orange/20"
                >
                  Reserve early (50% rent) — move in when you reach Nagpur
                </button>
              ) : null}
              <p className="text-xs leading-relaxed text-apg-silver">
                <strong className="text-white">Pre-book</strong> — you plan to move in when this bed
                opens{opensDate ? ` (${formatDate(opensDate)})` : ''}.{' '}
                <strong className="text-white">Reserve</strong> — hold the bed now at 50% rent and
                pick your check-in day when you reach Nagpur.
              </p>
            </div>
          ) : showBookActions ? (
            <div className="mt-5 flex flex-col gap-2" data-roachie-tour="bed-sheet-actions">
              {isFuturePreBook ? (
                <button
                  type="button"
                  data-roachie-bed-action="pre-book"
                  onClick={onPreBook}
                  className="w-full rounded-lg bg-sky-600 py-2.5 text-sm font-semibold text-white hover:bg-sky-500"
                >
                  Pre-book this bed
                </button>
              ) : (
                <button
                  type="button"
                  data-roachie-bed-action="book"
                  onClick={() => onBook()}
                  className="w-full rounded-lg bg-apg-orange py-2.5 text-sm font-semibold text-white apg-glow-btn hover:brightness-110"
                >
                  Choose stay &amp; reserve bed
                </button>
              )}
              {showReserve ? (
                <button
                  type="button"
                  data-roachie-bed-action="reserve"
                  onClick={onReserve}
                  className="w-full rounded-lg border border-apg-orange/40 bg-apg-orange/10 py-2.5 text-sm font-semibold text-white hover:bg-apg-orange/20"
                >
                  Reserve early (50% rent)
                </button>
              ) : null}
              {showReserve ? (
                <p className="text-xs leading-relaxed text-apg-silver">
                  {isFuturePreBook ? (
                    <>
                      <strong className="text-white">Pre-book</strong> — move in when the bed opens
                      {opensDate ? ` (${formatDate(opensDate)})` : ''}.{' '}
                      <strong className="text-white">Reserve</strong> — hold it now at 50% rent and
                      choose check-in when you arrive.
                    </>
                  ) : (
                    <>
                      <strong className="text-white">Book</strong> — move in on your selected dates
                      now. <strong className="text-white">Reserve</strong> — hold the bed at 50% rent
                      and pick your check-in day when you reach Nagpur.
                    </>
                  )}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}

export { CUSTOMER_BED_KIND_CLASS };
