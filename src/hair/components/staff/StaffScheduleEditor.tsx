'use client';

import { useActionState } from 'react';
import {
  saveStaffDayScheduleAction,
  type ScheduleActionState,
} from '@/src/hair/actions/staffSchedules';
import { Button } from '@/src/hair/components/ui/button';
import { Input } from '@/src/hair/components/ui/input';
import type { StaffScheduleRow } from '@/src/hair/services/staffSchedules';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const initial: ScheduleActionState = {};

export function StaffScheduleEditor({
  staffId,
  staffName,
  schedules,
}: {
  staffId: string;
  staffName: string;
  schedules: StaffScheduleRow[];
}) {
  const byDay = new Map(schedules.map((s) => [s.dayOfWeek, s]));

  return (
    <details className="fyh-glass group p-3">
      <summary className="cursor-pointer text-sm font-medium">
        Weekly schedule — {staffName}
      </summary>
      <div className="mt-3 space-y-3">
        {DAY_LABELS.map((label, dayOfWeek) => {
          const row = byDay.get(dayOfWeek);
          return (
            <ScheduleDayForm
              key={dayOfWeek}
              staffId={staffId}
              dayOfWeek={dayOfWeek}
              label={label}
              defaultStart={row?.startTime ?? '10:00'}
              defaultEnd={row?.endTime ?? '19:00'}
              defaultOff={row?.isOff ?? false}
            />
          );
        })}
      </div>
    </details>
  );
}

function ScheduleDayForm({
  staffId,
  dayOfWeek,
  label,
  defaultStart,
  defaultEnd,
  defaultOff,
}: {
  staffId: string;
  dayOfWeek: number;
  label: string;
  defaultStart: string;
  defaultEnd: string;
  defaultOff: boolean;
}) {
  const [state, action, pending] = useActionState(saveStaffDayScheduleAction, initial);

  return (
    <form action={action} className="grid gap-2 rounded-md bg-black/20 p-3 sm:grid-cols-6 sm:items-end">
      <input type="hidden" name="staffId" value={staffId} />
      <input type="hidden" name="dayOfWeek" value={String(dayOfWeek)} />
      <p className="text-xs font-medium uppercase tracking-wide text-fyh-text-muted sm:col-span-1">
        {label}
      </p>
      <label className="space-y-1 text-xs sm:col-span-1">
        <span className="text-fyh-text-muted">Start</span>
        <Input name="startTime" defaultValue={defaultStart} className="h-9" />
      </label>
      <label className="space-y-1 text-xs sm:col-span-1">
        <span className="text-fyh-text-muted">End</span>
        <Input name="endTime" defaultValue={defaultEnd} className="h-9" />
      </label>
      <label className="flex items-center gap-2 text-xs sm:col-span-2">
        <input type="checkbox" name="isOff" value="1" defaultChecked={defaultOff} />
        Day off
      </label>
      <div className="sm:col-span-1">
        <Button type="submit" size="sm" variant="secondary" disabled={pending} className="w-full">
          Save
        </Button>
      </div>
      {state.success ? (
        <p className="text-xs text-fyh-success sm:col-span-6">{state.success}</p>
      ) : null}
      {state.error ? <p className="text-xs text-fyh-danger sm:col-span-6">{state.error}</p> : null}
    </form>
  );
}
