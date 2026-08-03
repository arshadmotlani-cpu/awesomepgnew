'use client';

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { formatDate, parseDate } from '@/src/lib/dates';
import { cn } from '@/src/hair/lib/utils';

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const WEEKDAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

const PANEL_WIDTH_PX = 272;
const PANEL_GAP_PX = 6;
const VIEWPORT_PAD_PX = 8;

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

function buildDayGrid(year: number, month: number): (number | null)[] {
  const firstWeekday = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const totalDays = daysInMonth(year, month);
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let day = 1; day <= totalDays; day++) cells.push(day);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function firstValidDayIndex(grid: (number | null)[]): number {
  const idx = grid.findIndex((d) => d != null);
  return idx >= 0 ? idx : 0;
}

function stepValidDayIndex(grid: (number | null)[], from: number, delta: number): number {
  if (delta === 0) return from;
  let i = from;
  for (let step = 0; step < grid.length; step++) {
    i += delta;
    if (i < 0 || i >= grid.length) return from;
    if (grid[i] != null) return i;
  }
  return from;
}

function formatDisplay(iso: string): string {
  if (!iso) return '';
  try {
    const d = parseDate(iso);
    return d.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    });
  } catch {
    return iso;
  }
}

function clampPanelPosition(trigger: DOMRect): { top: number; left: number } {
  const width = Math.min(PANEL_WIDTH_PX, window.innerWidth - VIEWPORT_PAD_PX * 2);
  let left = trigger.left;
  let top = trigger.bottom + PANEL_GAP_PX;

  if (left + width > window.innerWidth - VIEWPORT_PAD_PX) {
    left = Math.max(VIEWPORT_PAD_PX, window.innerWidth - VIEWPORT_PAD_PX - width);
  }
  if (left < VIEWPORT_PAD_PX) left = VIEWPORT_PAD_PX;

  const estimatedHeight = 320;
  if (top + estimatedHeight > window.innerHeight - VIEWPORT_PAD_PX) {
    const above = trigger.top - PANEL_GAP_PX - estimatedHeight;
    if (above >= VIEWPORT_PAD_PX) top = above;
  }

  return { top, left };
}

export type FyhDatePickerProps = {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  'aria-label'?: string;
};

