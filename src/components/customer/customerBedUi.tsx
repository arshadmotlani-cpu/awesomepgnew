'use client';

import { useEffect, useId, useState } from 'react';
import { MobileBottomSheet } from '@/src/components/customer/block/MobileBottomSheet';
import {
  CUSTOMER_BED_KIND_CLASS,
  deriveCustomerBedAvailabilityView,
  type BedAvailabilityKind,
} from '@/src/lib/bedAvailabilityState';
import { resolveBedOccupancy } from '@/src/lib/bedOccupancyResolve';
import { reserveBufferDate } from '@/src/lib/bedReservePolicy';
import { BOOK_THIS_BED, HOLD_THIS_BED } from '@/src/lib/booking/bookingFunnelLabels';
import { displayMonthlyDepositPaise } from '@/src/lib/customerDepositDisplay';
import { customerBookableFromDate } from '@/src/lib/dates';
import { formatDate, paiseToInr } from '@/src/lib/format';
import { formatCustomerDayMonth } from '@/src/lib/pgAvailabilityBadge';
import { bedAvailableCalendarDate } from '@/src/lib/vacating/vacatingBedSemantics';
import type { BedSelectorBed } from './customerBedTypes';
import { BedStateTile, type BedVisualState } from '@/src/components/customer/design-system';

/** Public billing-cycle copy — calendar month rent due on the 1st. */
export const PUBLIC_BED_BILLING_CYCLE_LABEL = 'Rent billed on the 1st of every month.';

function bedAvailability(bed: BedSelectorBed) {
  return deriveCustomerBedAvailabilityView({
    bedStatus: bed.status,
    isAvailableNow: bed.isAvailableNow,
    isOccupiedToday: bed.isOccupiedToday,
    manualOccupied: bed.manualOccupied,
    nextAvailableDate: bed.nextAvailableDate,
    vacatingDate: bed.vacatingDate,
    vacatingStatus: bed.vacatingStatus,
    reservedFrom: bed.reservedFrom,
    activeBedReserveCheckIn: bed.activeBedReserveCheckIn,
    availableUntilDate: bed.availableUntilDate,
    noticeInterestCount: bed.noticeInterestCount,
    holdInterestCount: bed.interestCount,
    transferHoldActive: bed.transferHoldActive,
    stayType: bed.stayType,
    durationMode: bed.durationMode,
    expectedCheckoutDate: bed.expectedCheckoutDate,
  });
}

export function canBookBed(bed: BedSelectorBed): boolean {
  return resolveBedOccupancy({
    bedId: bed.bedId,
    bedStatus: bed.status,
    isOccupiedToday: Boolean(bed.isOccupiedToday),
    manualOccupied: bed.manualOccupied,
    stayType: bed.stayType,
    durationMode: bed.durationMode,
    expectedCheckoutDate: bed.expectedCheckoutDate,
    stayUpper: bed.nextAvailableDate,
    vacatingDate: bed.vacatingDate,
    vacatingStatus: bed.vacatingStatus,
    activeBedReserveCheckIn: bed.activeBedReserveCheckIn,
    reservedFrom: bed.reservedFrom,
    noticeInterestCount: bed.noticeInterestCount,
    holdInterestCount: bed.interestCount,
    transferHoldActive: bed.transferHoldActive,
    availableUntilDate: bed.availableUntilDate,
  }).isBookable;
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
    case 'maintenance':
      return 'maintenance';
    default:
      return 'occupied';
  }
}

/** Compact status chip title for the universal bed details popup. */
export function publicBedStatusTitle(kind: BedAvailabilityKind): string {
  switch (kind) {
    case 'open_now':
    case 'hold_interest':
      return 'AVAILABLE NOW';
    case 'pre_bookable':
      return 'AVAILABLE SOON';
    case 'notice':
      return 'ON NOTICE';
    case 'maintenance':
      return 'MAINTENANCE';
    case 'reserved':
    case 'booked':
      return 'RESERVED';
    case 'occupied':
    case 'under_review':
    case 'blocked':
    default:
      return 'OCCUPIED';
  }
}

