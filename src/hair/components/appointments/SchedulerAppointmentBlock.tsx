'use client';

import { useCallback, useRef, useState, type CSSProperties } from 'react';
import { FYH_APPOINTMENT_STATUS_COLORS } from '@/src/hair/lib/appointmentStatus';
import type { CalendarAppointment } from './calendarTypes';
import { SLOT_MIN, SLOT_WIDTH_PX, snapMinutes } from './schedulerConstants';
import { ApptCardBody } from './schedulerUi';
import { minutesInSalonTz, salonDayKeyFromUtc, utcFromDayAndMinutes } from './schedulerTime';

type Props = {
  appt: CalendarAppointment;
  dayStartHour: number;
  dayEndHour: number;
  timezone: string;
  onSelect: (id: string) => void;
  onResize: (id: string, startAt: Date, endAt: Date) => void;
  disabled?: boolean;
};

export function SchedulerAppointmentBlock({
  appt,
  dayStartHour,
  dayEndHour,
  timezone,
  onSelect,
  onResize,
  disabled,
}: Props) {
  const [preview, setPreview] = useState<{ start: Date; end: Date } | null>(null);
  const dragRef = useRef<{
    edge: 'left' | 'right';
    startX: number;
    origStart: number;
    origEnd: number;
  } | null>(null);

  const displayStart = preview?.start ?? new Date(appt.startAt);
  const displayEnd = preview?.end ?? new Date(appt.endAt);

  const dayStartMins = dayStartHour * 60;
  const dayEndMins = dayEndHour * 60;
  const dayKey = salonDayKeyFromUtc(new Date(appt.startAt), timezone);
  const minStartMs = utcFromDayAndMinutes(dayKey, dayStartMins, timezone).getTime();
  const maxEndMs = utcFromDayAndMinutes(dayKey, dayEndMins, timezone).getTime();

  const clampResize = useCallback(
    (startMs: number, endMs: number, edge: 'left' | 'right') => {
      let s = startMs;
      let e = endMs;
      if (e - s < SLOT_MIN * 60_000) {
        if (edge === 'left') s = e - SLOT_MIN * 60_000;
        else e = s + SLOT_MIN * 60_000;
      }
      s = Math.max(s, minStartMs);
      e = Math.min(e, maxEndMs);
      if (e - s < SLOT_MIN * 60_000) return null;
      return { startMs: s, endMs: e };
    },
    [minStartMs, maxEndMs],
  );

  const startMins = minutesInSalonTz(displayStart, timezone);
  const endMins = minutesInSalonTz(displayEnd, timezone);
  const slotIndex = (startMins - dayStartMins) / SLOT_MIN;
  const left = slotIndex * SLOT_WIDTH_PX;
  const width = Math.max(SLOT_WIDTH_PX, ((endMins - startMins) / SLOT_MIN) * SLOT_WIDTH_PX);

  const colors = FYH_APPOINTMENT_STATUS_COLORS[appt.status];

  const style: CSSProperties = {
    left,
    width,
    background: colors.bg,
    color: colors.fg,
    borderColor: colors.border,
    zIndex: preview ? 25 : 10,
  };

  const onPointerDown = useCallback(
    (edge: 'left' | 'right', e: React.PointerEvent) => {
      if (disabled) return;
      e.stopPropagation();
      e.preventDefault();
      const origStart = new Date(appt.startAt).getTime();
      const origEnd = new Date(appt.endAt).getTime();
      dragRef.current = { edge, startX: e.clientX, origStart, origEnd };

      const onMove = (ev: PointerEvent) => {
        const drag = dragRef.current;
        if (!drag) return;
        const deltaX = ev.clientX - drag.startX;
        const deltaMins = snapMinutes((deltaX / SLOT_WIDTH_PX) * SLOT_MIN);
        if (drag.edge === 'right') {
          const nextEnd = drag.origEnd + deltaMins * 60_000;
          const clamped = clampResize(drag.origStart, nextEnd, 'right');
          if (clamped) {
            setPreview({
              start: new Date(clamped.startMs),
              end: new Date(clamped.endMs),
            });
          }
        } else {
          const nextStart = drag.origStart + deltaMins * 60_000;
          const clamped = clampResize(nextStart, drag.origEnd, 'left');
          if (clamped) {
            setPreview({
              start: new Date(clamped.startMs),
              end: new Date(clamped.endMs),
            });
          }
        }
      };

      const onUp = (ev: PointerEvent) => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        const drag = dragRef.current;
        dragRef.current = null;
        setPreview(null);
        if (!drag) return;
        const deltaX = ev.clientX - drag.startX;
        const deltaMins = snapMinutes((deltaX / SLOT_WIDTH_PX) * SLOT_MIN);
        if (deltaMins === 0) return;

        if (drag.edge === 'right') {
          const nextEnd = drag.origEnd + deltaMins * 60_000;
          const clamped = clampResize(drag.origStart, nextEnd, 'right');
          if (clamped) {
            onResize(appt.id, new Date(clamped.startMs), new Date(clamped.endMs));
          }
        } else {
          const nextStart = drag.origStart + deltaMins * 60_000;
          const clamped = clampResize(nextStart, drag.origEnd, 'left');
          if (clamped) {
            onResize(appt.id, new Date(clamped.startMs), new Date(clamped.endMs));
          }
        }
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [appt.id, appt.endAt, appt.startAt, clampResize, disabled, onResize],
  );

  return (
    <div
      className="absolute top-1 bottom-1 overflow-hidden rounded-lg border px-1 py-0.5 shadow-sm"
      style={style}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(appt.id);
      }}
    >
      {!disabled ? (
        <div
          className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize z-10"
          onPointerDown={(e) => onPointerDown('left', e)}
        />
      ) : null}
      <div className="min-w-0 pointer-events-none">
        <ApptCardBody
          appt={{
            ...appt,
            startAt: displayStart.toISOString(),
            endAt: displayEnd.toISOString(),
          }}
          compact
          timezone={timezone}
        />
      </div>
      {!disabled ? (
        <div
          className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize z-10"
          onPointerDown={(e) => onPointerDown('right', e)}
        />
      ) : null}
    </div>
  );
}
