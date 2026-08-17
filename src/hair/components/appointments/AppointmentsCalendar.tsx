'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { rescheduleAppointmentAction } from '@/src/hair/actions/appointments';
import { Button } from '@/src/hair/components/ui/button';
import { FYH_APPOINTMENT_STATUS_COLORS } from '@/src/hair/lib/appointmentStatus';
import { cn } from '@/src/hair/lib/utils';
import { AppointmentCreateModal } from './AppointmentCreateModal';
import { AppointmentDetailDrawer } from './AppointmentDetailDrawer';
import { AppointmentEditDrawer } from './AppointmentEditDrawer';
import type {
  CalendarAppointment,
  CreateSlotPrefill,
  CustomerOpt,
  ResourceOpt,
  ServiceOpt,
  StaffOpt,
} from './calendarTypes';
import { ResourceColumnSchedulerGrid } from './ResourceColumnSchedulerGrid';
import { StaffDaySchedulerGrid } from './StaffDaySchedulerGrid';
import { ApptCardBody } from './schedulerUi';
import { addDaysIso, formatHmInSalonTz, salonDayKeyFromUtc, weekDayKeys } from './schedulerTime';
import { formatSalonDisplayDate } from '@/src/hair/lib/formatSalonDate';

type ViewMode = 'day' | 'week' | 'timeline' | 'chair' | 'stylist';

type Props = {
  initialAppointments: CalendarAppointment[];
  staff: StaffOpt[];
  resources: ResourceOpt[];
  customers: CustomerOpt[];
  services: ServiceOpt[];
  dayIso: string;
  timezone: string;
  dayStartHour?: number;
  dayEndHour?: number;
  preselectCustomerId?: string | null;
};

