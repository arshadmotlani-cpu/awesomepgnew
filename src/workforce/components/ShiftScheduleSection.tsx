'use client';

import { useCallback, useState } from 'react';
import { DEFAULT_WEEK_SCHEDULE, weekOffDaysFromSchedule } from '@/src/workforce/lib/weekOff';
import {
  normalizeScheduleDays,
  syncScheduleWithWeekOff,
  type ScheduleDayState,
} from '@/src/workforce/lib/scheduleEditor';
import { WeekOffPicker } from '@/src/workforce/components/WeekOffPicker';
import { WeeklyScheduleGrid } from '@/src/workforce/components/WeeklyScheduleGrid';

type Props = {
  initialSchedule?: ScheduleDayState[];
  readOnly?: boolean;
  showWeekOffPicker?: boolean;
  /** Emit hidden day_* and weekOff fields for a parent <form>. */
  formFieldNames?: boolean;
  weekOffName?: string;
};

/**
 * Unified shift schedule — weekly off days and per-day working hours stay in sync.
 */
export function ShiftScheduleSection({
  initialSchedule,
  readOnly = false,
  showWeekOffPicker = true,
  formFieldNames = false,
  weekOffName = 'weekOff',
}: Props) {
  const [days, setDays] = useState<ScheduleDayState[]>(() =>
    normalizeScheduleDays(initialSchedule ?? DEFAULT_WEEK_SCHEDULE),
  );

  const weekOffDays = weekOffDaysFromSchedule(days);

  const handleWeekOffChange = useCallback((offDays: number[]) => {
    setDays((current) => syncScheduleWithWeekOff(current, offDays));
  }, []);

  const handleDaysChange = useCallback((next: ScheduleDayState[]) => {
    setDays(next);
  }, []);

  return (
    <div className="space-y-6">
      {showWeekOffPicker ? (
        <WeekOffPicker
          name={weekOffName}
          offDays={weekOffDays}
          onChange={handleWeekOffChange}
          readOnly={readOnly}
          useFormNames={false}
        />
      ) : null}

      {formFieldNames
        ? weekOffDays.map((day) => (
            <input key={day} type="hidden" name={weekOffName} value={day} />
          ))
        : null}

      <div
        data-schedule-grid
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') {
            const input = e.target as HTMLInputElement;
            if (input.type === 'time') e.preventDefault();
          }
        }}
      >
        <WeeklyScheduleGrid
          days={days}
          onChange={handleDaysChange}
          readOnly={readOnly}
          showCopyControls={!readOnly}
          formFieldNames={formFieldNames}
        />
      </div>
    </div>
  );
}
