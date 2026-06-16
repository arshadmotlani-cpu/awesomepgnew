'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  addDays,
  addMonths,
  diffDays,
  formatDate,
  parseDate,
  todayString,
} from '@/src/lib/dates';
import { formatDateDdMmYyyy } from '@/src/lib/format';

type Theme = 'dark' | 'light';

type Props = {
  theme?: Theme;
  checkIn: string;
  checkOut: string | null;
  onCheckInChange: (date: string) => void;
  onCheckOutChange: (date: string) => void;
  minCheckIn?: string;
  maxCheckIn?: string;
  minCheckOut?: string;
  maxCheckOut?: string;
  showCheckOut?: boolean;
  disabled?: boolean;
};

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function monthStart(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

function calendarCells(year: number, month: number): Array<{ date: string | null; day: number }> {
  const first = new Date(Date.UTC(year, month, 1));
  const startPad = first.getUTCDay();
  const total = daysInMonth(year, month);
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
  checkIn,
  checkOut,
  minDate,
  maxDate,
  onPick,
}: {
  year: number;
  month: number;
  theme: Theme;
  checkIn: string;
  checkOut: string | null;
  minDate?: string;
  maxDate?: string;
  onPick: (date: string) => void;
}) {
  const dark = theme === 'dark';
  const cells = calendarCells(year, month);
  const monthLabel = new Date(Date.UTC(year, month, 1)).toLocaleString('en-IN', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

  function inRange(date: string): boolean {
    if (!checkOut || !checkIn) return false;
    return date > checkIn && date < checkOut;
  }

  function isDisabled(date: string): boolean {
    if (minDate && date < minDate) return true;
    if (maxDate && date > maxDate) return true;
    return false;
  }

  return (
    <div className="min-w-[280px]">
      <p
        className={`mb-2 text-center text-sm font-semibold ${dark ? 'text-white' : 'text-zinc-900'}`}
      >
        {monthLabel}
      </p>
      <div className="mb-1 grid grid-cols-7 gap-0.5 text-center text-[10px] font-medium uppercase tracking-wide">
        {WEEKDAYS.map((w) => (
          <span key={w} className={dark ? 'text-apg-silver' : 'text-zinc-500'}>
            {w}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((cell, idx) => {
          if (!cell.date) {
            return <span key={`pad-${idx}`} className="h-10" />;
          }
          const disabled = isDisabled(cell.date);
          const isStart = cell.date === checkIn;
          const isEnd = checkOut != null && cell.date === checkOut;
          const ranged = inRange(cell.date);
          const base =
            'flex h-10 w-full items-center justify-center rounded-lg text-sm font-medium transition-colors';
          let cls = base;
          if (disabled) {
            cls += dark ? ' text-white/20 cursor-not-allowed' : ' text-zinc-300 cursor-not-allowed';
          } else if (isStart || isEnd) {
            cls += ' bg-apg-orange text-white shadow-sm';
          } else if (ranged) {
            cls += dark ? ' bg-apg-orange/20 text-white' : ' bg-indigo-100 text-indigo-900';
          } else {
            cls += dark
              ? ' text-white hover:bg-white/10 cursor-pointer'
              : ' text-zinc-800 hover:bg-zinc-100 cursor-pointer';
          }
          return (
            <button
              key={cell.date}
              type="button"
              disabled={disabled}
              onClick={() => onPick(cell.date!)}
              className={cls}
              aria-label={cell.date}
            >
              {cell.day}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Travel-style date range picker — full-field tap targets, modal calendar,
 * no manual typing required.
 */
export function StayDateRangePicker({
  theme = 'dark',
  checkIn,
  checkOut,
  onCheckInChange,
  onCheckOutChange,
  minCheckIn,
  maxCheckIn,
  minCheckOut,
  maxCheckOut,
  showCheckOut = true,
  disabled = false,
}: Props) {
  const dark = theme === 'dark';
  const [open, setOpen] = useState(false);
  const [picking, setPicking] = useState<'checkIn' | 'checkOut'>('checkIn');
  const [viewMonth, setViewMonth] = useState(() => monthStart(parseDate(checkIn || todayString())));

  useEffect(() => {
    if (open) {
      setViewMonth(monthStart(parseDate(checkIn || todayString())));
      setPicking('checkIn');
    }
  }, [open, checkIn]);

  const nextMonth = useMemo(() => addMonths(viewMonth, 1), [viewMonth]);
  const nights =
    showCheckOut && checkOut && checkIn > '' && checkOut > checkIn
      ? diffDays(parseDate(checkIn), parseDate(checkOut))
      : 0;

  const onPick = useCallback(
    (date: string) => {
      if (picking === 'checkIn') {
        onCheckInChange(date);
        if (showCheckOut) {
          if (!checkOut || checkOut <= date) {
            onCheckOutChange(formatDate(addDays(date, 7)));
          }
          setPicking('checkOut');
        } else {
          setOpen(false);
        }
      } else {
        if (date <= checkIn) return;
        onCheckOutChange(date);
        setOpen(false);
      }
    },
    [picking, checkIn, checkOut, showCheckOut, onCheckInChange, onCheckOutChange],
  );

  const fieldBtn = dark
    ? 'flex w-full items-center justify-between gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-left transition hover:border-apg-orange/40 hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-apg-orange/50 disabled:opacity-50'
    : 'flex w-full items-center justify-between gap-2 rounded-xl border border-zinc-300 bg-white px-4 py-3 text-left shadow-sm transition hover:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 disabled:opacity-50';

  const modalShell = dark
    ? 'w-full max-w-[640px] rounded-2xl border border-white/10 apg-glass shadow-2xl'
    : 'w-full max-w-[640px] rounded-2xl border border-zinc-200 bg-white shadow-2xl';

  return (
    <>
      <div className={`grid gap-3 ${showCheckOut ? 'sm:grid-cols-2' : 'grid-cols-1'}`}>
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            setPicking('checkIn');
            setOpen(true);
          }}
          className={fieldBtn}
          aria-label="Select check-in date"
        >
          <span>
            <span className={`block text-[10px] font-semibold uppercase tracking-wide ${dark ? 'text-apg-silver' : 'text-zinc-500'}`}>
              {showCheckOut ? 'Check-in' : 'Move-in'}
            </span>
            <span className={`mt-0.5 block text-base font-semibold ${dark ? 'text-white' : 'text-zinc-900'}`}>
              {checkIn ? formatDateDdMmYyyy(checkIn) : 'Select date'}
            </span>
          </span>
          <CalendarIcon className={dark ? 'text-apg-orange' : 'text-indigo-600'} />
        </button>
        {showCheckOut ? (
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              setPicking('checkOut');
              setOpen(true);
            }}
            className={fieldBtn}
            aria-label="Select check-out date"
          >
            <span>
              <span className={`block text-[10px] font-semibold uppercase tracking-wide ${dark ? 'text-apg-silver' : 'text-zinc-500'}`}>
                Check-out
              </span>
              <span className={`mt-0.5 block text-base font-semibold ${dark ? 'text-white' : 'text-zinc-900'}`}>
                {checkOut ? formatDateDdMmYyyy(checkOut) : 'Select date'}
              </span>
            </span>
            <CalendarIcon className={dark ? 'text-apg-orange' : 'text-indigo-600'} />
          </button>
        ) : null}
      </div>

      {showCheckOut && nights > 0 ? (
        <p className={`text-xs ${dark ? 'text-apg-silver' : 'text-zinc-600'}`}>
          {nights} night{nights === 1 ? '' : 's'} selected
          {picking === 'checkOut' && open ? ' — tap your check-out date' : ''}
        </p>
      ) : null}

      {open ? (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Choose stay dates"
          onClick={() => setOpen(false)}
        >
          <div className={modalShell} onClick={(e) => e.stopPropagation()}>
            <div className={`flex items-center justify-between border-b px-4 py-3 ${dark ? 'border-white/10' : 'border-zinc-200'}`}>
              <div>
                <p className={`text-sm font-semibold ${dark ? 'text-white' : 'text-zinc-900'}`}>
                  {picking === 'checkIn' ? 'Select check-in' : 'Select check-out'}
                </p>
                <p className={`text-xs ${dark ? 'text-apg-silver' : 'text-zinc-500'}`}>
                  {checkIn && formatDateDdMmYyyy(checkIn)}
                  {showCheckOut && checkOut ? ` → ${formatDateDdMmYyyy(checkOut)}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setViewMonth(addMonths(viewMonth, -1))}
                  className={dark ? 'rounded-lg px-2 py-1 text-apg-silver hover:bg-white/10' : 'rounded-lg px-2 py-1 text-zinc-600 hover:bg-zinc-100'}
                  aria-label="Previous month"
                >
                  ‹
                </button>
                <button
                  type="button"
                  onClick={() => setViewMonth(addMonths(viewMonth, 1))}
                  className={dark ? 'rounded-lg px-2 py-1 text-apg-silver hover:bg-white/10' : 'rounded-lg px-2 py-1 text-zinc-600 hover:bg-zinc-100'}
                  aria-label="Next month"
                >
                  ›
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className={dark ? 'ml-2 rounded-lg px-3 py-1 text-sm text-apg-silver hover:text-white' : 'ml-2 rounded-lg px-3 py-1 text-sm text-zinc-600'}
                >
                  Done
                </button>
              </div>
            </div>
            <div className="flex flex-col gap-6 p-4 sm:flex-row sm:justify-center">
              <MonthGrid
                year={viewMonth.getUTCFullYear()}
                month={viewMonth.getUTCMonth()}
                theme={theme}
                checkIn={checkIn}
                checkOut={checkOut}
                minDate={picking === 'checkIn' ? minCheckIn : minCheckOut ?? formatDate(addDays(checkIn, 1))}
                maxDate={picking === 'checkIn' ? maxCheckIn : maxCheckOut}
                onPick={onPick}
              />
              <MonthGrid
                year={nextMonth.getUTCFullYear()}
                month={nextMonth.getUTCMonth()}
                theme={theme}
                checkIn={checkIn}
                checkOut={checkOut}
                minDate={picking === 'checkIn' ? minCheckIn : minCheckOut ?? formatDate(addDays(checkIn, 1))}
                maxDate={picking === 'checkIn' ? maxCheckIn : maxCheckOut}
                onPick={onPick}
              />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg
      className={`h-6 w-6 shrink-0 ${className ?? ''}`}
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
