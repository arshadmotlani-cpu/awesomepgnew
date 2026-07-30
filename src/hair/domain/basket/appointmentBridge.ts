import { asc, eq } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import {
  fyhAppointments,
  fyhAppointmentServices,
  fyhCustomers,
  fyhServices,
} from '@/src/hair/db/schema';
import { isCheckoutAllowedStatus } from '@/src/hair/lib/appointmentStatus';
import { staffModeForType } from '@/src/hair/domain/catalog/types';
import type { PosCustomerHit } from '@/src/hair/services/quickSale';
import type { Basket, BasketLine } from '@/src/hair/domain/basket/types';

export type AppointmentCheckoutPrefill = {
  appointmentId: string;
  customer: PosCustomerHit;
  lines: BasketLine[];
};

export async function buildBasketFromAppointment(appointmentId: string): Promise<Basket> {
  const [appt] = await hairDb
    .select()
    .from(fyhAppointments)
    .where(eq(fyhAppointments.id, appointmentId))
    .limit(1);
  if (!appt) throw new Error('Appointment not found');
  if (appt.invoiceId) throw new Error('Appointment already checked out');
  if (!isCheckoutAllowedStatus(appt.status)) {
    throw new Error(
      `Cannot checkout appointment in status "${appt.status}" — mark Arrived or In Service first`,
    );
  }

  const services = await hairDb
    .select({
      id: fyhAppointmentServices.id,
      serviceId: fyhAppointmentServices.serviceId,
      nameSnapshot: fyhAppointmentServices.nameSnapshot,
      pricePaise: fyhAppointmentServices.pricePaise,
      gstBps: fyhAppointmentServices.gstBps,
      sortOrder: fyhAppointmentServices.sortOrder,
      code: fyhServices.code,
      category: fyhServices.category,
    })
    .from(fyhAppointmentServices)
    .leftJoin(fyhServices, eq(fyhAppointmentServices.serviceId, fyhServices.id))
    .where(eq(fyhAppointmentServices.appointmentId, appointmentId))
    .orderBy(asc(fyhAppointmentServices.sortOrder));

  if (services.length === 0) throw new Error('Appointment has no services');

  const lines: BasketLine[] = services.map((s) => ({
    lineId: `appt-${s.id}`,
    billableRef: { id: s.serviceId, type: 'service' },
    snapshot: {
      name: s.nameSnapshot,
      code: s.code ?? null,
      unitSellingPricePaise: s.pricePaise,
      gstBps: s.gstBps,
      staffMode: staffModeForType('service'),
      category: s.category ?? null,
    },
    quantity: 1,
    overridePricePaise: null,
    staff: [{ staffId: appt.staffId, shareBps: 10_000 }],
  }));

  return {
    customerId: appt.customerId,
    lines,
    payments: [],
    flags: {},
  };
}

export async function loadAppointmentCheckoutPrefill(
  appointmentId: string,
): Promise<AppointmentCheckoutPrefill> {
  const basket = await buildBasketFromAppointment(appointmentId);
  const [customer] = await hairDb
    .select({
      id: fyhCustomers.id,
      fullName: fyhCustomers.fullName,
      customerCode: fyhCustomers.customerCode,
      phone: fyhCustomers.phone,
      walletBalancePaise: fyhCustomers.walletBalancePaise,
    })
    .from(fyhCustomers)
    .where(eq(fyhCustomers.id, basket.customerId))
    .limit(1);
  if (!customer) throw new Error('Customer not found');

  return {
    appointmentId,
    customer,
    lines: basket.lines,
  };
}
