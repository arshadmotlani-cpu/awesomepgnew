'use client';

import { useState } from 'react';
import { DEFAULT_WEEK_SCHEDULE } from '@/src/workforce/lib/weekOff';
import type { ScheduleDayValue } from '@/src/workforce/components/WorkingHoursEditor';
import { WeeklyScheduleGrid } from '@/src/workforce/components/WeeklyScheduleGrid';
import { normalizeScheduleDays } from '@/src/workforce/lib/scheduleEditor';

type Props = {
  initial?: ScheduleDayValue[];
};

/** Inline working-hours inputs for employee create / embedded forms. */
export function WorkingHoursFields({ initial }: Props) {
  const [days, setDays] = useState(() => normalizeScheduleDays(initial ?? DEFAULT_WEEK_SCHEDULE));

  return (
    <div data-schedule-grid onKeyDown={(e) => {
      if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') {
        const input = e.target as HTMLInputElement;
        if (input.type === 'time') e.preventDefault();
      }
    }}>
      <WeeklyScheduleGrid
        days={days}
        onChange={setDays}
        showCopyControls
        formFieldNames
      />
    </div>
  );
}
