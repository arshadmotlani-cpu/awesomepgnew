'use client';

import { useTransition } from 'react';
import { saveWeeklyScheduleAction } from '@/src/workforce/actions/operations';
import { Button } from '@/src/hair/components/ui/button';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export type ScheduleDayValue = {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isOff: boolean;
};

export function WorkingHoursEditor(props: {
  employeeId: string;
  employeeName: string;
  initial: ScheduleDayValue[];
  /** Profile embed — hide duplicate title and use primary save button. */
  embedded?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const byDay = new Map(props.initial.map((d) => [d.dayOfWeek, d]));
  const days = DAY_LABELS.map((_, dayOfWeek) => {
    const hit = byDay.get(dayOfWeek);
    return {
      dayOfWeek,
      startTime: hit?.startTime ?? '10:00',
      endTime: hit?.endTime ?? '19:00',
      isOff: hit?.isOff ?? dayOfWeek === 0,
    };
  });

  return (
    <form
      className="space-y-3"
      action={(fd) => {
        startTransition(async () => {
          await saveWeeklyScheduleAction(fd);
        });
      }}
    >
      <input type="hidden" name="employeeId" value={props.employeeId} />
      {props.embedded ? null : (
        <p className="text-sm font-medium text-fyh-text">{props.employeeName}</p>
      )}
      <div className="grid gap-2">
        {days.map((d) => (
          <div
            key={d.dayOfWeek}
            className="grid grid-cols-[3rem_1fr_1fr_auto] items-center gap-2 text-xs sm:text-sm"
          >
            <span className="font-medium text-fyh-text">{DAY_LABELS[d.dayOfWeek]}</span>
            <input type="hidden" name={`day_${d.dayOfWeek}_dow`} value={d.dayOfWeek} />
            <input
              name={`day_${d.dayOfWeek}_start`}
              type="time"
              defaultValue={d.startTime}
              className="rounded border border-[color:var(--fyh-border)] bg-transparent px-2 py-1"
            />
            <input
              name={`day_${d.dayOfWeek}_end`}
              type="time"
              defaultValue={d.endTime}
              className="rounded border border-[color:var(--fyh-border)] bg-transparent px-2 py-1"
            />
            <label className="flex items-center gap-1 text-fyh-text-secondary">
              <input name={`day_${d.dayOfWeek}_off`} type="checkbox" value="1" defaultChecked={d.isOff} />
              Off
            </label>
          </div>
        ))}
      </div>
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
    </form>
  );
}
