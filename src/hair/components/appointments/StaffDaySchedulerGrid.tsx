'use client';

import { useMemo } from 'react';
import { isActiveCalendarStatus } from '@/src/hair/lib/appointmentStatus';
import { cn } from '@/src/hair/lib/utils';
import type { CalendarAppointment, CreateSlotPrefill, StaffOpt } from './calendarTypes';
import { SchedulerAppointmentBlock } from './SchedulerAppointmentBlock';
import {
  SLOT_MIN,
  SLOT_WIDTH_PX,
  STAFF_COL_WIDTH_PX,
  STAFF_ROW_HEIGHT_PX,
  TIME_HEADER_HEIGHT_PX,
  minutesToSlotLabel,
  slotCountBetween,
} from './schedulerConstants';
import { staffInitials } from './schedulerUi';
import {
  minutesInSalonTz,
  salonDayKeyFromUtc,
} from './schedulerTime';

type Props = {
  staff: StaffOpt[];
  appointments: CalendarAppointment[];
  dayIso: string;
  dayStartHour: number;
  dayEndHour: number;
  timezone: string;
  onSlotClick: (prefill: CreateSlotPrefill) => void;
  onSelectAppointment: (id: string) => void;
  onResize: (id: string, startAt: Date, endAt: Date) => void;
};

export function StaffDaySchedulerGrid({
  staff,
  appointments,
  dayIso,
  dayStartHour,
  dayEndHour,
  timezone,
  onSlotClick,
  onSelectAppointment,
  onResize,
}: Props) {
  const slotCount = slotCountBetween(dayStartHour, dayEndHour);
  const gridWidth = slotCount * SLOT_WIDTH_PX;
  const dayStartMins = dayStartHour * 60;

  const todayKey = salonDayKeyFromUtc(new Date(), timezone);
  const showNowLine = dayIso === todayKey;

  const nowLeft = useMemo(() => {
    if (!showNowLine) return null;
    const nowMins = minutesInSalonTz(new Date(), timezone);
    if (nowMins < dayStartMins || nowMins > dayEndHour * 60) return null;
    const slotIndex = (nowMins - dayStartMins) / SLOT_MIN;
    return slotIndex * SLOT_WIDTH_PX;
  }, [showNowLine, dayStartMins, dayEndHour, timezone]);

  const dayAppts = useMemo(
    () =>
      appointments.filter(
        (a) => salonDayKeyFromUtc(new Date(a.startAt), timezone) === dayIso,
      ),
    [appointments, dayIso, timezone],
  );

  const slots = Array.from({ length: slotCount }, (_, i) => dayStartMins + i * SLOT_MIN);

  if (staff.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-fyh-text-muted">
        No stylists yet.
      </div>
    );
  }

  return (
    <div className="fyh-scheduler overflow-auto max-h-[calc(100vh-14rem)]">
      <div className="min-w-max">
        {/* Header row */}
        <div className="fyh-scheduler-header sticky top-0 z-30 flex">
          <div
            className="fyh-scheduler-staff-col fyh-scheduler-staff-label sticky left-0 z-40 shrink-0 px-3 flex items-center text-xs"
            style={{ width: STAFF_COL_WIDTH_PX, height: TIME_HEADER_HEIGHT_PX }}
          >
            Stylist
          </div>
          <div className="relative" style={{ width: gridWidth, height: TIME_HEADER_HEIGHT_PX }}>
            {slots.map((mins, i) => (
              <div
                key={mins}
                className="fyh-scheduler-time-label fyh-scheduler-grid-slot absolute top-0 flex items-center justify-center text-[11px]"
                style={{
                  left: i * SLOT_WIDTH_PX,
                  width: SLOT_WIDTH_PX,
                  height: TIME_HEADER_HEIGHT_PX,
                }}
              >
                {minutesToSlotLabel(mins)}
              </div>
            ))}
          </div>
        </div>

        {/* Staff rows */}
        {staff.map((s) => {
          const rowAppts = dayAppts.filter((a) => a.staffId === s.id);
          return (
            <div
              key={s.id}
              className="fyh-scheduler-row flex"
              style={{ height: STAFF_ROW_HEIGHT_PX }}
            >
              <div
                className="fyh-scheduler-staff-col sticky left-0 z-20 shrink-0 flex items-center gap-2 px-2"
                style={{ width: STAFF_COL_WIDTH_PX }}
              >
                {s.photoUrl ? (
                  <img
                    src={s.photoUrl}
                    alt=""
                    className="h-8 w-8 shrink-0 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--fyh-accent)_22%,transparent)] text-[10px] font-semibold text-fyh-text">
                    {staffInitials(s.fullName)}
                  </div>
                )}
                <span className="fyh-scheduler-staff-label truncate text-xs">{s.fullName}</span>
              </div>

              <div
                className="relative"
                style={{ width: gridWidth, height: STAFF_ROW_HEIGHT_PX }}
              >
                {/* Slot hit targets */}
                {slots.map((mins, i) => (
                  <button
                    key={mins}
                    type="button"
                    className={cn(
                      'fyh-scheduler-grid-slot absolute top-0 bottom-0 hover:bg-[color-mix(in_srgb,var(--fyh-accent)_12%,transparent)] transition-colors',
                    )}
                    style={{
                      left: i * SLOT_WIDTH_PX,
                      width: SLOT_WIDTH_PX,
                    }}
                    onClick={() =>
                      onSlotClick({ dayIso, staffId: s.id, startMinutes: mins })
                    }
                    aria-label={`Book ${s.fullName} at ${minutesToSlotLabel(mins)}`}
                  />
                ))}

                {showNowLine && nowLeft !== null ? (
                  <div
                    className="fyh-scheduler-now-line pointer-events-none absolute top-0 bottom-0 z-20 w-0.5"
                    style={{ left: nowLeft }}
                  />
                ) : null}

                {rowAppts.map((a) => (
                  <SchedulerAppointmentBlock
                    key={a.id}
                    appt={a}
                    dayStartHour={dayStartHour}
                    dayEndHour={dayEndHour}
                    timezone={timezone}
                    onSelect={onSelectAppointment}
                    onResize={onResize}
                    disabled={!isActiveCalendarStatus(a.status)}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
