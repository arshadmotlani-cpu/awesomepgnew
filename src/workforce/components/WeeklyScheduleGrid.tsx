'use client';

import { useCallback, useId, useRef } from 'react';
import {
  applyScheduleDayToTargets,
  DAY_LABELS,
  resolveAdjacentScheduleField,
  resolveVerticalScheduleField,
  type ScheduleDayState,
  type ScheduleFieldKind,
} from '@/src/workforce/lib/scheduleEditor';
import { Button } from '@/src/hair/components/ui/button';

type FieldRefKey = `${number}:${ScheduleFieldKind}`;

function fieldKey(dayOfWeek: number, field: ScheduleFieldKind): FieldRefKey {
  return `${dayOfWeek}:${field}`;
}

type Props = {
  days: ScheduleDayState[];
  onChange: (days: ScheduleDayState[]) => void;
  readOnly?: boolean;
  showCopyControls?: boolean;
  /** When true, inputs use name= for parent <form> submission (create employee). */
  formFieldNames?: boolean;
};

export function WeeklyScheduleGrid({
  days,
  onChange,
  readOnly = false,
  showCopyControls = true,
  formFieldNames = false,
}: Props) {
  const copySourceId = useId();
  const fieldRefs = useRef<Partial<Record<FieldRefKey, HTMLInputElement | null>>>({});

  const focusField = useCallback((dayOfWeek: number, field: ScheduleFieldKind) => {
    fieldRefs.current[fieldKey(dayOfWeek, field)]?.focus();
  }, []);

  const patchDay = useCallback(
    (dayOfWeek: number, patch: Partial<ScheduleDayState>) => {
      onChange(days.map((d) => (d.dayOfWeek === dayOfWeek ? { ...d, ...patch } : d)));
    },
    [days, onChange],
  );

  const handleTimeKeyDown = (
    event: React.KeyboardEvent<HTMLInputElement>,
    dayOfWeek: number,
    field: ScheduleFieldKind,
  ) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      const next = resolveAdjacentScheduleField(dayOfWeek, field, 'next');
      focusField(next.dayOfWeek, next.field);
      return;
    }
    if (event.key === 'ArrowRight' && field === 'start') {
      event.preventDefault();
      focusField(dayOfWeek, 'end');
      return;
    }
    if (event.key === 'ArrowLeft' && field === 'end') {
      event.preventDefault();
      focusField(dayOfWeek, 'start');
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      const next = resolveVerticalScheduleField(dayOfWeek, field, 'down');
      focusField(next.dayOfWeek, next.field);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      const next = resolveVerticalScheduleField(dayOfWeek, field, 'up');
      focusField(next.dayOfWeek, next.field);
    }
  };

  const applyCopy = (targetDays: number[], skipOffDays: boolean) => {
    const sourceSelect = document.getElementById(copySourceId) as HTMLSelectElement | null;
    const sourceDay = Number(sourceSelect?.value ?? '1');
    onChange(applyScheduleDayToTargets(days, sourceDay, targetDays, { skipOffDays }));
  };

  return (
    <div className="space-y-3">
      {showCopyControls && !readOnly ? (
        <div className="flex flex-wrap items-end gap-2 rounded-lg border border-[color:var(--fyh-border)] bg-[color:var(--fyh-surface-muted)]/40 p-3 text-xs">
          <label className="flex flex-col gap-1 text-fyh-text-secondary">
            Copy from
            <select
              id={copySourceId}
              defaultValue="1"
              className="fyh-select min-w-[6.5rem] text-sm text-fyh-text"
            >
              {DAY_LABELS.map((label, dayOfWeek) => (
                <option key={dayOfWeek} value={dayOfWeek}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => applyCopy(DAY_LABELS.map((_, i) => i), true)}
          >
            Copy to all working days
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => applyCopy([1, 2, 3, 4, 5, 6], true)}
          >
            Copy to Mon–Sat
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => applyCopy(DAY_LABELS.map((_, i) => i), false)}
          >
            Copy to all days
          </Button>
        </div>
      ) : null}

      <div
        className="hidden text-[10px] font-semibold uppercase tracking-wide text-fyh-text-secondary sm:grid sm:grid-cols-[3rem_1fr_1fr_3.5rem_4.5rem] sm:gap-2"
        aria-hidden
      >
        <span>Day</span>
        <span>Start</span>
        <span>End</span>
        <span>Off</span>
        <span />
      </div>

      <div className="grid gap-2">
        {days.map((d) => (
          <div
            key={d.dayOfWeek}
            className="grid grid-cols-[3rem_1fr_1fr_auto] items-center gap-2 text-xs sm:grid-cols-[3rem_1fr_1fr_3.5rem_4.5rem] sm:text-sm"
          >
            <span className="font-medium text-fyh-text">{DAY_LABELS[d.dayOfWeek]}</span>
            {formFieldNames ? (
              <input type="hidden" name={`day_${d.dayOfWeek}_dow`} value={d.dayOfWeek} />
            ) : null}
            <input
              ref={(el) => {
                fieldRefs.current[fieldKey(d.dayOfWeek, 'start')] = el;
              }}
              name={formFieldNames ? `day_${d.dayOfWeek}_start` : undefined}
              type="time"
              value={d.startTime}
              disabled={readOnly || d.isOff}
              aria-label={`${DAY_LABELS[d.dayOfWeek]} start time`}
              onChange={(e) => patchDay(d.dayOfWeek, { startTime: e.target.value })}
              onKeyDown={(e) => handleTimeKeyDown(e, d.dayOfWeek, 'start')}
              className="rounded border border-[color:var(--fyh-border)] bg-transparent px-2 py-1 disabled:opacity-50"
            />
            <input
              ref={(el) => {
                fieldRefs.current[fieldKey(d.dayOfWeek, 'end')] = el;
              }}
              name={formFieldNames ? `day_${d.dayOfWeek}_end` : undefined}
              type="time"
              value={d.endTime}
              disabled={readOnly || d.isOff}
              aria-label={`${DAY_LABELS[d.dayOfWeek]} end time`}
              onChange={(e) => patchDay(d.dayOfWeek, { endTime: e.target.value })}
              onKeyDown={(e) => handleTimeKeyDown(e, d.dayOfWeek, 'end')}
              className="rounded border border-[color:var(--fyh-border)] bg-transparent px-2 py-1 disabled:opacity-50"
            />
            <label className="flex items-center gap-1 text-fyh-text-secondary">
              <input
                name={formFieldNames ? `day_${d.dayOfWeek}_off` : undefined}
                type="checkbox"
                value="1"
                checked={d.isOff}
                disabled={readOnly}
                aria-label={`${DAY_LABELS[d.dayOfWeek]} off`}
                onChange={(e) => patchDay(d.dayOfWeek, { isOff: e.target.checked })}
              />
              Off
            </label>
            {showCopyControls && !readOnly ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="hidden h-8 px-2 text-xs sm:inline-flex"
                onClick={() => applyCopy([d.dayOfWeek], false)}
              >
                Apply row
              </Button>
            ) : (
              <span className="hidden sm:block" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
