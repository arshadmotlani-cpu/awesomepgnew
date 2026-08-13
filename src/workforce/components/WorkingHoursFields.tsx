'use client';

import { DEFAULT_WEEK_SCHEDULE } from '@/src/workforce/lib/weekOff';
import type { ScheduleDayValue } from '@/src/workforce/components/WorkingHoursEditor';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

type Props = {
  initial?: ScheduleDayValue[];
};

/** Inline working-hours inputs for employee create / embedded forms. */
export function WorkingHoursFields({ initial }: Props) {
  const byDay = new Map((initial ?? DEFAULT_WEEK_SCHEDULE).map((d) => [d.dayOfWeek, d]));
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
  );
}
