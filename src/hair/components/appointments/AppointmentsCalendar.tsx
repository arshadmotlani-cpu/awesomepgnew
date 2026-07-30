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
import { useRouter } from 'next/navigation';
import {
  useActionState,
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
  type CSSProperties,
  type ReactNode,
} from 'react';
import {
  checkoutAppointmentAction,
  createAppointmentAction,
  payInvoiceAction,
  rescheduleAppointmentAction,
  setAppointmentStatusAction,
  type ApptActionState,
} from '@/src/hair/actions/appointments';
import { Button } from '@/src/hair/components/ui/button';
import { Input } from '@/src/hair/components/ui/input';
import type { FyhAppointmentStatus } from '@/src/hair/db/schema/appointments';
import {
  FYH_APPOINTMENT_STATUS_COLORS,
  getAllowedAppointmentStatusTransitions,
  isActiveCalendarStatus,
} from '@/src/hair/lib/appointmentStatus';
import { formatInrFromPaise } from '@/src/hair/lib/money';
import { cn } from '@/src/hair/lib/utils';

const SLOT_MIN = 15;
const PX_PER_MIN = 1.6;
/** Overridden per render from salon business hours. */
let DAY_START_H = 10;
let DAY_END_H = 20;

function gridMetrics() {
  const totalMin = (DAY_END_H - DAY_START_H) * 60;
  return { totalMin, gridH: totalMin * PX_PER_MIN };
}

export type CalendarAppointment = {
  id: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  staffId: string;
  staffName: string;
  resourceId: string | null;
  resourceName: string | null;
  startAt: string;
  endAt: string;
  status: FyhAppointmentStatus;
  notes: string | null;
  source: string;
  bufferMinutes: number;
  invoiceId: string | null;
  services: Array<{
    id: string;
    serviceId: string;
    name: string;
    durationMinutes: number;
    pricePaise: number;
  }>;
  durationMinutes: number;
};

type StaffOpt = { id: string; fullName: string };
type ResourceOpt = { id: string; name: string };
type CustomerOpt = { id: string; fullName: string; phone: string; walletBalancePaise?: number };
type ServiceOpt = { id: string; name: string; durationMinutes: number; pricePaise: number };

type ViewMode = 'day' | 'week' | 'timeline' | 'chair' | 'stylist';

type Props = {
  initialAppointments: CalendarAppointment[];
  staff: StaffOpt[];
  resources: ResourceOpt[];
  customers: CustomerOpt[];
  services: ServiceOpt[];
  dayIso: string;
  dayStartHour?: number;
  dayEndHour?: number;
  preselectCustomerId?: string | null;
};

const createInitial: ApptActionState = {};

function parseDay(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y!, m! - 1, d!, 0, 0, 0, 0);
}

