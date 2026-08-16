import { AppointmentsCalendar } from '@/src/hair/components/appointments/AppointmentsCalendar';
import { listAppointmentsInRange, listResources } from '@/src/hair/services/appointments';
import { listCustomers } from '@/src/hair/services/customers';
import { listBookableServices } from '@/src/hair/services/salonServices';
import { listBookableStaff } from '@/src/hair/services/staff';
import { getSalonSettings } from '@/src/hair/services/settings';
import { parseHm, salonDayBounds, zonedLocalToUtc } from '@/src/hair/lib/salonTime';
import { getHairSession } from '@/src/hair/lib/auth/session';
import { resolvePermissions } from '@/src/workforce/brains/employeeBrain';
import { hasWorkforcePermission } from '@/src/workforce/permissions/presets';
import { isWorkforceEngineEnabled } from '@/src/workforce/types';

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function parseDayIso(raw: string | undefined, timezone: string) {
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return salonDayBounds(timezone).dayKey;
  return raw;
}

export default async function AppointmentsPage({ searchParams }: Props) {
  const sp = await searchParams;
  const settings = await getSalonSettings();
  const timezone = settings.timezone || 'Asia/Kolkata';

  const dateRaw = sp.date;
  const dayIso = parseDayIso(Array.isArray(dateRaw) ? dateRaw[0] : dateRaw, timezone);
  const customerRaw = sp.customerId;
  const preselectCustomerId = Array.isArray(customerRaw) ? customerRaw[0] : customerRaw;

  const [y, m, d] = dayIso.split('-').map(Number);
  const localDow = new Date(y!, m! - 1, d!).getDay();
  const hours = settings.businessHours?.find((h) => h.dayOfWeek === localDow);
  const open = parseHm(hours?.open ?? '10:00');
  const close = parseHm(hours?.close ?? '20:00');

  const dayStart = zonedLocalToUtc(`${dayIso}T00:00:00`, timezone);
  const rangeStart = new Date(dayStart.getTime() - 7 * 24 * 60 * 60 * 1000);
  const rangeEnd = new Date(dayStart.getTime() + 8 * 24 * 60 * 60 * 1000);

  let staffScopeId: string | null = null;
  if (isWorkforceEngineEnabled()) {
    const session = await getHairSession();
    if (session?.workforceEmployeeId) {
      const grants = await resolvePermissions(session.workforceEmployeeId, 'fyh_salon');
      const canAll = hasWorkforcePermission(grants, 'appointments.view_all');
      const canOwn = hasWorkforcePermission(grants, 'appointments.view_own');
      if (canOwn && !canAll) {
        staffScopeId = session.workforceEmployeeId;
      }
    }
  }

  const [appointments, staff, resources, customers, services] = await Promise.all([
    listAppointmentsInRange(rangeStart, rangeEnd, { staffId: staffScopeId }),
    listBookableStaff(),
    listResources(),
    listCustomers(),
    listBookableServices(),
  ]);

  const scopedStaff = staffScopeId
    ? staff.filter((s) => s.id === staffScopeId)
    : staff;

  const serialized = appointments.map((a) => ({
    ...a,
    startAt: a.startAt.toISOString(),
    endAt: a.endAt.toISOString(),
  }));

  return (
    <div className="space-y-3">
      {staffScopeId ? (
        <p className="rounded-lg border border-[color:var(--fyh-border)] bg-[color:var(--fyh-surface)] px-3 py-2 text-sm text-fyh-text-secondary">
          Showing your appointments only (Workforce Staff scope).
        </p>
      ) : null}
      <AppointmentsCalendar
        initialAppointments={serialized}
        staff={scopedStaff.map((s) => ({
          id: s.id,
          fullName: s.fullName,
          photoUrl: s.photoUrl,
        }))}
        resources={resources.map((r) => ({ id: r.id, name: r.name }))}
        customers={customers.map((c) => ({
          id: c.id,
          fullName: c.fullName,
          phone: c.phone,
          walletBalancePaise: c.walletBalancePaise ?? 0,
        }))}
        services={services.map((s) => ({
          id: s.id,
          name: s.name,
          durationMinutes: s.durationMinutes,
          pricePaise: s.pricePaise,
        }))}
        dayIso={dayIso}
        timezone={timezone}
        dayStartHour={open.hour}
        dayEndHour={Math.min(24, close.hour + (close.minute > 0 ? 1 : 0))}
        preselectCustomerId={preselectCustomerId ?? null}
      />
    </div>
  );
}
