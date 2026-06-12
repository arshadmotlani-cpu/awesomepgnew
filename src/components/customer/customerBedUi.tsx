'use client';

import { useEffect, useState } from 'react';
import {
  CUSTOMER_BED_KIND_CLASS,
  deriveCustomerBedAvailabilityView,
} from '@/src/lib/bedAvailabilityState';
import { customerBookableFromDate } from '@/src/lib/dates';
import { formatDate, paiseToInr } from '@/src/lib/format';
import type { BedSelectorBed } from './customerBedTypes';

function bedAvailability(bed: BedSelectorBed) {
  return deriveCustomerBedAvailabilityView({
    bedStatus: bed.status,
    isAvailableNow: bed.isAvailableNow,
    nextAvailableDate: bed.nextAvailableDate,
    vacatingDate: bed.vacatingDate,
    vacatingStatus: bed.vacatingStatus,
    reservedFrom: bed.reservedFrom,
    availableUntilDate: bed.availableUntilDate,
    noticeInterestCount: bed.noticeInterestCount,
    holdInterestCount: bed.interestCount,
  });
}

export function canBookBed(bed: BedSelectorBed): boolean {
  const bookableFrom = customerBookableFromDate(bed.nextAvailableDate);
  return (
    bed.status === 'available' &&
    (bed.isAvailableNow || Boolean(bookableFrom) || Boolean(bed.vacatingDate))
  );
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
  const kindClass = CUSTOMER_BED_KIND_CLASS[availability.kind];

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`relative flex min-h-[108px] w-full flex-col items-center justify-center rounded-xl border-2 px-2.5 py-3 text-center transition focus:outline-none focus-visible:ring-2 focus-visible:ring-apg-orange ${
        isSelected
          ? 'border-apg-orange ring-2 ring-apg-orange/35'
          : bookable || availability.kind === 'notice'
            ? kindClass
            : `${kindClass} opacity-80`
      }`}
    >
      <span className="text-sm font-bold uppercase tracking-wide text-white">{bed.bedCode}</span>
      <span className="mt-1.5 text-[11px] font-semibold leading-snug">{availability.label}</span>
      {availability.sublabel ? (
        <span className="mt-1 px-1 text-[10px] leading-snug opacity-90">{availability.sublabel}</span>
      ) : null}
    </button>
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
  onBook: () => void;
  onPreBook: () => void;
  onReserve: () => void;
  onNoticeInterestUpdate?: (bedId: string, count: number) => void;
}) {
  const [noticeCount, setNoticeCount] = useState(bed.noticeInterestCount ?? 0);

  useEffect(() => {
    setNoticeCount(bed.noticeInterestCount ?? 0);
  }, [bed.bedId, bed.noticeInterestCount]);

  const availability = bedAvailability({ ...bed, noticeInterestCount: noticeCount });
  const rate = bed.monthlyRatePaise;
  const deposit = bed.monthlySecurityDepositPaise || bed.securityDepositPaise;
  const isNotice = availability.kind === 'notice';
  const isFuture =
    !bed.isAvailableNow && Boolean(customerBookableFromDate(bed.nextAvailableDate));

  useEffect(() => {
    if (!isNotice) return;
    void fetch(`/api/beds/${bed.bedId}/interest`, { method: 'POST' })
      .then((res) => res.json())
      .then((data: { ok?: boolean; totalInterest?: number }) => {
        if (data.ok && typeof data.totalInterest === 'number') {
          setNoticeCount(data.totalInterest);
          onNoticeInterestUpdate?.(bed.bedId, data.totalInterest);
        }
      })
      .catch(() => undefined);
  }, [bed.bedId, isNotice, onNoticeInterestUpdate]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-white/10 bg-[#1A1F27] p-5 shadow-2xl"
        role="dialog"
        aria-modal
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
          {isNotice ? (
            <p className="mt-2 text-xs font-medium text-orange-200">
              {noticeCount > 0
                ? `${noticeCount} ${noticeCount === 1 ? 'person is' : 'people are'} interested in this bed`
                : 'Tap pre-book below to register your interest when this bed opens.'}
            </p>
          ) : null}
        </div>

        {canBookBed(bed) ? (
          <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
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
            {bed.vacatingDate ? (
              <>
                <dt className="text-apg-silver">Opens</dt>
                <dd className="text-right text-white">{formatDate(bed.vacatingDate)}</dd>
              </>
            ) : null}
            {customerBookableFromDate(bed.nextAvailableDate) && !bed.isAvailableNow ? (
              <>
                <dt className="text-apg-silver">From</dt>
                <dd className="text-right text-white">
                  {formatDate(customerBookableFromDate(bed.nextAvailableDate)!)}
                </dd>
              </>
            ) : null}
          </dl>
        ) : (
          <p className="mt-4 text-sm text-apg-silver">
            {availability.kind === 'occupied'
              ? 'Someone is living here right now. Check back when the bed opens up.'
              : 'This bed is not available for booking at the moment.'}
          </p>
        )}

        {canBookBed(bed) ? (
          <div className="mt-5 flex flex-col gap-2">
            {isFuture ? (
              <button
                type="button"
                onClick={onPreBook}
                className="w-full rounded-lg bg-sky-600 py-2.5 text-sm font-semibold text-white hover:bg-sky-500"
              >
                Pre-book this bed
              </button>
            ) : (
              <button
                type="button"
                onClick={onBook}
                className="w-full rounded-lg bg-apg-orange py-2.5 text-sm font-semibold text-white apg-glow-btn hover:brightness-110"
              >
                Book this bed
              </button>
            )}
            <button
              type="button"
              onClick={onReserve}
              className="w-full rounded-lg border border-apg-orange/40 bg-apg-orange/10 py-2.5 text-sm font-semibold text-white hover:bg-apg-orange/20"
            >
              Reserve early (50% rent)
            </button>
          </div>
        ) : isNotice ? (
          <div className="mt-5">
            <button
              type="button"
              onClick={onPreBook}
              className="w-full rounded-lg bg-apg-orange py-2.5 text-sm font-semibold text-white"
            >
              Pre-book for after they leave
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export { CUSTOMER_BED_KIND_CLASS };
