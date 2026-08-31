'use client';

import type { ScheduleDayValue } from '@/src/workforce/lib/scheduleEditor';
import { ShiftScheduleSection } from '@/src/workforce/components/ShiftScheduleSection';

type Props = {
  initial?: ScheduleDayValue[];
};

/** Inline working-hours inputs for employee create / embedded forms. */
export function WorkingHoursFields({ initial }: Props) {
  return (
    <ShiftScheduleSection
      initialSchedule={initial}
      showWeekOffPicker={false}
      formFieldNames
    />
  );
}