function unavailableMessage(input: {
  kind: BedAvailabilityKind;
  opensDateLabel: string | null;
}): string {
  if (input.kind === 'notice') {
    return input.opensDateLabel
      ? `Available from ${input.opensDateLabel}.`
      : 'Not available for booking while on notice.';
  }
  if (input.kind === 'maintenance') return 'Not currently available.';
  if (input.kind === 'reserved' || input.kind === 'booked') {
    return 'Currently reserved.';
  }
  if (input.kind === 'occupied') {
    return 'Not available for booking while occupied.';
  }
  return 'Not available for booking at the moment.';
}

const CTA_ENABLED =
  'w-full rounded-lg bg-apg-orange py-2.5 text-sm font-semibold text-white apg-glow-btn hover:brightness-110';
const CTA_SECONDARY_ENABLED =
  'w-full rounded-lg border border-apg-orange/40 bg-apg-orange/10 py-2.5 text-sm font-semibold text-white hover:bg-apg-orange/20';
const CTA_DISABLED =
  'w-full cursor-not-allowed rounded-lg bg-white/5 py-2.5 text-sm font-semibold text-apg-silver/50';
const CTA_SECONDARY_DISABLED =
  'w-full cursor-not-allowed rounded-lg border border-white/10 bg-transparent py-2.5 text-sm font-semibold text-apg-silver/40';

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
  const state = visualStateForKind(availability.kind, isSelected);

  return (
    <BedStateTile
      bedCode={bed.bedCode}
      label={availability.label}
      sublabel={availability.sublabel}
      state={state}
      selected={isSelected}
      // Every bed stays clickable — bookability only gates popup CTAs.
      disabled={false}
      onSelect={onSelect}
    />
  );
}

