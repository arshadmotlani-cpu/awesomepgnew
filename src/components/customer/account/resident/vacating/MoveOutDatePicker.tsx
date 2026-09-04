'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { addMonths, formatDate, parseDate, todayString } from '@/src/lib/dates';
import { formatFinalStayDateLabel } from '@/src/lib/vacating/vacatingBedSemantics';
import { LAYER_Z } from '@/src/lib/ui/layerZIndex';

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

type Theme = 'dark' | 'light';

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
  selected,
  minDate,
  today,
  onPick,
}: {
  year: number;
  month: number;
  theme: Theme;
  selected: string;
  minDate: string;
  today: string;
  onPick: (date: string) => void;
}) {
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
          const disabled = date < minDate;
          const isSelected = date === selected;
          const isToday = date === today;

          let cellClass =
            'flex h-11 w-full items-center justify-center rounded-xl text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-apg-orange/50';
          if (disabled) {
            cellClass += dark ? ' cursor-not-allowed text-white/20' : ' cursor-not-allowed text-zinc-300';
          } else if (isSelected) {
            cellClass += ' bg-apg-orange text-white shadow-md';
          } else if (isToday) {
            cellClass += dark
              ? ' border border-apg-orange/60 text-apg-orange hover:bg-white/10'
              : ' border border-orange-400 text-orange-700 hover:bg-orange-50';
          } else {
            cellClass += dark ? ' text-white hover:bg-white/10' : ' text-zinc-900 hover:bg-zinc-100';
          }

          return (
            <button
              key={date}
              type="button"
              disabled={disabled}
              onClick={() => onPick(date)}
              className={cellClass}
              aria-label={formatFinalStayDateLabel(date)}
              aria-pressed={isSelected}
            >
              {cell.day}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CalendarIcon() {
  return (
    <svg
      className="h-5 w-5"
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

type Props = {
  value: string;
  onChange: (date: string) => void;
  name?: string;
  minDate?: string;
  theme?: Theme;
  disabled?: boolean;
};

export function MoveOutDatePicker({
  value,
  onChange,
  name = 'vacatingDate',
  minDate,
  theme = 'dark',
  disabled = false,
}: Props) {
  const dark = theme === 'dark';
  const earliest = minDate ?? todayString();
  const today = todayString();
  const [open, setOpen] = useState(false);
  const [portalReady, setPortalReady] = useState(false);
  const [viewMonth, setViewMonth] = useState(() => monthStart(parseDate(value || earliest)));

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      setViewMonth(monthStart(parseDate(value)));
    }
  }, [value]);

  const displayLabel = useMemo(
    () => (/^\d{4}-\d{2}-\d{2}$/.test(value) ? formatFinalStayDateLabel(value) : 'Select date'),
    [value],
  );

  const onPick = useCallback(
    (date: string) => {
      onChange(date);
      setOpen(false);
    },
    [onChange],
  );

  const triggerShell = dark
    ? 'flex w-full items-center gap-3 rounded-xl border border-white/15 bg-black/20 px-4 py-3 transition hover:border-apg-orange/40 focus-within:ring-2 focus-within:ring-apg-orange/40 disabled:opacity-50'
    : 'flex w-full items-center gap-3 rounded-xl border border-zinc-300 bg-white px-4 py-3 transition hover:border-orange-300 focus-within:ring-2 focus-within:ring-orange-400/30 disabled:opacity-50';

  const modalShell = dark
    ? 'flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-white/10 bg-[#12151c] shadow-2xl sm:max-h-[90vh] sm:max-w-[400px] sm:rounded-2xl'
    : 'flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-zinc-200 bg-white shadow-2xl sm:max-h-[90vh] sm:max-w-[400px] sm:rounded-2xl';

  return (
    <>
      <input type="hidden" name={name} value={value} readOnly />
      <div>
        <span
          className={
            dark
              ? 'text-xs font-medium uppercase tracking-wide text-apg-silver'
              : 'text-xs font-medium uppercase tracking-wide text-zinc-600'
          }
        >
          Move-out date
        </span>
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen(true)}
          className={`${triggerShell} mt-1 w-full text-left`}
          aria-label="Select move-out date"
          aria-haspopup="dialog"
          aria-expanded={open}
          data-testid="move-out-date-picker-trigger"
        >
          <span className={`min-w-0 flex-1 text-sm font-semibold ${dark ? 'text-white' : 'text-zinc-900'}`}>
            {displayLabel}
          </span>
          <span
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
              dark ? 'bg-apg-orange/15 text-apg-orange' : 'bg-orange-50 text-orange-600'
            }`}
          >
            <CalendarIcon />
          </span>
        </button>
      </div>

      {portalReady && open
        ? createPortal(
            <div
              className="fixed inset-0 flex flex-col justify-end bg-black/75 sm:items-center sm:justify-center sm:p-4"
              style={{ zIndex: LAYER_Z.nestedOverlay }}
              role="dialog"
              aria-modal="true"
              aria-label="Choose move-out date"
              data-testid="move-out-date-picker-dialog"
              onClick={() => setOpen(false)}
            >
              <div
                className={modalShell}
                style={{ zIndex: LAYER_Z.nestedDialog, position: 'relative' }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className={`shrink-0 border-b px-4 py-4 sm:px-6 ${dark ? 'border-white/10' : 'border-zinc-200'}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className={`text-lg font-semibold ${dark ? 'text-white' : 'text-zinc-900'}`}>
                        Final stay date
                      </p>
                      <p className={`mt-0.5 text-sm ${dark ? 'text-apg-silver' : 'text-zinc-500'}`}>
                        Rent is charged through this date. Your bed frees up the next day.
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
                </div>
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
                  <div className="flex justify-center">
                    <MonthGrid
                      year={viewMonth.getUTCFullYear()}
                      month={viewMonth.getUTCMonth()}
                      theme={theme}
                      selected={value}
                      minDate={earliest}
                      today={today}
                      onPick={onPick}
                    />
                  </div>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
