'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { updateAppointmentAction } from '@/src/hair/actions/appointments';
import { Button } from '@/src/hair/components/ui/button';
import { Input } from '@/src/hair/components/ui/input';
import type { FyhAppointmentStatus } from '@/src/hair/db/schema/appointments';
import { getAllowedAppointmentStatusTransitions } from '@/src/hair/lib/appointmentStatus';
import { formatInrFromPaise } from '@/src/hair/lib/money';
import type {
  CalendarAppointment,
  CustomerOpt,
  ResourceOpt,
  ServiceOpt,
  StaffOpt,
} from './calendarTypes';
import {
  hasCustomAppointmentDuration,
  snapshotDurationMinutes,
} from './schedulerDuration';
import { minutesToSlotLabel } from './schedulerConstants';
import {
  formatHmInSalonTz,
  minutesInSalonTz,
  salonDayKeyFromUtc,
  utcFromDayAndMinutes,
} from './schedulerTime';

type Props = {
  appointment: CalendarAppointment;
  staff: StaffOpt[];
  resources: ResourceOpt[];
  customers: CustomerOpt[];
  services: ServiceOpt[];
  timezone: string;
  dayStartHour: number;
  dayEndHour: number;
  onClose: () => void;
  onFlash: (msg: string) => void;
  onError: (msg: string) => void;
  onRefresh: () => void;
};