export function CustomerBedDetailSheet({
  bed,
  roomLabel,
  pgName,
  onClose,
  onBook,
  onPreBook,
  onReserve,
  onNoticeInterestUpdate,
  presentation = 'center',
}: {
  bed: BedSelectorBed;
  roomLabel: string;
  /** Optional PG name shown above room/bed context. */
  pgName?: string;
  onClose: () => void;
  onBook: (options?: { shortStayOnly?: boolean; reserveCheckIn?: string }) => void;
  onPreBook: () => void;
  onReserve: () => void;
  onNoticeInterestUpdate?: (bedId: string, count: number) => void;
  presentation?: 'center' | 'bottomSheet';
}) {
  const sheetRootId = useId().replace(/:/g, '');
  const titleId = `${sheetRootId}-title`;
  const [noticeCount, setNoticeCount] = useState(bed.noticeInterestCount ?? 0);

  useEffect(() => {
    setNoticeCount(bed.noticeInterestCount ?? 0);
  }, [bed.bedId, bed.noticeInterestCount]);

  const availability = bedAvailability({ ...bed, noticeInterestCount: noticeCount });
  const statusTitle = publicBedStatusTitle(availability.kind);
  const isMaintenance = availability.kind === 'maintenance';
  const isNotice = availability.kind === 'notice';
  const isAvailable = availability.kind === 'open_now' || availability.kind === 'hold_interest';
  const isReserved = availability.kind === 'reserved';
  const reserveCheckIn = bed.activeBedReserveCheckIn ?? null;
  const reserveLastStay = reserveCheckIn ? reserveBufferDate(reserveCheckIn) : null;
  const bookableFrom = customerBookableFromDate(bed.nextAvailableDate);
  const isFuturePreBook = !bed.isAvailableNow && Boolean(bookableFrom) && !isNotice && !isReserved;
  const bookable = canBookBed(bed);
  /** Standard Book / Hold (50%) — only when SSOT says bookable and not a reserve short-stay-only case. */
  const showEnabledBookHold = bookable && !isReserved;
  const showReserve = showEnabledBookHold && !bed.activeBedReserveCheckIn;
  const opensDate = isNotice
    ? bed.vacatingDate
      ? bedAvailableCalendarDate(bed.vacatingDate)
      : null
    : isFuturePreBook
      ? bookableFrom
      : null;
  const opensDateLabel = opensDate ? formatCustomerDayMonth(opensDate) : null;
  const monthlyDepositPaise = displayMonthlyDepositPaise(bed);

  useEffect(() => {
    if (presentation === 'bottomSheet') return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, presentation]);

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

  const statusTone =
    availability.kind === 'open_now'
      ? 'border-emerald-400/40 bg-emerald-500/10'
      : isMaintenance
        ? 'border-red-400/40 bg-red-500/10'
        : isNotice
          ? 'border-orange-400/40 bg-orange-500/10'
          : isReserved
            ? 'border-violet-400/40 bg-violet-500/10'
            : 'border-white/10 bg-white/[0.03]';

  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div>
          {pgName ? (
            <p className="text-[11px] font-medium uppercase tracking-wider text-apg-muted">
              {pgName}
            </p>
          ) : null}
          <p
            className={`text-[11px] font-medium uppercase tracking-wider text-apg-muted ${pgName ? 'mt-0.5' : ''}`}
          >
            {roomLabel}
          </p>
          <h2 id={titleId} className="text-lg font-semibold text-white">
            Bed {bed.bedCode}
          </h2>
        </div>
        {presentation === 'center' ? (
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-apg-silver hover:bg-white/5 hover:text-white"
            aria-label="Close"
          >
            ✕
          </button>
        ) : null}
      </div>

      <div className={`mt-4 rounded-[14px] border px-4 py-3 ${statusTone}`}>
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white">
          {statusTitle}
        </p>
        <p className="mt-1 text-sm font-semibold text-white">{availability.label}</p>
        {availability.sublabel ? (
          <p className="mt-1 text-xs text-apg-silver">{availability.sublabel}</p>
        ) : null}
        {opensDateLabel ? (
          <p className="mt-2 text-xs font-medium text-orange-200">
            Available from: {opensDateLabel}
          </p>
        ) : null}
        {isNotice && noticeCount > 0 ? (
          <p className="mt-2 text-xs font-medium text-orange-200">
            {noticeCount} {noticeCount === 1 ? 'person is' : 'people are'} interested in this bed
          </p>
        ) : null}
      </div>

      <div
        className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm"
        data-roachie-tour="bed-sheet-pricing"
      >
        <dl className="space-y-2">
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-apg-silver">Monthly rent</dt>
            <dd className="font-semibold text-white">{paiseToInr(bed.monthlyRatePaise)}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-apg-silver">Security deposit</dt>
            <dd className="font-semibold text-white">{paiseToInr(monthlyDepositPaise)}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-apg-silver">Billing</dt>
            <dd className="text-right text-xs font-medium text-white sm:text-sm">
              {PUBLIC_BED_BILLING_CYCLE_LABEL}
            </dd>
          </div>
        </dl>
      </div>

      {isReserved && reserveCheckIn && reserveLastStay ? (
        <div className="mt-4 rounded-xl border border-violet-400/30 bg-violet-500/10 px-4 py-3 text-sm">
          <p className="font-semibold text-violet-100">Currently reserved</p>
          <p className="mt-2 text-xs leading-relaxed text-apg-silver">
            Someone is holding this bed until they move in on{' '}
            <strong className="text-white">{formatDate(reserveCheckIn)}</strong>. Until then, a
            fixed-date stay may still be possible if your checkout is on or before{' '}
            <strong className="text-white">{formatDate(reserveLastStay)}</strong>.
          </p>
        </div>
      ) : null}

      {isReserved && reserveCheckIn ? (
        <div className="mt-5 flex flex-col gap-2" data-roachie-tour="bed-sheet-actions">
          <button
            type="button"
            data-roachie-bed-action="book-short-stay"
            onClick={() =>
              onBook({ shortStayOnly: true, reserveCheckIn: reserveCheckIn ?? undefined })
            }
            className={CTA_ENABLED}
          >
            Book fixed-date stay
          </button>
          <button type="button" disabled aria-disabled className={CTA_DISABLED}>
            {BOOK_THIS_BED}
          </button>
          <button type="button" disabled aria-disabled className={CTA_SECONDARY_DISABLED}>
            {HOLD_THIS_BED} — 50% rent
          </button>
          <p className="text-xs leading-relaxed text-apg-silver">
            Monthly Book / Hold are unavailable while this bed is reserved.
          </p>
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
          <button type="button" disabled aria-disabled className={CTA_DISABLED}>
            {BOOK_THIS_BED}
          </button>
          <button
            type="button"
            data-roachie-bed-action="pre-book"
            onClick={onPreBook}
            className={CTA_ENABLED}
          >
            {HOLD_THIS_BED}
          </button>
          {showReserve ? (
            <button
              type="button"
              data-roachie-bed-action="reserve"
              onClick={onReserve}
              className={CTA_SECONDARY_ENABLED}
            >
              {HOLD_THIS_BED} — 50% rent
            </button>
          ) : (
            <button type="button" disabled aria-disabled className={CTA_SECONDARY_DISABLED}>
              {HOLD_THIS_BED} — 50% rent
            </button>
          )}
          <p className="text-xs leading-relaxed text-apg-silver">
            {opensDateLabel
              ? `Available from ${opensDateLabel}. ${HOLD_THIS_BED} plans your move-in when this bed opens.`
              : `${HOLD_THIS_BED} plans your move-in when this bed opens.`}
          </p>
        </div>
      ) : showEnabledBookHold ? (
        <div className="mt-5 flex flex-col gap-2" data-roachie-tour="bed-sheet-actions">
          {isFuturePreBook ? (
            <button
              type="button"
              data-roachie-bed-action="pre-book"
              onClick={onPreBook}
              className="w-full rounded-lg bg-sky-600 py-2.5 text-sm font-semibold text-white hover:bg-sky-500"
            >
              {HOLD_THIS_BED}
            </button>
          ) : (
            <button
              type="button"
              data-roachie-bed-action="book"
              onClick={() => onBook()}
              className={CTA_ENABLED}
            >
              {BOOK_THIS_BED}
            </button>
          )}
          {showReserve ? (
            <button
              type="button"
              data-roachie-bed-action="reserve"
              onClick={onReserve}
              className={CTA_SECONDARY_ENABLED}
            >
              {HOLD_THIS_BED} — 50% rent
            </button>
          ) : null}
          <p className="text-xs leading-relaxed text-apg-silver">
            {isFuturePreBook ? (
              <>
                <strong className="text-white">{HOLD_THIS_BED}</strong> — move in when the bed opens
                {opensDateLabel ? ` (${opensDateLabel})` : ''}. Pay 50% rent to secure it sooner.
              </>
            ) : (
              <>
                <strong className="text-white">{BOOK_THIS_BED}</strong> — move in on your selected
                dates. <strong className="text-white">{HOLD_THIS_BED}</strong> — pay 50% rent now and
                pick check-in when you arrive.
              </>
            )}
          </p>
        </div>
      ) : (
        <div className="mt-5 flex flex-col gap-2" data-roachie-tour="bed-sheet-actions">
          <button type="button" disabled aria-disabled className={CTA_DISABLED}>
            {BOOK_THIS_BED}
          </button>
          <button type="button" disabled aria-disabled className={CTA_SECONDARY_DISABLED}>
            {HOLD_THIS_BED} — 50% rent
          </button>
          <p className="text-xs leading-relaxed text-apg-silver">
            {unavailableMessage({ kind: availability.kind, opensDateLabel })}
          </p>
        </div>
      )}
    </>
  );

  if (presentation === 'bottomSheet') {
    return (
      <MobileBottomSheet open onClose={onClose} ariaLabelledBy={titleId}>
        <div
          id={sheetRootId}
          className="max-h-[calc(min(88vh,100dvh)-2.5rem)] overflow-y-auto overscroll-contain px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-0 sm:max-h-[min(80vh,640px)]"
          data-roachie-tour="bed-detail-sheet"
        >
          {body}
        </div>
      </MobileBottomSheet>
    );
  }

  return (
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
        aria-labelledby={titleId}
        data-roachie-tour="bed-detail-sheet"
        onClick={(e) => e.stopPropagation()}
      >
        {body}
      </div>
    </div>
  );
}

export { CUSTOMER_BED_KIND_CLASS };