export function AppointmentsCalendar({
  initialAppointments,
  staff,
  resources,
  customers,
  services,
  dayIso,
  timezone,
  dayStartHour = 10,
  dayEndHour = 20,
  preselectCustomerId = null,
}: Props) {
  const dayStart = Math.max(0, Math.min(23, dayStartHour));
  const dayEnd = Math.max(dayStart + 1, Math.min(24, dayEndHour));

  const router = useRouter();
  const [view, setView] = useState<ViewMode>('day');
  const [appointments, setAppointments] = useState(initialAppointments);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showEdit, setShowEdit] = useState(false);
  const [createPrefill, setCreatePrefill] = useState<CreateSlotPrefill | null>(null);
  const [showCreateToolbar, setShowCreateToolbar] = useState(Boolean(preselectCustomerId));
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setAppointments(initialAppointments);
  }, [initialAppointments]);

  const selected = appointments.find((a) => a.id === selectedId) ?? null;

  const dayAppts = useMemo(
    () =>
      appointments.filter(
        (a) => salonDayKeyFromUtc(new Date(a.startAt), timezone) === dayIso,
      ),
    [appointments, dayIso, timezone],
  );

  const applyReschedule = useCallback(
    async (input: {
      id: string;
      startAtIso: string;
      endAtIso?: string;
      staffId?: string;
      resourceId?: string | null;
    }) => {
      setError(null);
      const prev = appointments;
      setAppointments((list) =>
        list.map((a) => {
          if (a.id !== input.id) return a;
          const startAt = input.startAtIso;
          const endAt =
            input.endAtIso ??
            new Date(
              new Date(startAt).getTime() +
                (new Date(a.endAt).getTime() - new Date(a.startAt).getTime()),
            ).toISOString();
          const staffRow = staff.find((s) => s.id === (input.staffId ?? a.staffId));
          const resourceRow =
            input.resourceId === undefined
              ? undefined
              : resources.find((r) => r.id === input.resourceId);
          return {
            ...a,
            startAt,
            endAt,
            staffId: input.staffId ?? a.staffId,
            staffName: staffRow?.fullName ?? a.staffName,
            resourceId: input.resourceId === undefined ? a.resourceId : input.resourceId,
            resourceName:
              input.resourceId === undefined ? a.resourceName : (resourceRow?.name ?? null),
            durationMinutes: Math.max(
              1,
              Math.round((new Date(endAt).getTime() - new Date(startAt).getTime()) / 60_000),
            ),
          };
        }),
      );
      const res = await rescheduleAppointmentAction(input);
      if (res.error) {
        setAppointments(prev);
        setError(res.error);
        return;
      }
      setFlash(res.success ?? 'Updated');
      router.refresh();
    },
    [appointments, resources, router, staff],
  );

  const onResize = (id: string, startAt: Date, endAt: Date) => {
    void applyReschedule({
      id,
      startAtIso: startAt.toISOString(),
      endAtIso: endAt.toISOString(),
    });
  };

  const onSlotClick = (prefill: CreateSlotPrefill) => {
    setCreatePrefill(prefill);
    setShowCreateToolbar(false);
  };

  const createOpen = Boolean(createPrefill) || showCreateToolbar;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="fyh-section-eyebrow">Floor</p>
          <h1 className="fyh-display mt-1 font-semibold">Appointments</h1>
          <p className="mt-1 text-sm text-fyh-text-secondary">
            Click empty slots to book · drag edges to resize · Raise Sale from detail
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => router.push(`/appointments?date=${addDaysIso(dayIso, -1)}`)}
          >
            Prev
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => router.push('/appointments')}>
            Today
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => router.push(`/appointments?date=${addDaysIso(dayIso, 1)}`)}
          >
            Next
          </Button>
          <span className="px-2 text-sm font-semibold tabular-nums text-fyh-text">
            {formatSalonDisplayDate(dayIso)}
          </span>
          <Button
            type="button"
            size="sm"
            onClick={() => {
              setCreatePrefill(null);
              setShowCreateToolbar(true);
            }}
          >
            New appointment
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-1">
        {(
          [
            ['day', 'Day'],
            ['week', 'Week'],
            ['timeline', 'Timeline'],
            ['chair', 'Chair'],
            ['stylist', 'Stylist'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setView(id)}
            className={cn(
              'rounded-lg px-2.5 py-1 text-xs font-semibold transition',
              view === id ? 'fyh-scheduler-tab-active' : 'fyh-scheduler-tab',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {error ? (
        <div className="rounded-xl border border-fyh-danger/40 bg-fyh-danger/10 px-4 py-2 text-sm text-fyh-danger">
          {error}
        </div>
      ) : null}
      {flash ? (
        <div className="rounded-xl border border-fyh-success/30 bg-fyh-success/10 px-4 py-2 text-sm text-fyh-success">
          {flash}
        </div>
      ) : null}

      {view === 'day' || view === 'stylist' ? (
        <StaffDaySchedulerGrid
          staff={staff}
          appointments={appointments}
          dayIso={dayIso}
          dayStartHour={dayStart}
          dayEndHour={dayEnd}
          timezone={timezone}
          onSlotClick={onSlotClick}
          onSelectAppointment={setSelectedId}
          onResize={onResize}
        />
      ) : null}

      {view === 'chair' ? (
        <ResourceColumnSchedulerGrid
          resources={resources}
          appointments={appointments}
          dayIso={dayIso}
          dayStartHour={dayStart}
          dayEndHour={dayEnd}
          onSelectAppointment={setSelectedId}
          onReschedule={applyReschedule}
        />
      ) : null}

      {view === 'week' ? (
        <div className="grid gap-3 md:grid-cols-7">
          {weekDayKeys(dayIso).map((d) => {
            const list = appointments.filter(
              (a) => salonDayKeyFromUtc(new Date(a.startAt), timezone) === d,
            );
            return (
              <button
                key={d}
                type="button"
                onClick={() => router.push(`/appointments?date=${d}`)}
                className={cn(
                  'fyh-glass space-y-2 p-3 text-left',
                  d === dayIso && 'ring-1 ring-fyh-accent/40',
                )}
              >
                <p className="text-xs font-semibold text-fyh-text">{formatSalonDisplayDate(d)}</p>
                {list.length === 0 ? (
                  <p className="text-xs text-fyh-text-muted">Empty</p>
                ) : (
                  list.map((a) => (
                    <div
                      key={a.id}
                      className="rounded-lg border px-2 py-1"
                      style={{
                        background: FYH_APPOINTMENT_STATUS_COLORS[a.status].bg,
                        color: FYH_APPOINTMENT_STATUS_COLORS[a.status].fg,
                        borderColor: FYH_APPOINTMENT_STATUS_COLORS[a.status].border,
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedId(a.id);
                      }}
                    >
                      <ApptCardBody appt={a} compact timezone={timezone} />
                    </div>
                  ))
                )}
              </button>
            );
          })}
        </div>
      ) : null}

      {view === 'timeline' ? (
        <div className="fyh-glass space-y-2 p-4">
          {dayAppts.length === 0 ? (
            <p className="py-8 text-center text-sm text-fyh-text-muted">No appointments this day.</p>
          ) : (
            [...dayAppts]
              .sort((a, b) => a.startAt.localeCompare(b.startAt))
              .map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setSelectedId(a.id)}
                  className="flex w-full items-start gap-3 rounded-xl border px-3 py-2 text-left"
                  style={{
                    background: FYH_APPOINTMENT_STATUS_COLORS[a.status].bg,
                    color: FYH_APPOINTMENT_STATUS_COLORS[a.status].fg,
                    borderColor: FYH_APPOINTMENT_STATUS_COLORS[a.status].border,
                  }}
                >
                  <span className="w-24 shrink-0 text-sm tabular-nums">
                    {formatHmInSalonTz(new Date(a.startAt), timezone)}
                  </span>
                  <ApptCardBody appt={a} timezone={timezone} />
                </button>
              ))
          )}
        </div>
      ) : null}

      <AppointmentCreateModal
        open={createOpen}
        onClose={() => {
          setCreatePrefill(null);
          setShowCreateToolbar(false);
        }}
        prefill={createPrefill}
        staff={staff}
        timezone={timezone}
        preselectCustomerId={preselectCustomerId}
        onSuccess={() => {
          setFlash('Appointment created');
          router.refresh();
        }}
      />

      {selected && !showEdit ? (
        <AppointmentDetailDrawer
          appointment={selected}
          customers={customers}
          timezone={timezone}
          onClose={() => setSelectedId(null)}
          onEdit={() => setShowEdit(true)}
          onFlash={setFlash}
          onError={setError}
          onRefresh={() => router.refresh()}
        />
      ) : null}

      {selected && showEdit ? (
        <AppointmentEditDrawer
          appointment={selected}
          staff={staff}
          resources={resources}
          customers={customers}
          services={services}
          timezone={timezone}
          dayStartHour={dayStart}
          dayEndHour={dayEnd}
          onClose={() => setShowEdit(false)}
          onFlash={setFlash}
          onError={setError}
          onRefresh={() => router.refresh()}
        />
      ) : null}
    </div>
  );
}

// Re-export type for page compatibility
export type { CalendarAppointment } from './calendarTypes';
