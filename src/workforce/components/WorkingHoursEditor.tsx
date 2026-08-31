'use client';

import { useActionState, useEffect, useState } from 'react';
import {
  saveWeeklyScheduleAction,
  type WorkforceScheduleActionState,
} from '@/src/workforce/actions/operations';
import { WeeklyScheduleGrid } from '@/src/workforce/components/WeeklyScheduleGrid';
import { normalizeScheduleDays, type ScheduleDayState, type ScheduleDayValue } from '@/src/workforce/lib/scheduleEditor';
import { Button } from '@/src/hair/components/ui/button';

export type { ScheduleDayValue } from '@/src/workforce/lib/scheduleEditor';

const initial: WorkforceScheduleActionState = {};

export function WorkingHoursEditor(props: {
  employeeId: string;
  employeeName: string;
  initial: ScheduleDayValue[];
  /** Profile embed — hide duplicate title and use primary save button. */
  embedded?: boolean;
  readOnly?: boolean;
}) {
  const [days, setDays] = useState<ScheduleDayState[]>(() => normalizeScheduleDays(props.initial));
  const [state, formAction, pending] = useActionState(saveWeeklyScheduleAction, initial);

  useEffect(() => {
    setDays(normalizeScheduleDays(props.initial));
  }, [props.initial]);

  return (
    <form action={formAction} className="space-y-3" onKeyDown={(e) => {
      if (e.key === 'Enter' && (e.target as HTMLElement).closest('[data-schedule-grid]')) {
        const tag = (e.target as HTMLElement).tagName;
        if (tag === 'INPUT' && (e.target as HTMLInputElement).type === 'time') {
          e.preventDefault();
        }
      }
    }}>
      <input type="hidden" name="employeeId" value={props.employeeId} />
      {days.map((d) => (
        <div key={d.dayOfWeek} className="hidden" aria-hidden>
          <input type="hidden" name={`day_${d.dayOfWeek}_dow`} value={d.dayOfWeek} />
          <input type="hidden" name={`day_${d.dayOfWeek}_start`} value={d.startTime} />
          <input type="hidden" name={`day_${d.dayOfWeek}_end`} value={d.endTime} />
          {d.isOff ? <input type="hidden" name={`day_${d.dayOfWeek}_off`} value="1" /> : null}
        </div>
      ))}

      {props.embedded ? null : (
        <p className="text-sm font-medium text-fyh-text">{props.employeeName}</p>
      )}

      <div data-schedule-grid>
        <WeeklyScheduleGrid
          days={days}
          onChange={setDays}
          readOnly={props.readOnly}
          showCopyControls={!props.readOnly}
        />
      </div>

      {state.error ? (
        <p className="text-sm text-red-600" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p className="text-sm text-emerald-700" role="status">
          {state.success}
        </p>
      ) : null}

      {props.readOnly ? null : (
        <div className="flex justify-end border-t border-[color:var(--fyh-border)] pt-3">
          {props.embedded ? (
            <Button type="submit" disabled={pending} variant="secondary">
              {pending ? 'Saving…' : 'Save working hours'}
            </Button>
          ) : (
            <button
              type="submit"
              disabled={pending}
              className="text-sm text-fyh-accent underline disabled:opacity-50"
            >
              {pending ? 'Saving…' : 'Save hours'}
            </button>
          )}
        </div>
      )}
    </form>
  );
}
