'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { LAYER_Z } from '@/src/lib/ui/layerZIndex';
import {
  addDays,
  addMonths,
  diffDays,
  formatDate,
  parseDate,
  todayString,
} from '@/src/lib/dates';
import type { FreeWindow } from '@/src/lib/bedAvailabilityWindows';
import {
  isCheckInAvailableForReservations,
  isCheckOutAvailableForReservations,
  type ReservationSpan,
} from '@/src/lib/bedStayOverlap';
import { formatDate as formatDisplayDate, formatDateDdMmYyyy, paiseToInr } from '@/src/lib/format';
import {
  classifyDayAvailability,
  isInStayRange,
  pickStayRange,
} from '@/src/lib/stayDateSelection';

type Theme = 'dark' | 'light';

export type StayDateSummary = {
  nights: number;
  dailyRatePaise: number;
  accommodationPaise: number;
  depositPaise: number;
  totalDuePaise: number;
};

type Props = {
  theme?: Theme;
  checkIn: string;
  checkOut: string | null;
  onCheckInChange: (date: string) => void;
  onCheckOutChange: (date: string) => void;
  minCheckIn?: string;
  maxCheckOut?: string;
  showCheckOut?: boolean;
  disabled?: boolean;
  /** @deprecated Use futureReservations + horizonEnd */
  freeWindows?: FreeWindow[];
  horizonEnd?: string;
  reservationsByBed?: ReservationSpan[][];
  futureReservations?: ReservationSpan[];
  summary?: StayDateSummary | null;
  holdMinutes?: number;
};

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function monthStart(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function calendarCells(year: number, month: number): Array<{ date: string | null; day: number }> {
  const first = new Date(Date.UTC(year, month, 1));
  const startPad = first.getUTCDay();
  const total = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const cells: Array<{ date: string | null; day: number }> = [];
  for (let i = 0; i < startPad; i += 1) cells.push({ date: null, day: 0 });
  for (let d = 1; d <= total; d += 1) {
    cells.push({
      date: formatDate(new Date(Date.UTC(year, month, d))),
      day: d,
    });
  }
  return cells;
}

function MonthGrid({
  year,
  month,
  theme,
  draftStart,
  draftEnd,
  hoverDate,
  earliestCheckIn,
  freeWindows: _freeWindows,
  futureReservations,
  horizonEnd: effectiveHorizon,
  reservationsByBed,
  onPick,
  onHover,
}: {
  year: number;
  month: number;
  theme: Theme;
  draftStart: string | null;
  draftEnd: string | null;
  hoverDate: string | null;
  earliestCheckIn: string;
  freeWindows: FreeWindow[];
  futureReservations: ReservationSpan[];
  horizonEnd: string;
  reservationsByBed?: ReservationSpan[][];
  onPick: (date: string) => void;
  onHover: (date: string | null) => void;
}) {
  const bedSets = reservationsByBed?.length ? reservationsByBed : [futureReservations];
  const dark = theme === 'dark';
  const cells = calendarCells(year, month);
  const monthLabel = new Date(Date.UTC(year, month, 1)).toLocaleString('en-IN', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

  return (
    <div className="min-w-[280px] flex-1">
      <p
        className={`mb-3 text-center text-sm font-semibold ${dark ? 'text-white' : 'text-zinc-900'}`}
      >
        {monthLabel}
      </p>
      <div className="mb-1 grid grid-cols-7 gap-0.5 text-center text-[10px] font-semibold uppercase tracking-wide">
        {WEEKDAYS.map((w) => (
          <span key={w} className={dark ? 'text-apg-silver/80' : 'text-zinc-400'}>
            {w}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((cell, idx) => {
          if (!cell.date) {
            return <span key={`pad-${idx}`} className="h-11" />;
          }
          const date = cell.date;

          const availability = classifyDayAvailability(date, {
            earliestCheckIn,
            futureReservations,
            selectedCheckIn: draftStart,
            horizonEnd: effectiveHorizon,
          });

          const rangePos = isInStayRange(
            date,
            draftStart,
            draftEnd,
            !draftEnd ? hoverDate : null,
          );

          const canPickStart = bedSets.every((res) =>
            isCheckInAvailableForReservations(date, res, earliestCheckIn),
          );
          const canPickEnd =
            draftStart != null &&
            bedSets.every((res) =>
              isCheckOutAvailableForReservations(
                date,
                draftStart,
                res,
                effectiveHorizon,
              ),
            );
          const disabled = !canPickStart && !canPickEnd;

          const isStart = rangePos === 'start';
          const isEnd = rangePos === 'end';
          const inBand = rangePos === 'middle' || rangePos === 'hover-middle';

          let cellBg = '';
          if (isStart || isEnd) {
            cellBg = 'bg-apg-orange text-white shadow-md z-[2]';
          } else if (inBand) {
            cellBg = dark
              ? 'bg-apg-orange/25 text-white'
              : 'bg-orange-100 text-orange-950';
          } else if (availability === 'reserved') {
            cellBg = dark
              ? 'bg-rose-500/15 text-rose-300/90 line-through decoration-rose-400/60'
              : 'bg-rose-50 text-rose-400 line-through';
          } else if (availability === 'checkout-limit') {
            cellBg = dark
              ? 'ring-1 ring-inset ring-amber-400/50 text-amber-100'
              : 'ring-1 ring-inset ring-amber-400 text-amber-900';
          } else if (disabled) {
            cellBg = dark ? 'text-white/15' : 'text-zinc-300';
          } else {
            cellBg = dark
              ? 'text-white hover:bg-white/10'
              : 'text-zinc-800 hover:bg-zinc-100';
          }

          return (
            <div
              key={date}
              className={`relative flex h-11 items-center justify-center ${
                inBand && !isStart && !isEnd
                  ? dark
                    ? 'before:absolute before:inset-y-1 before:inset-x-0 before:-z-0 before:bg-apg-orange/20'
                    : 'before:absolute before:inset-y-1 before:inset-x-0 before:-z-0 before:bg-orange-100'
                  : ''
              }`}
            >
              <button
                type="button"
                disabled={disabled}
                onClick={() => onPick(date)}
                onMouseEnter={() => onHover(date)}
                onMouseLeave={() => onHover(null)}
                className={`relative z-[1] flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold transition-all ${cellBg} ${
                  disabled ? 'cursor-not-allowed' : 'cursor-pointer'
                }`}
                aria-label={date}
                aria-pressed={isStart || isEnd}
              >
                {cell.day}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AvailabilityLegend({ theme }: { theme: Theme }) {
  const dark = theme === 'dark';
  const item = (dot: string, label: string) => (
    <span className={`inline-flex items-center gap-1.5 text-[11px] ${dark ? 'text-apg-silver' : 'text-zinc-600'}`}>
      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${dot}`} />
      {label}
    </span>
  );
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5 px-1 pt-2">
      {item('bg-apg-orange', 'Selected')}
      {item(dark ? 'bg-white/20' : 'bg-zinc-200', 'Unavailable')}
      {item('bg-rose-500/40', 'Reserved')}
      {item('ring-2 ring-amber-400/80 ring-inset bg-transparent', 'Last available night')}
    </div>
  );
}

function TrustRow({ theme, holdMinutes }: { theme: Theme; holdMinutes: number }) {
  const dark = theme === 'dark';
  const cls = `flex items-start gap-2 text-xs ${dark ? 'text-emerald-200/90' : 'text-emerald-800'}`;
  return (
    <ul className="space-y-1.5">
      <li className={cls}>
        <span aria-hidden>✓</span>
        <span>Bed available for your selected dates</span>
      </li>
      <li className={cls}>
        <span aria-hidden>✓</span>
        <span>Lowest available rate applied automatically</span>
      </li>
      <li className={cls}>
        <span aria-hidden>✓</span>
        <span>Selection held for {holdMinutes} minutes at checkout</span>
      </li>
    </ul>
  );
}

function SummaryCard({
  theme,
  checkIn,
  checkOut,
  summary,
}: {
  theme: Theme;
  checkIn: string;
  checkOut: string | null;
  summary: StayDateSummary | null | undefined;
}) {
  const dark = theme === 'dark';
  const nights =
    checkOut && checkIn && checkOut > checkIn
      ? diffDays(parseDate(checkIn), parseDate(checkOut))
      : 0;

  const shell = dark
    ? 'rounded-xl border border-white/10 bg-white/5 p-4'
    : 'rounded-xl border border-zinc-200 bg-zinc-50 p-4';

  return (
    <div className={shell}>
      <p className={`text-xs font-semibold uppercase tracking-wide ${dark ? 'text-apg-silver' : 'text-zinc-500'}`}>
        Stay summary
      </p>
      <div className={`mt-3 space-y-2 text-sm ${dark ? 'text-white' : 'text-zinc-900'}`}>
        <div className="flex justify-between gap-4">
          <span className={dark ? 'text-apg-silver' : 'text-zinc-600'}>Check-in</span>
          <span className="font-medium">{formatDisplayDate(checkIn)}</span>
        </div>
        {checkOut ? (
          <div className="flex justify-between gap-4">
            <span className={dark ? 'text-apg-silver' : 'text-zinc-600'}>Check-out</span>
            <span className="font-medium">{formatDisplayDate(checkOut)}</span>
          </div>
        ) : null}
        {nights > 0 ? (
          <div className="flex justify-between gap-4">
            <span className={dark ? 'text-apg-silver' : 'text-zinc-600'}>Duration</span>
            <span className="font-semibold">
              {nights} night{nights === 1 ? '' : 's'}
            </span>
          </div>
        ) : null}
        {summary && nights > 0 ? (
          <>
            <div className={`my-2 border-t ${dark ? 'border-white/10' : 'border-zinc-200'}`} />
            <div className="flex justify-between gap-4 text-xs">
              <span className={dark ? 'text-apg-silver' : 'text-zinc-600'}>
                Rate · {paiseToInr(summary.dailyRatePaise)}/day
              </span>
              <span>{paiseToInr(summary.accommodationPaise)}</span>
            </div>
            <div className="flex justify-between gap-4 text-xs">
              <span className={dark ? 'text-apg-silver' : 'text-zinc-600'}>Deposit (est.)</span>
              <span>{paiseToInr(summary.depositPaise)}</span>
            </div>
            <div className="flex justify-between gap-4 font-semibold">
              <span>Total due (est.)</span>
              <span className="text-apg-orange">{paiseToInr(summary.totalDuePaise)}</span>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Premium range-first stay date selector — single field, no Done button,
 * Airbnb-style two-click range selection.
 */
export function StayDateRangePicker({
  theme = 'dark',
  checkIn,
  checkOut,
  onCheckInChange,
  onCheckOutChange,
  minCheckIn,
  maxCheckOut: _maxCheckOut,
  showCheckOut = true,
  disabled = false,
  freeWindows: _freeWindows = [],
  horizonEnd,
  reservationsByBed,
  futureReservations = [],
  summary = null,
  holdMinutes = 15,
}: Props) {
  const dark = theme === 'dark';
  const [open, setOpen] = useState(false);
  const [portalReady, setPortalReady] = useState(false);
  const [draftStart, setDraftStart] = useState<string | null>(checkIn);
  const [draftEnd, setDraftEnd] = useState<string | null>(checkOut);
  const [hoverDate, setHoverDate] = useState<string | null>(null);
  const [viewMonth, setViewMonth] = useState(() => monthStart(parseDate(checkIn || todayString())));
  const wasOpenRef = useRef(false);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  const earliestCheckIn = minCheckIn ?? todayString();
  const effectiveHorizon =
    horizonEnd ?? formatDate(addDays(parseDate(earliestCheckIn), 365));
  const bedReservationSets = useMemo(
    () => (reservationsByBed?.length ? reservationsByBed : [futureReservations]),
    [reservationsByBed, futureReservations],
  );

  // Only reset draft when modal opens — NOT when parent checkIn changes during selection.
  useEffect(() => {
    if (open && !wasOpenRef.current) {
      setDraftStart(checkIn || null);
      setDraftEnd(showCheckOut ? checkOut : null);
      setViewMonth(monthStart(parseDate(checkIn || todayString())));
      setHoverDate(null);
    }
    wasOpenRef.current = open;
  }, [open, checkIn, checkOut, showCheckOut]);

  const nextMonth = useMemo(() => addMonths(viewMonth, 1), [viewMonth]);

  const nights =
    showCheckOut && draftEnd && draftStart && draftEnd > draftStart
      ? diffDays(parseDate(draftStart), parseDate(draftEnd))
      : showCheckOut && checkOut && checkIn > '' && checkOut > checkIn
        ? diffDays(parseDate(checkIn), parseDate(checkOut))
        : 0;

  const displayStart = open ? draftStart ?? checkIn : checkIn;
  const displayEnd = open ? draftEnd ?? checkOut : checkOut;

  const canSelect = useCallback(
    (date: string, phase: 'start' | 'end') => {
      if (phase === 'start') {
        return bedReservationSets.every((res) =>
          isCheckInAvailableForReservations(date, res, earliestCheckIn),
        );
      }
      if (!draftStart) return false;
      return bedReservationSets.every((res) =>
        isCheckOutAvailableForReservations(date, draftStart, res, effectiveHorizon),
      );
    },
    [draftStart, earliestCheckIn, bedReservationSets, effectiveHorizon],
  );

  const commitRange = useCallback(
    (start: string, end: string | null) => {
      onCheckInChange(start);
      if (showCheckOut && end) {
        onCheckOutChange(end);
      }
    },
    [onCheckInChange, onCheckOutChange, showCheckOut],
  );

  const onPick = useCallback(
    (date: string) => {
      if (!showCheckOut) {
        if (
          !bedReservationSets.every((res) =>
            isCheckInAvailableForReservations(date, res, earliestCheckIn),
          )
        ) {
          return;
        }
        commitRange(date, null);
        setOpen(false);
        return;
      }

      const result = pickStayRange(
        { start: draftStart, end: draftEnd },
        date,
        canSelect,
      );
      if (!result) return;

      setDraftStart(result.draft.start);
      setDraftEnd(result.draft.end);
      setHoverDate(null);

      if (result.complete && result.draft.start && result.draft.end) {
        commitRange(result.draft.start, result.draft.end);
        setOpen(false);
      }
    },
    [
      showCheckOut,
      draftStart,
      draftEnd,
      canSelect,
      commitRange,
      earliestCheckIn,
      bedReservationSets,
      effectiveHorizon,
    ],
  );

  const triggerShell = dark
    ? 'flex w-full items-center gap-2 rounded-2xl border border-white/15 bg-white/5 transition hover:border-apg-orange/50 hover:bg-white/[0.08] focus-within:ring-2 focus-within:ring-apg-orange/40 disabled:opacity-50'
    : 'flex w-full items-center gap-2 rounded-2xl border border-zinc-200 bg-white shadow-sm transition hover:border-orange-300 focus-within:ring-2 focus-within:ring-orange-400/30 disabled:opacity-50';
  const triggerMain = dark
    ? 'flex min-h-[44px] min-w-0 flex-1 items-center gap-4 px-4 py-3 text-left focus:outline-none disabled:cursor-not-allowed'
    : 'flex min-h-[44px] min-w-0 flex-1 items-center gap-4 px-4 py-3 text-left focus:outline-none disabled:cursor-not-allowed';
  const editBtn = dark
    ? 'mr-2 flex h-11 min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl border border-white/15 px-3 text-sm font-semibold text-apg-silver hover:border-apg-orange/40 hover:bg-white/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-apg-orange/40 disabled:cursor-not-allowed disabled:opacity-50'
    : 'mr-2 flex h-11 min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl border border-zinc-200 px-3 text-sm font-semibold text-zinc-600 hover:border-orange-300 hover:bg-orange-50 focus:outline-none focus:ring-2 focus:ring-orange-400/30 disabled:cursor-not-allowed disabled:opacity-50';

  const modalShell = dark
    ? 'flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-white/10 bg-[#12151c] shadow-2xl sm:max-h-[90vh] sm:max-w-[720px] sm:rounded-2xl'
    : 'flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-zinc-200 bg-white shadow-2xl sm:max-h-[90vh] sm:max-w-[720px] sm:rounded-2xl';

  const phaseHint = !showCheckOut
    ? 'Choose your move-in date'
    : !draftStart
      ? 'Choose check-in'
      : !draftEnd
        ? 'Choose check-out'
        : `${nights} night${nights === 1 ? '' : 's'} selected`;

  return (
    <>
      <div className={triggerShell}>
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen(true)}
          className={triggerMain}
          aria-label="Select stay dates"
          aria-haspopup="dialog"
          aria-expanded={open}
        >
          <span
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${
              dark ? 'bg-apg-orange/15 text-apg-orange' : 'bg-orange-50 text-orange-600'
            }`}
          >
            <CalendarIcon />
          </span>
          <span className="min-w-0 flex-1">
            <span className={`block text-[10px] font-bold uppercase tracking-wider ${dark ? 'text-apg-silver' : 'text-zinc-500'}`}>
              {showCheckOut ? 'Stay dates' : 'Move-in date'}
            </span>
            <span className={`mt-0.5 block truncate text-base font-semibold ${dark ? 'text-white' : 'text-zinc-900'}`}>
              {showCheckOut ? (
                displayEnd && displayStart ? (
                  <>
                    {formatDateDdMmYyyy(displayStart)} → {formatDateDdMmYyyy(displayEnd)}
                  </>
                ) : displayStart ? (
                  formatDateDdMmYyyy(displayStart)
                ) : (
                  'Select your stay'
                )
              ) : displayStart ? (
                formatDateDdMmYyyy(displayStart)
              ) : (
                'Select move-in date'
              )}
            </span>
            {showCheckOut && nights > 0 ? (
              <span className={`mt-0.5 block text-xs font-medium ${dark ? 'text-apg-orange' : 'text-orange-600'}`}>
                {nights} night{nights === 1 ? '' : 's'}
              </span>
            ) : null}
          </span>
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen(true)}
          className={editBtn}
          aria-label="Edit stay dates"
        >
          Edit
        </button>
      </div>

      {portalReady && open
        ? createPortal(
            <div
              className="fixed inset-0 flex flex-col justify-end bg-black/75 sm:items-center sm:justify-center sm:p-4"
              style={{ zIndex: LAYER_Z.nestedOverlay }}
              role="dialog"
              aria-modal="true"
              aria-label="Choose stay dates"
              onClick={() => setOpen(false)}
            >
              <div
                className={modalShell}
                style={{ zIndex: LAYER_Z.nestedDialog, position: 'relative' }}
                onClick={(e) => e.stopPropagation()}
              >
                {/* Header */}
                <div className={`shrink-0 border-b px-4 py-4 sm:px-6 ${dark ? 'border-white/10' : 'border-zinc-200'}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className={`text-lg font-semibold ${dark ? 'text-white' : 'text-zinc-900'}`}>
                        {showCheckOut ? 'When are you staying?' : 'When do you move in?'}
                      </p>
                      <p className={`mt-0.5 text-sm ${dark ? 'text-apg-silver' : 'text-zinc-500'}`}>
                        {phaseHint}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setOpen(false)}
                      className={`rounded-full p-2 ${dark ? 'text-apg-silver hover:bg-white/10 hover:text-white' : 'text-zinc-500 hover:bg-zinc-100'}`}
                      aria-label="Close"
                    >
                      ✕
                    </button>
                  </div>
                  {showCheckOut && draftStart ? (
                    <p className={`mt-2 text-xs ${dark ? 'text-apg-silver/80' : 'text-zinc-500'}`}>
                      {draftEnd
                        ? `${formatDateDdMmYyyy(draftStart)} → ${formatDateDdMmYyyy(draftEnd)}`
                        : `Check-in ${formatDateDdMmYyyy(draftStart)} — now pick check-out`}
                    </p>
                  ) : null}
                </div>

                {/* Calendar */}
                <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
                  <div className="mb-3 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => setViewMonth(addMonths(viewMonth, -1))}
                      className={`rounded-full px-3 py-1.5 text-lg ${dark ? 'text-white hover:bg-white/10' : 'hover:bg-zinc-100'}`}
                      aria-label="Previous month"
                    >
                      ‹
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewMonth(addMonths(viewMonth, 1))}
                      className={`rounded-full px-3 py-1.5 text-lg ${dark ? 'text-white hover:bg-white/10' : 'hover:bg-zinc-100'}`}
                      aria-label="Next month"
                    >
                      ›
                    </button>
                  </div>
                  <div className="flex flex-col gap-8 lg:flex-row lg:justify-center">
                    <MonthGrid
                      year={viewMonth.getUTCFullYear()}
                      month={viewMonth.getUTCMonth()}
                      theme={theme}
                      draftStart={draftStart}
                      draftEnd={draftEnd}
                      hoverDate={hoverDate}
                      earliestCheckIn={earliestCheckIn}
                      freeWindows={_freeWindows}
                      futureReservations={futureReservations}
                      horizonEnd={effectiveHorizon}
                      reservationsByBed={reservationsByBed}
                      onPick={onPick}
                      onHover={setHoverDate}
                    />
                    <MonthGrid
                      year={nextMonth.getUTCFullYear()}
                      month={nextMonth.getUTCMonth()}
                      theme={theme}
                      draftStart={draftStart}
                      draftEnd={draftEnd}
                      hoverDate={hoverDate}
                      earliestCheckIn={earliestCheckIn}
                      freeWindows={_freeWindows}
                      futureReservations={futureReservations}
                      horizonEnd={effectiveHorizon}
                      reservationsByBed={reservationsByBed}
                      onPick={onPick}
                      onHover={setHoverDate}
                    />
                  </div>
                  <AvailabilityLegend theme={theme} />
                </div>

                {/* Sticky footer: summary + trust */}
                <div
                  className={`shrink-0 space-y-3 border-t px-4 py-4 sm:px-6 ${dark ? 'border-white/10 bg-[#12151c]/95' : 'border-zinc-200 bg-white/95'}`}
                >
                  <SummaryCard
                    theme={theme}
                    checkIn={draftStart ?? checkIn}
                    checkOut={draftEnd ?? checkOut}
                    summary={summary}
                  />
                  {showCheckOut && draftStart && (draftEnd || nights > 0) ? (
                    <TrustRow theme={theme} holdMinutes={holdMinutes} />
                  ) : null}
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

function CalendarIcon() {
  return (
    <svg
      className="h-6 w-6"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      aria-hidden
    >
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M3 10h18M8 2v4M16 2v4" />
    </svg>
  );
}