export function AppointmentEditDrawer({
  appointment,
  staff,
  resources,
  services,
  timezone,
  dayStartHour,
  dayEndHour,
  onClose,
  onFlash,
  onError,
  onRefresh,
}: Props) {
  const [pending, startTransition] = useTransition();
  const locked = Boolean(appointment.invoiceId);

  const dayIso = salonDayKeyFromUtc(new Date(appointment.startAt), timezone);
  const initialStartMins = minutesInSalonTz(new Date(appointment.startAt), timezone);
  const initialEndMins = minutesInSalonTz(new Date(appointment.endAt), timezone);

  const [staffId, setStaffId] = useState(appointment.staffId);
  const [resourceId, setResourceId] = useState(appointment.resourceId ?? '');
  const [startMinutes, setStartMinutes] = useState(initialStartMins);
  const [endMinutes, setEndMinutes] = useState(initialEndMins);
  const [serviceIds, setServiceIds] = useState(
    appointment.services.map((s) => s.serviceId),
  );
  const [notes, setNotes] = useState(appointment.notes ?? '');
  const [status, setStatus] = useState<FyhAppointmentStatus>(appointment.status);

  useEffect(() => {
    setStaffId(appointment.staffId);
    setResourceId(appointment.resourceId ?? '');
    setStartMinutes(minutesInSalonTz(new Date(appointment.startAt), timezone));
    setEndMinutes(minutesInSalonTz(new Date(appointment.endAt), timezone));
    setServiceIds(appointment.services.map((s) => s.serviceId));
    setNotes(appointment.notes ?? '');
    setStatus(appointment.status);
  }, [appointment, timezone]);

  const hadCustomDuration = hasCustomAppointmentDuration(
    appointment.startAt,
    appointment.endAt,
    appointment.services,
  );

  const catalogDuration = useMemo(() => {
    return serviceIds.reduce((sum, id) => {
      const s = services.find((x) => x.id === id);
      return sum + (s?.durationMinutes ?? 0);
    }, 0);
  }, [serviceIds, services]);

  const previewEndMinutes = useMemo(() => {
    if (hadCustomDuration) return endMinutes;
    if (catalogDuration <= 0) return endMinutes;
    return startMinutes + catalogDuration;
  }, [hadCustomDuration, endMinutes, catalogDuration, startMinutes]);

  const startAtIso = utcFromDayAndMinutes(dayIso, startMinutes, timezone).toISOString();
  const endAtIso = utcFromDayAndMinutes(dayIso, previewEndMinutes, timezone).toISOString();

  const toggleService = (id: string) => {
    if (locked) return;
    setServiceIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const allowedStatuses = useMemo(() => {
    const transitions = getAllowedAppointmentStatusTransitions(appointment.status);
    const set = new Set<FyhAppointmentStatus>([appointment.status, ...transitions]);
    return Array.from(set);
  }, [appointment.status]);

  const onSave = () => {
    if (serviceIds.length === 0) {
      onError('Select at least one service');
      return;
    }
    startTransition(async () => {
      const res = await updateAppointmentAction({
        id: appointment.id,
        staffId,
        resourceId: resourceId || null,
        startAtIso,
        endAtIso: hadCustomDuration ? utcFromDayAndMinutes(dayIso, endMinutes, timezone).toISOString() : endAtIso,
        serviceIds: locked ? undefined : serviceIds,
        notes,
        status,
      });
      if (res.error) onError(res.error);
      else {
        onFlash(res.success ?? 'Saved');
        onRefresh();
        onClose();
      }
    });
  };

  return (
    <div className="fixed inset-0 z-[60] flex justify-end bg-black/50 p-0 sm:p-4">
      <div className="h-full w-full max-w-md overflow-y-auto border-l border-[color:var(--fyh-border)] bg-fyh-elevated p-5 shadow-2xl sm:rounded-2xl sm:border">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="fyh-display text-xl font-semibold">Edit appointment</h2>
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>

        {locked ? (
          <p className="mb-3 text-xs text-fyh-text-secondary">
            Invoice linked — customer and services cannot be changed.
          </p>
        ) : null}

        <div className="space-y-3 text-sm">
          <div className="space-y-1">
            <label className="text-sm text-fyh-text-secondary">Client</label>
            <p className="flex min-h-11 items-center rounded-xl border border-[color:var(--fyh-border)] bg-black/10 px-3 text-sm text-fyh-text">
              {appointment.customerName}
              {appointment.customerPhone ? ` · ${appointment.customerPhone}` : ''}
            </p>
            <p className="text-xs text-fyh-text-muted">
              To change the client, cancel this appointment and create a new one.
            </p>
          </div>

          <div className="space-y-1">
            <label className="text-sm text-fyh-text-secondary">Stylist</label>
            <select
              value={staffId}
              onChange={(e) => setStaffId(e.target.value)}
              className="flex h-11 w-full rounded-xl border border-[color:var(--fyh-border)] bg-black/20 px-3 text-sm text-fyh-text"
            >
              {staff.map((s) => (
                <option key={s.id} value={s.id}>{s.fullName}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-sm text-fyh-text-secondary">Chair / resource</label>
            <select
              value={resourceId}
              onChange={(e) => setResourceId(e.target.value)}
              className="flex h-11 w-full rounded-xl border border-[color:var(--fyh-border)] bg-black/20 px-3 text-sm text-fyh-text"
            >
              <option value="">None</option>
              {resources.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-sm text-fyh-text-secondary">Start</label>
              <select
                value={startMinutes}
                onChange={(e) => setStartMinutes(Number(e.target.value))}
                className="flex h-11 w-full rounded-xl border border-[color:var(--fyh-border)] bg-black/20 px-3 text-sm text-fyh-text"
              >
                {timeOptions(dayStartHour, dayEndHour).map((m) => (
                  <option key={m} value={m}>{minutesToSlotLabel(m)}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-sm text-fyh-text-secondary">End</label>
              {hadCustomDuration ? (
                <select
                  value={endMinutes}
                  onChange={(e) => setEndMinutes(Number(e.target.value))}
                  className="flex h-11 w-full rounded-xl border border-[color:var(--fyh-border)] bg-black/20 px-3 text-sm text-fyh-text"
                >
                  {timeOptions(dayStartHour, dayEndHour).map((m) => (
                    <option key={m} value={m}>{minutesToSlotLabel(m)}</option>
                  ))}
                </select>
              ) : (
                <p className="flex h-11 items-center rounded-xl border border-[color:var(--fyh-border)] bg-black/10 px-3 text-sm tabular-nums">
                  {minutesToSlotLabel(previewEndMinutes)}
                  <span className="ml-2 text-xs text-fyh-text-muted">from catalog</span>
                </p>
              )}
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-sm text-fyh-text-secondary">Services</label>
            <div className="max-h-40 space-y-1 overflow-y-auto rounded-xl border border-[color:var(--fyh-border)] p-2">
              {services.map((s) => (
                <label key={s.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    disabled={locked}
                    checked={serviceIds.includes(s.id)}
                    onChange={() => toggleService(s.id)}
                    className="accent-fyh-forest"
                  />
                  <span className="flex-1">{s.name}</span>
                  <span className="text-xs text-fyh-text-muted">
                    {s.durationMinutes}m · {formatInrFromPaise(s.pricePaise)}
                  </span>
                </label>
              ))}
            </div>
            {hadCustomDuration ? (
              <p className="text-xs text-fyh-accent">
                Custom slot duration preserved ({appointment.durationMinutes}m vs catalog{' '}
                {snapshotDurationMinutes(appointment.services)}m)
              </p>
            ) : null}
          </div>

          <div className="space-y-1">
            <label className="text-sm text-fyh-text-secondary">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as FyhAppointmentStatus)}
              className="flex h-11 w-full rounded-xl border border-[color:var(--fyh-border)] bg-black/20 px-3 text-sm text-fyh-text"
            >
              {allowedStatuses.map((st) => (
                <option key={st} value={st}>{st.replace(/_/g, ' ')}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-sm text-fyh-text-secondary">Notes</label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          <p className="text-xs text-fyh-text-muted">
            {formatHmInSalonTz(new Date(startAtIso), timezone)} –{' '}
            {formatHmInSalonTz(
              new Date(hadCustomDuration ? utcFromDayAndMinutes(dayIso, endMinutes, timezone) : endAtIso),
              timezone,
            )}
          </p>

          <Button type="button" className="w-full" disabled={pending} onClick={onSave}>
            {pending ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function timeOptions(dayStartHour: number, dayEndHour: number): number[] {
  const out: number[] = [];
  for (let m = dayStartHour * 60; m <= dayEndHour * 60; m += 30) {
    out.push(m);
  }
  return out;
}