function toDayIso(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(iso: string, n: number) {
  const d = parseDay(iso);
  d.setDate(d.getDate() + n);
  return toDayIso(d);
}

function formatHm(date: Date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function snapMinutes(mins: number) {
  return Math.round(mins / SLOT_MIN) * SLOT_MIN;
}

function minutesFromMidnight(d: Date) {
  return d.getHours() * 60 + d.getMinutes();
}

function setTimeOnDay(dayIso: string, minutes: number) {
  const d = parseDay(dayIso);
  d.setHours(0, 0, 0, 0);
  d.setMinutes(minutes);
  return d;
}

function topFromStart(start: Date) {
  const mins = minutesFromMidnight(start) - DAY_START_H * 60;
  return Math.max(0, mins) * PX_PER_MIN;
}

function heightFromDuration(mins: number) {
  return Math.max(SLOT_MIN * PX_PER_MIN, mins * PX_PER_MIN);
}

function weekDays(dayIso: string) {
  const d = parseDay(dayIso);
  const dow = d.getDay();
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(d);
  monday.setDate(d.getDate() + mondayOffset);
  return Array.from({ length: 7 }, (_, i) => {
    const x = new Date(monday);
    x.setDate(monday.getDate() + i);
    return toDayIso(x);
  });
}

function StatusChip({ status }: { status: FyhAppointmentStatus }) {
  const c = FYH_APPOINTMENT_STATUS_COLORS[status];
  return (
    <span
      className="inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
      style={{ background: c.bg, color: c.fg, border: `1px solid ${c.border}` }}
    >
      {c.label}
    </span>
  );
}

function ApptCardBody({ appt, compact }: { appt: CalendarAppointment; compact?: boolean }) {
  const start = new Date(appt.startAt);
  const end = new Date(appt.endAt);
  return (
    <div className={cn('min-w-0', compact && 'space-y-0.5')}>
      <div className="flex items-start justify-between gap-1">
        <p className="truncate text-xs font-semibold leading-tight">{appt.customerName}</p>
        <StatusChip status={appt.status} />
      </div>
      <p className="truncate text-[10px] opacity-80">{appt.customerPhone}</p>
      <p className="truncate text-[10px] opacity-90">
        {appt.services.map((s) => s.name).join(', ') || '—'}
      </p>
      {!compact ? (
        <>
          <p className="truncate text-[10px] opacity-80">
            {appt.staffName}
            {appt.resourceName ? ` · ${appt.resourceName}` : ''}
          </p>
          <p className="text-[10px] tabular-nums opacity-80">
            {formatHm(start)}–{formatHm(end)} · {appt.durationMinutes}m
          </p>
          {appt.notes ? (
            <p className="line-clamp-1 text-[10px] italic opacity-70">{appt.notes}</p>
          ) : null}
        </>
      ) : (
        <p className="text-[10px] tabular-nums opacity-80">
          {formatHm(start)}–{formatHm(end)}
        </p>
      )}
    </div>
  );
}

function DraggableAppt({
  appt,
  onSelect,
  onResizeEnd,
  disabled,
}: {
  appt: CalendarAppointment;
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
  const top = topFromStart(start);
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
  children,
}: {
  id: string;
  label: string;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div className="min-w-[9.5rem] flex-1">
      <div className="sticky top-0 z-20 border-b border-[color:var(--fyh-border)] bg-fyh-elevated/90 px-2 py-2 text-center text-xs font-medium text-fyh-text backdrop-blur">
        {label}
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          'relative border-r border-[color:var(--fyh-border)]',
          isOver && 'bg-fyh-forest/10',
        )}
        style={{ height: gridMetrics().gridH }}
      >
        {Array.from({ length: gridMetrics().totalMin / SLOT_MIN }, (_, i) => (
          <div
            key={i}
            className="pointer-events-none absolute inset-x-0 border-t border-[color:var(--fyh-border)]/40"
            style={{ top: i * SLOT_MIN * PX_PER_MIN }}
          />
        ))}
        {children}
      </div>
    </div>
  );
}

