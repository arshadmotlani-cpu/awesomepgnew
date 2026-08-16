import type { FyhAppointmentStatus } from '@/src/hair/db/schema/appointments';
import { FYH_APPOINTMENT_STATUS_COLORS } from '@/src/hair/lib/appointmentStatus';
import { cn } from '@/src/hair/lib/utils';
import type { CalendarAppointment } from './calendarTypes';
import { formatHmInSalonTz } from './schedulerTime';

export function StatusChip({ status }: { status: FyhAppointmentStatus }) {
  const c = FYH_APPOINTMENT_STATUS_COLORS[status];
  return (
    <span
      className="inline-flex rounded-md px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wide"
      style={{ background: c.bg, color: c.fg, border: `1px solid ${c.border}` }}
    >
      {c.label}
    </span>
  );
}

export function ApptCardBody({
  appt,
  compact,
  timezone,
}: {
  appt: CalendarAppointment;
  compact?: boolean;
  timezone?: string;
}) {
  const start = new Date(appt.startAt);
  const end = new Date(appt.endAt);
  const fmt = (d: Date) =>
    timezone ? formatHmInSalonTz(d, timezone) : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

  return (
    <div className={cn('min-w-0', compact && 'space-y-0.5')}>
      <div className="flex items-start justify-between gap-1">
        <p className="truncate text-xs font-semibold leading-tight">{appt.customerName}</p>
        {!compact ? <StatusChip status={appt.status} /> : null}
      </div>
      <p className="truncate text-[10px] text-fyh-text-secondary">
        {appt.services.map((s) => s.name).join(', ') || '—'}
      </p>
      {!compact ? (
        <>
          <p className="truncate text-[10px] text-fyh-text-muted">{appt.customerPhone}</p>
          <p className="truncate text-[10px] text-fyh-text-muted">
            {appt.staffName}
            {appt.resourceName ? ` · ${appt.resourceName}` : ''}
          </p>
        </>
      ) : null}
      <p className="text-[10px] tabular-nums text-fyh-text-muted">
        {fmt(start)}–{fmt(end)}
        {!compact ? ` · ${appt.durationMinutes}m` : ''}
      </p>
    </div>
  );
}

export function staffInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ''}${parts[parts.length - 1]![0] ?? ''}`.toUpperCase();
}