export function FyhDatePicker({
  id: idProp,
  value,
  onChange,
  placeholder = 'Select date',
  className,
  'aria-label': ariaLabel,
}: FyhDatePickerProps) {
  const autoId = useId();
  const id = idProp ?? autoId;
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [panelPos, setPanelPos] = useState<{ top: number; left: number } | null>(null);

  const parsed = useMemo(() => {
    if (!value) return null;
    try {
      return parseDate(value);
    } catch {
      return null;
    }
  }, [value]);

  const [viewYear, setViewYear] = useState(() =>
    parsed ? parsed.getUTCFullYear() : new Date().getUTCFullYear(),
  );
  const [viewMonth, setViewMonth] = useState(() =>
    parsed ? parsed.getUTCMonth() : new Date().getUTCMonth(),
  );
  const [focusIndex, setFocusIndex] = useState(() => {
    if (!parsed) return 0;
    const grid = buildDayGrid(parsed.getUTCFullYear(), parsed.getUTCMonth());
    const idx = grid.indexOf(parsed.getUTCDate());
    return idx >= 0 ? idx : 0;
  });

  const dayGrid = useMemo(() => buildDayGrid(viewYear, viewMonth), [viewYear, viewMonth]);

  useEffect(() => {
    setMounted(true);
  }, []);

  const updatePosition = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPanelPos(clampPanelPosition(rect));
  }, []);

  const openPanel = useCallback(() => {
    if (parsed) {
      setViewYear(parsed.getUTCFullYear());
      setViewMonth(parsed.getUTCMonth());
      const grid = buildDayGrid(parsed.getUTCFullYear(), parsed.getUTCMonth());
      const idx = grid.indexOf(parsed.getUTCDate());
      setFocusIndex(idx >= 0 ? idx : 0);
    } else {
      const now = new Date();
      setViewYear(now.getUTCFullYear());
      setViewMonth(now.getUTCMonth());
      setFocusIndex(firstValidDayIndex(buildDayGrid(now.getUTCFullYear(), now.getUTCMonth())));
    }
    setOpen(true);
  }, [parsed]);

  const selectDay = useCallback(
    (day: number) => {
      const iso = formatDate(
        parseDate(
          `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
        ),
      );
      onChange(iso);
      setOpen(false);
    },
    [onChange, viewMonth, viewYear],
  );

  const moveMonth = (delta: number) => {
    const next = new Date(Date.UTC(viewYear, viewMonth + delta, 1));
    setViewYear(next.getUTCFullYear());
    setViewMonth(next.getUTCMonth());
    setFocusIndex(firstValidDayIndex(buildDayGrid(next.getUTCFullYear(), next.getUTCMonth())));
  };

  useLayoutEffect(() => {
    if (!open) {
      setPanelPos(null);
      return;
    }
    updatePosition();
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    function onReposition() {
      updatePosition();
    }
    window.addEventListener('resize', onReposition);
    window.addEventListener('scroll', onReposition, true);
    return () => {
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('scroll', onReposition, true);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    function onDocMouseDown(e: MouseEvent) {
      const target = e.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
        return;
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setFocusIndex((i) => stepValidDayIndex(dayGrid, i, -1));
        return;
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        setFocusIndex((i) => stepValidDayIndex(dayGrid, i, 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusIndex((i) => stepValidDayIndex(dayGrid, i, -7));
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setFocusIndex((i) => stepValidDayIndex(dayGrid, i, 7));
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        let day = dayGrid[focusIndex];
        if (day == null) {
          const idx = firstValidDayIndex(dayGrid);
          day = dayGrid[idx];
        }
        if (day != null) selectDay(day);
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, dayGrid, focusIndex, selectDay]);

  const yearOptions = useMemo(() => {
    const current = new Date().getUTCFullYear();
    const years: number[] = [];
    for (let y = current - 10; y <= current + 2; y++) years.push(y);
    return years;
  }, []);

  const panel =
    open && panelPos ? (
      <div
        ref={panelRef}
        role="dialog"
        aria-label="Choose date"
        className="fyh-datepicker-panel fixed z-[600] w-[min(100vw-1rem,17rem)] rounded-xl border border-[color:var(--fyh-border-strong)] p-3 shadow-[0_24px_64px_rgba(0,0,0,0.55)]"
        style={{ top: panelPos.top, left: panelPos.left }}
      >
        <div className="mb-2 flex items-center justify-between gap-1">
          <button
            type="button"
            className="rounded-md p-1 text-fyh-text-secondary hover:bg-white/8"
            aria-label="Previous month"
            onClick={() => moveMonth(-1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="flex min-w-0 flex-1 items-center justify-center gap-1.5">
            <span className="truncate text-sm font-semibold text-fyh-text">
              {MONTH_NAMES[viewMonth]}
            </span>
            <select
              aria-label="Year"
              value={viewYear}
              onChange={(e) => {
                const y = Number(e.target.value);
                setViewYear(y);
                setFocusIndex(firstValidDayIndex(buildDayGrid(y, viewMonth)));
              }}
              className="fyh-select h-7 max-w-[5.5rem] px-1.5 text-xs"
            >
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            className="rounded-md p-1 text-fyh-text-secondary hover:bg-white/8"
            aria-label="Next month"
            onClick={() => moveMonth(1)}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div className="mb-1 grid grid-cols-7 gap-0.5">
          {WEEKDAY_LABELS.map((label) => (
            <div
              key={label}
              className="py-1 text-center text-[0.625rem] font-semibold uppercase tracking-wide text-fyh-text-muted"
            >
              {label}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-0.5">
          {dayGrid.map((day, index) => {
            if (day == null) {
              return <div key={`empty-${index}`} className="min-h-9" aria-hidden />;
            }
            const iso = formatDate(
              parseDate(
                `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
              ),
            );
            const selected = value === iso;
            const focused = focusIndex === index;
            return (
              <button
                key={`${viewYear}-${viewMonth}-${day}`}
                type="button"
                tabIndex={focused ? 0 : -1}
                onClick={() => selectDay(day)}
                onFocus={() => setFocusIndex(index)}
                className={cn(
                  'flex min-h-9 items-center justify-center rounded-lg text-sm tabular-nums transition',
                  selected
                    ? 'bg-fyh-accent font-semibold text-black'
                    : 'text-fyh-text hover:bg-white/10',
                  focused && !selected && 'ring-1 ring-fyh-accent/50',
                )}
              >
                {day}
              </button>
            );
          })}
        </div>

        {value ? (
          <button
            type="button"
            className="mt-2 w-full rounded-lg py-1.5 text-xs text-fyh-text-muted hover:bg-white/6 hover:text-fyh-text"
            onClick={() => {
              onChange('');
              setOpen(false);
            }}
          >
            Clear date
          </button>
        ) : null}
      </div>
    ) : null;

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <button
        ref={triggerRef}
        type="button"
        id={id}
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => (open ? setOpen(false) : openPanel())}
        className={cn(
          'fyh-input flex h-9 w-full items-center justify-between gap-2 px-2.5 text-left text-[0.8125rem]',
          !value && 'text-fyh-text-muted',
        )}
      >
        <span className="truncate">{value ? formatDisplay(value) : placeholder}</span>
        <Calendar className="h-3.5 w-3.5 shrink-0 text-fyh-text-muted" aria-hidden />
      </button>

      {mounted && panel ? createPortal(panel, document.body) : null}
    </div>
  );
}