function TimeGutter() {
  return (
    <div className="sticky left-0 z-30 w-14 shrink-0 bg-fyh-elevated/95">
      <div className="h-[37px] border-b border-[color:var(--fyh-border)]" />
      <div className="relative" style={{ height: gridMetrics().gridH }}>
        {Array.from({ length: DAY_END_H - DAY_START_H + 1 }, (_, i) => {
          const h = DAY_START_H + i;
          return (
            <div
              key={h}
              className="absolute right-2 -translate-y-1/2 text-[10px] tabular-nums text-fyh-text-muted"
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

export function AppointmentsCalendar({
  initialAppointments,
  staff,
  resources,
  customers,
  services,
  dayIso,
  dayStartHour = 10,
  dayEndHour = 20,
  preselectCustomerId = null,
}: Props) {
  DAY_START_H = Math.max(0, Math.min(23, dayStartHour));
  DAY_END_H = Math.max(DAY_START_H + 1, Math.min(24, dayEndHour));

  const router = useRouter();
  const [view, setView] = useState<ViewMode>('day');
  const [appointments, setAppointments] = useState(initialAppointments);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(Boolean(preselectCustomerId));
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [payInvoiceId, setPayInvoiceId] = useState<string | null>(null);
  const [cash, setCash] = useState('');
  const [upi, setUpi] = useState('');
  const [card, setCard] = useState('');
  const [wallet, setWallet] = useState('');
  const [pending, startTransition] = useTransition();
  const [createState, createAction, createPending] = useActionState(
    createAppointmentAction,
    createInitial,
  );

  useEffect(() => {
    setAppointments(initialAppointments);
  }, [initialAppointments]);

  useEffect(() => {
    if (createState.success) {
      setShowCreate(false);
      setFlash(createState.success);
      router.refresh();
    }
    if (createState.error) setError(createState.error);
  }, [createState, router]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const selected = appointments.find((a) => a.id === selectedId) ?? null;
  const dayAppts = useMemo(
    () => appointments.filter((a) => a.startAt.slice(0, 10) === dayIso),
    [appointments, dayIso],
  );

  const columnMode = view === 'chair' ? 'resource' : 'staff';
  const columns =
    columnMode === 'resource'
      ? resources.map((r) => ({ id: r.id, label: r.name }))
      : staff.map((s) => ({ id: s.id, label: s.fullName }));

  const showGrid = view === 'day' || view === 'stylist' || view === 'chair';

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
              input.resourceId === undefined
                ? a.resourceName
                : (resourceRow?.name ?? null),
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
    startMins = Math.max(DAY_START_H * 60, Math.min(DAY_END_H * 60 - SLOT_MIN, startMins));
    startMins = snapMinutes(startMins);

    const startAt = setTimeOnDay(dayIso, startMins);
    const endAt = new Date(startAt.getTime() + duration);

    const patch: {
      id: string;
      startAtIso: string;
      endAtIso: string;
      staffId?: string;
      resourceId?: string | null;
    } = {
      id: appt.id,
      startAtIso: startAt.toISOString(),
      endAtIso: endAt.toISOString(),
    };

    if (columnMode === 'staff' && overId !== appt.staffId) patch.staffId = overId;
    if (columnMode === 'resource') {
      patch.resourceId = overId;
      // keep staff; only move chair
    }

    await applyReschedule(patch);
  };

  const onResizeEnd = (id: string, endAt: Date) => {
    const appt = appointments.find((a) => a.id === id);
    if (!appt) return;
    void applyReschedule({
      id,
      startAtIso: appt.startAt,
      endAtIso: endAt.toISOString(),
    });
  };

  const activeAppt = appointments.find((a) => a.id === activeId);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-fyh-accent">Floor</p>
          <h1 className="fyh-display mt-1 text-3xl font-semibold">Appointments</h1>
          <p className="mt-1 text-sm text-fyh-text-secondary">
            Drag to reschedule · resize bottom edge · checkout from detail
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={() => router.push(`/appointments?date=${addDays(dayIso, -1)}`)}>
            Prev
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => router.push('/appointments')}>
            Today
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={() => router.push(`/appointments?date=${addDays(dayIso, 1)}`)}>
            Next
          </Button>
          <span className="px-2 text-sm tabular-nums text-fyh-text">{dayIso}</span>
          <Button type="button" size="sm" onClick={() => setShowCreate(true)}>
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
              'rounded-xl px-3 py-1.5 text-sm transition',
              view === id
                ? 'bg-fyh-forest text-fyh-text'
                : 'text-fyh-text-secondary hover:bg-white/5',
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

      {showGrid ? (
        <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
          <div className="fyh-glass overflow-auto">
            <div className="flex min-w-max">
              <TimeGutter />
              {columns.length === 0 ? (
                <div className="flex h-40 flex-1 items-center justify-center text-sm text-fyh-text-muted">
                  {columnMode === 'resource' ? 'No chairs / resources yet.' : 'No stylists yet.'}
                </div>
              ) : (
                columns.map((col) => (
                  <ColumnDrop key={col.id} id={col.id} label={col.label}>
                    {dayAppts
                      .filter((a) =>
                        columnMode === 'resource'
                          ? a.resourceId === col.id
                          : a.staffId === col.id,
                      )
                      .map((a) => (
                        <DraggableAppt
                          key={a.id}
                          appt={a}
                          onSelect={setSelectedId}
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
      ) : null}

      {view === 'week' ? (
        <div className="grid gap-3 md:grid-cols-7">
          {weekDays(dayIso).map((d) => {
            const list = appointments.filter((a) => a.startAt.slice(0, 10) === d);
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
                <p className="text-xs font-medium text-fyh-accent">{d}</p>
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
                      <ApptCardBody appt={a} compact />
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
                    {formatHm(new Date(a.startAt))}
                  </span>
                  <ApptCardBody appt={a} />
                </button>
              ))
          )}
        </div>
      ) : null}

      {showCreate ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/50 p-0 sm:p-4">
          <div className="h-full w-full max-w-md overflow-y-auto border-l border-[color:var(--fyh-border)] bg-fyh-elevated p-5 shadow-2xl sm:rounded-2xl sm:border">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="fyh-display text-xl font-semibold">Quick create</h2>
              <Button type="button" variant="ghost" size="sm" onClick={() => setShowCreate(false)}>
                Close
              </Button>
            </div>
            <form action={createAction} className="space-y-3">
              <div className="space-y-1">
                <label className="text-sm text-fyh-text-secondary">Customer</label>
                <select
                  name="customerId"
                  required
                  className="flex h-11 w-full rounded-xl border border-[color:var(--fyh-border)] bg-black/20 px-3 text-sm text-fyh-text"
                  defaultValue={preselectCustomerId ?? ''}
                >
                  <option value="" disabled>
                    Select customer
                  </option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.fullName} · {c.phone}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-sm text-fyh-text-secondary">Stylist</label>
                <select
                  name="staffId"
                  required
                  className="flex h-11 w-full rounded-xl border border-[color:var(--fyh-border)] bg-black/20 px-3 text-sm text-fyh-text"
                  defaultValue={staff[0]?.id ?? ''}
                >
                  {staff.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.fullName}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-sm text-fyh-text-secondary">Chair / resource</label>
                <select
                  name="resourceId"
                  className="flex h-11 w-full rounded-xl border border-[color:var(--fyh-border)] bg-black/20 px-3 text-sm text-fyh-text"
                  defaultValue=""
                >
                  <option value="">None</option>
                  {resources.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-sm text-fyh-text-secondary">Start</label>
                <Input
                  name="startAt"
                  type="datetime-local"
                  required
                  defaultValue={`${dayIso}T${String(DAY_START_H).padStart(2, '0')}:00`}
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm text-fyh-text-secondary">Services</label>
                <div className="max-h-40 space-y-1 overflow-y-auto rounded-xl border border-[color:var(--fyh-border)] p-2">
                  {services.map((s) => (
                    <label key={s.id} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" name="serviceIds" value={s.id} className="accent-fyh-forest" />
                      <span className="flex-1">{s.name}</span>
                      <span className="text-xs text-fyh-text-muted">
                        {s.durationMinutes}m · {formatInrFromPaise(s.pricePaise)}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input id="walkIn" type="checkbox" name="source" value="walk_in" className="accent-fyh-forest" />
                <label htmlFor="walkIn" className="text-sm text-fyh-text-secondary">
                  Walk-in
                </label>
              </div>
              <div className="space-y-1">
                <label className="text-sm text-fyh-text-secondary">Repeat weeks</label>
                <Input name="recurrenceWeeks" type="number" min={1} max={12} defaultValue={1} />
              </div>
              <div className="space-y-1">
                <label className="text-sm text-fyh-text-secondary">Notes</label>
                <Input name="notes" placeholder="Optional" />
              </div>
              {createState.error ? (
                <p className="text-sm text-fyh-danger">{createState.error}</p>
              ) : null}
              <Button type="submit" disabled={createPending} className="w-full">
                {createPending ? 'Saving…' : 'Create'}
              </Button>
            </form>
          </div>
        </div>
      ) : null}

      {selected ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/50 p-0 sm:p-4">
          <div className="h-full w-full max-w-md overflow-y-auto border-l border-[color:var(--fyh-border)] bg-fyh-elevated p-5 shadow-2xl sm:rounded-2xl sm:border">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="fyh-display text-xl font-semibold">{selected.customerName}</h2>
              <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedId(null)}>
                Close
              </Button>
            </div>
            <div className="space-y-3 text-sm">
              <p className="text-fyh-text-secondary">{selected.customerPhone}</p>
              <StatusChip status={selected.status} />
              <p>
                {formatHm(new Date(selected.startAt))}–{formatHm(new Date(selected.endAt))} ·{' '}
                {selected.durationMinutes}m
              </p>
              <p>
                {selected.staffName}
                {selected.resourceName ? ` · ${selected.resourceName}` : ''}
              </p>
              <p>{selected.services.map((s) => s.name).join(', ')}</p>
              {selected.notes ? <p className="italic text-fyh-text-muted">{selected.notes}</p> : null}

              <div className="flex flex-wrap gap-2 pt-2">
                {getAllowedAppointmentStatusTransitions(selected.status).map((st) => (
                  <Button
                    key={st}
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={pending}
                    onClick={() => {
                      startTransition(async () => {
                        const res = await setAppointmentStatusAction(selected.id, st);
                        if (res.error) setError(res.error);
                        else {
                          setFlash(res.success ?? 'Updated');
                          router.refresh();
                        }
                      });
                    }}
                  >
                    {FYH_APPOINTMENT_STATUS_COLORS[st].label}
                  </Button>
                ))}
              </div>

              {(selected.status === 'completed' ||
                selected.status === 'in_service' ||
                selected.status === 'arrived') &&
              !selected.invoiceId ? (
                <Button
                  type="button"
                  className="w-full"
                  disabled={pending}
                  onClick={() => {
                    startTransition(async () => {
                      const res = await checkoutAppointmentAction(selected.id);
                      if (res?.error) {
                        setError(res.error);
                        return;
                      }
                    });
                  }}
                >
                  Checkout in POS
                </Button>
              ) : null}

              {selected.invoiceId || payInvoiceId ? (
                <div className="space-y-2 rounded-xl border border-[color:var(--fyh-border)] p-3">
                  <p className="text-xs uppercase tracking-wide text-fyh-text-muted">Pay invoice</p>
                  <p className="text-xs text-fyh-text-secondary">
                    Invoice {(payInvoiceId ?? selected.invoiceId)?.slice(0, 8)}…
                  </p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <div>
                      <label className="text-[10px] text-fyh-text-muted">Cash ₹</label>
                      <Input value={cash} onChange={(e) => setCash(e.target.value)} />
                    </div>
                    <div>
                      <label className="text-[10px] text-fyh-text-muted">UPI ₹</label>
                      <Input value={upi} onChange={(e) => setUpi(e.target.value)} />
                    </div>
                    <div>
                      <label className="text-[10px] text-fyh-text-muted">Card ₹</label>
                      <Input value={card} onChange={(e) => setCard(e.target.value)} />
                    </div>
                    {(customers.find((c) => c.id === selected.customerId)?.walletBalancePaise ?? 0) >
                    0 ? (
                      <div>
                        <label className="text-[10px] text-fyh-text-muted">
                          Wallet ₹ (avail{' '}
                          {formatInrFromPaise(
                            customers.find((c) => c.id === selected.customerId)?.walletBalancePaise ??
                              0,
                          )}
                          )
                        </label>
                        <Input value={wallet} onChange={(e) => setWallet(e.target.value)} />
                      </div>
                    ) : null}
                  </div>
                  <Button
                    type="button"
                    className="w-full"
                    disabled={pending}
                    onClick={() => {
                      const invoiceId = payInvoiceId ?? selected.invoiceId;
                      if (!invoiceId) return;
                      const payments = [
                        { method: 'cash' as const, amountPaise: Math.round(Number(cash || 0) * 100) },
                        { method: 'upi' as const, amountPaise: Math.round(Number(upi || 0) * 100) },
                        { method: 'card' as const, amountPaise: Math.round(Number(card || 0) * 100) },
                        {
                          method: 'wallet' as const,
                          amountPaise: Math.round(Number(wallet || 0) * 100),
                        },
                      ].filter((p) => p.amountPaise > 0);
                      startTransition(async () => {
                        const res = await payInvoiceAction(invoiceId, payments);
                        if (res.error) setError(res.error);
                        else {
                          setFlash(res.success ?? 'Paid');
                          setPayInvoiceId(null);
                          router.refresh();
                        }
                      });
                    }}
                  >
                    Record payment
                  </Button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
