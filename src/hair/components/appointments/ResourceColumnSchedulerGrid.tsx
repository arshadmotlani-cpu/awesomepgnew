'use client';

import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { FYH_APPOINTMENT_STATUS_COLORS, isActiveCalendarStatus } from '@/src/hair/lib/appointmentStatus';
import { cn } from '@/src/hair/lib/utils';
import type { CalendarAppointment, ResourceOpt } from './calendarTypes';
import { ApptCardBody } from './schedulerUi';

/** Legacy vertical column grid for chair view (15-min slots). */
const SLOT_MIN = 15;
const PX_PER_MIN = 1.6;

function gridMetrics(dayStartHour: number, dayEndHour: number) {
  const totalMin = (dayEndHour - dayStartHour) * 60;
  return { totalMin, gridH: totalMin * PX_PER_MIN };
}

function snapMinutes(mins: number) {
  return Math.round(mins / SLOT_MIN) * SLOT_MIN;
}

function minutesFromMidnight(d: Date) {
  return d.getHours() * 60 + d.getMinutes();
}

function parseDay(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y!, m! - 1, d!, 0, 0, 0, 0);
}

function setTimeOnDay(dayIso: string, minutes: number) {
  const d = parseDay(dayIso);
  d.setHours(0, 0, 0, 0);
  d.setMinutes(minutes);
  return d;
}

function topFromStart(start: Date, dayStartHour: number) {
  const mins = minutesFromMidnight(start) - dayStartHour * 60;
  return Math.max(0, mins) * PX_PER_MIN;
}

function heightFromDuration(mins: number) {
  return Math.max(SLOT_MIN * PX_PER_MIN, mins * PX_PER_MIN);
}

function DraggableAppt({
  appt,
  dayStartHour,
  onSelect,
  onResizeEnd,
  disabled,
}: {
  appt: CalendarAppointment;
  dayStartHour: number;
  onSelect: (id: string) => void;
  onResizeEnd: (id: string, endAt: Date) => void;
  disabled?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: appt.id,
    disabled,
    data: { appt },
  });
  const colors = FYH_APPOINTMENT_STATUS_COLORS[appt.status];
  const start = new Date(appt.startAt);
  const end = new Date(appt.endAt);
  const top = topFromStart(start, dayStartHour);
  const height = heightFromDuration(Math.max(SLOT_MIN, (end.getTime() - start.getTime()) / 60_000));

  const style: CSSProperties = {
    top,
    height,
    background: colors.bg,
    color: colors.fg,
    borderColor: colors.border,
    opacity: isDragging ? 0.35 : 1,
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    zIndex: isDragging ? 30 : 10,
  };

  return (
    <div
      ref={setNodeRef}
      className="absolute inset-x-1 overflow-hidden rounded-lg border px-1.5 py-1 shadow-sm"
      style={style}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(appt.id);
      }}
    >
      <div className="cursor-grab active:cursor-grabbing" {...listeners} {...attributes}>
        <ApptCardBody appt={appt} compact />
      </div>
      {!disabled ? (
        <div
          className="absolute inset-x-0 bottom-0 h-2 cursor-ns-resize"
          onPointerDown={(e) => {
            e.stopPropagation();
            e.preventDefault();
            const startY = e.clientY;
            const origEnd = new Date(appt.endAt).getTime();
            const onMove = (ev: PointerEvent) => {
              const dy = ev.clientY - startY;
              const deltaMins = snapMinutes(dy / PX_PER_MIN);
              const next = new Date(origEnd + deltaMins * 60_000);
              const minEnd = new Date(appt.startAt).getTime() + SLOT_MIN * 60_000;
              if (next.getTime() >= minEnd) {
                (e.currentTarget as HTMLElement).dataset.preview = next.toISOString();
              }
            };
            const onUp = (ev: PointerEvent) => {
              window.removeEventListener('pointermove', onMove);
              window.removeEventListener('pointerup', onUp);
              const dy = ev.clientY - startY;
              const deltaMins = snapMinutes(dy / PX_PER_MIN);
              const next = new Date(origEnd + deltaMins * 60_000);
              const minEnd = new Date(appt.startAt).getTime() + SLOT_MIN * 60_000;
              if (next.getTime() >= minEnd && deltaMins !== 0) onResizeEnd(appt.id, next);
            };
            window.addEventListener('pointermove', onMove);
            window.addEventListener('pointerup', onUp);
          }}
        />
      ) : null}
    </div>
  );
}

function ColumnDrop({
  id,
  label,
  dayStartHour,
  dayEndHour,
  children,
}: {
  id: string;
  label: string;
  dayStartHour: number;
  dayEndHour: number;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const { gridH } = gridMetrics(dayStartHour, dayEndHour);
  const totalMin = (dayEndHour - dayStartHour) * 60;
  return (
    <div className="min-w-[9.5rem] flex-1">
      <div className="sticky top-0 z-20 fyh-scheduler-header border-b px-2 py-2 text-center text-xs fyh-scheduler-staff-label backdrop-blur">
        {label}
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          'relative border-r border-[color:var(--fyh-scheduler-grid-major)]',
          isOver && 'bg-fyh-forest/10',
        )}
        style={{ height: gridH }}
      >
        {Array.from({ length: totalMin / SLOT_MIN }, (_, i) => (
          <div
            key={i}
            className="pointer-events-none absolute inset-x-0 border-t border-[color:var(--fyh-scheduler-grid-line)]"
            style={{ top: i * SLOT_MIN * PX_PER_MIN }}
          />
        ))}
        {children}
      </div>
    </div>
  );
}

