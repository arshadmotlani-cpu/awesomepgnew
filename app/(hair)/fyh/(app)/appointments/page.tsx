import { AppointmentsCalendar } from '@/src/hair/components/appointments/AppointmentsCalendar';
import { listAppointmentsInRange, listResources } from '@/src/hair/services/appointments';
import { listCustomers } from '@/src/hair/services/customers';
import { listBookableServices } from '@/src/hair/services/salonServices';
import { listStaff } from '@/src/hair/services/staff';
import { getSalonSettings } from '@/src/hair/services/settings';
import { parseHm, salonDayBounds, zonedLocalToUtc } from '@/src/hair/lib/salonTime';

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

  const [appointments, staff, resources, customers, services] = await Promise.all([
    listAppointmentsInRange(rangeStart, rangeEnd),
    listStaff(),
    listResources(),
    listCustomers(),
    listBookableServices(),
  ]);

  const serialized = appointments.map((a) => ({
    ...a,
    startAt: a.startAt.toISOString(),
    endAt: a.endAt.toISOString(),
  }));

  return (
    <AppointmentsCalendar
      initialAppointments={serialized}
      staff={staff.map((s) => ({ id: s.id, fullName: s.fullName }))}
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
      dayStartHour={open.hour}
      dayEndHour={Math.min(24, close.hour + (close.minute > 0 ? 1 : 0))}
      preselectCustomerId={preselectCustomerId ?? null}
    />
  );
}
