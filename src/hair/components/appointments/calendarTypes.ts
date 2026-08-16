import type { FyhAppointmentStatus } from '@/src/hair/db/schema/appointments';

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
  createdByAdminId?: string | null;
  createdByName?: string | null;
  services: Array<{
    id: string;
    serviceId: string;
    name: string;
    durationMinutes: number;
    pricePaise: number;
  }>;
  durationMinutes: number;
};

export type StaffOpt = { id: string; fullName: string; photoUrl?: string | null };
export type ResourceOpt = { id: string; name: string };
export type CustomerOpt = {
  id: string;
  fullName: string;
  phone: string;
  walletBalancePaise?: number;
};
export type ServiceOpt = {
  id: string;
  name: string;
  durationMinutes: number;
  pricePaise: number;
};

export type CreateSlotPrefill = {
  dayIso: string;
  staffId: string;
  startMinutes: number;
};