function TimeGutter({ dayStartHour, dayEndHour }: { dayStartHour: number; dayEndHour: number }) {
  const { gridH } = gridMetrics(dayStartHour, dayEndHour);
  return (
    <div className="sticky left-0 z-30 w-14 shrink-0 bg-[color:var(--fyh-scheduler-staff-bg)]">
      <div className="h-[37px] border-b border-[color:var(--fyh-scheduler-grid-major)]" />
      <div className="relative" style={{ height: gridH }}>
        {Array.from({ length: dayEndHour - dayStartHour + 1 }, (_, i) => {
          const h = dayStartHour + i;
          return (
            <div
              key={h}
              className="fyh-scheduler-time-label absolute right-2 -translate-y-1/2 text-xs tabular-nums"
              style={{ top: i * 60 * PX_PER_MIN }}
            >
              {String(h).padStart(2, '0')}:00
            </div>
          );
        })}
      </div>
    </div>
  );
}

type Props = {
  resources: ResourceOpt[];
  appointments: CalendarAppointment[];
  dayIso: string;
  dayStartHour: number;
  dayEndHour: number;
  onSelectAppointment: (id: string) => void;
  onReschedule: (input: {
    id: string;
    startAtIso: string;
    endAtIso: string;
    resourceId?: string | null;
  }) => void;
};

export function ResourceColumnSchedulerGrid({
  resources,
  appointments,
  dayIso,
  dayStartHour,
  dayEndHour,
  onSelectAppointment,
  onReschedule,
}: Props) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const dayAppts = useMemo(
    () => appointments.filter((a) => a.startAt.slice(0, 10) === dayIso),
    [appointments, dayIso],
  );

  const columns = resources.map((r) => ({ id: r.id, label: r.name }));
  const activeAppt = appointments.find((a) => a.id === activeId);

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));

  const onDragEnd = async (e: DragEndEvent) => {
    setActiveId(null);
    const appt = appointments.find((a) => a.id === e.active.id);
    if (!appt || !isActiveCalendarStatus(appt.status)) return;
    const overId = e.over?.id ? String(e.over.id) : null;
    if (!overId) return;

    const duration = new Date(appt.endAt).getTime() - new Date(appt.startAt).getTime();
    const deltaMins = snapMinutes(e.delta.y / PX_PER_MIN);
    let startMins = minutesFromMidnight(new Date(appt.startAt)) + deltaMins;
    startMins = Math.max(dayStartHour * 60, Math.min(dayEndHour * 60 - SLOT_MIN, startMins));
    startMins = snapMinutes(startMins);

    const startAt = setTimeOnDay(dayIso, startMins);
    const endAt = new Date(startAt.getTime() + duration);

    onReschedule({
      id: appt.id,
      startAtIso: startAt.toISOString(),
      endAtIso: endAt.toISOString(),
      resourceId: overId,
    });
  };

  const onResizeEnd = (id: string, endAt: Date) => {
    const appt = appointments.find((a) => a.id === id);
    if (!appt) return;
    onReschedule({
      id,
      startAtIso: appt.startAt,
      endAtIso: endAt.toISOString(),
    });
  };

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className="fyh-scheduler overflow-auto">
        <div className="flex min-w-max">
          <TimeGutter dayStartHour={dayStartHour} dayEndHour={dayEndHour} />
          {columns.length === 0 ? (
            <div className="flex h-40 flex-1 items-center justify-center text-sm text-fyh-text-muted">
              No chairs / resources yet.
            </div>
          ) : (
            columns.map((col) => (
              <ColumnDrop
                key={col.id}
                id={col.id}
                label={col.label}
                dayStartHour={dayStartHour}
                dayEndHour={dayEndHour}
              >
                {dayAppts
                  .filter((a) => a.resourceId === col.id)
                  .map((a) => (
                    <DraggableAppt
                      key={a.id}
                      appt={a}
                      dayStartHour={dayStartHour}
                      onSelect={onSelectAppointment}
                      onResizeEnd={onResizeEnd}
                      disabled={!isActiveCalendarStatus(a.status)}
                    />
                  ))}
              </ColumnDrop>
            ))
          )}
        </div>
      </div>
      <DragOverlay>
        {activeAppt ? (
          <div
            className="w-40 rounded-lg border px-2 py-1 shadow-lg"
            style={{
              background: FYH_APPOINTMENT_STATUS_COLORS[activeAppt.status].bg,
              color: FYH_APPOINTMENT_STATUS_COLORS[activeAppt.status].fg,
              borderColor: FYH_APPOINTMENT_STATUS_COLORS[activeAppt.status].border,
            }}
          >
            <ApptCardBody appt={activeAppt} compact />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
