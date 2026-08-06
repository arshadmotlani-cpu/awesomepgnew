'use client';

import { WORKFORCE_WEEKDAY_LABELS, WORKFORCE_WEEKDAY_ORDER } from '@/src/workforce/types/hr';

type Props = {
  name?: string;
  defaultOffDays?: number[];
};

export function WeekOffPicker({ name = 'weekOff', defaultOffDays = [0] }: Props) {
  const offSet = new Set(defaultOffDays);
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">Weekly off days</legend>
      <div className="flex flex-wrap gap-3">
        {WORKFORCE_WEEKDAY_ORDER.map((day) => (
          <label key={day} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name={name}
              value={String(day)}
              defaultChecked={offSet.has(day)}
              className="h-4 w-4"
            />
            <span>{WORKFORCE_WEEKDAY_LABELS[day]}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
