/**
 * Salon dashboard snapshot — widgets show 0 / empty until modules produce data.
 * Customers count is live once the customers table is populated.
 */

import { countActiveCustomers } from '@/src/hair/services/customers';

export type DashboardScheduleItem = {
  id: string;
  timeLabel: string;
  customerName: string;
  serviceLabel: string;
  staffName: string;
  status: string;
};

export type DashboardAppointmentItem = {
  id: string;
  whenLabel: string;
  customerName: string;
  serviceLabel: string;
};

export type DashboardBillItem = {
  id: string;
  customerName: string;
  amountPaise: number;
  status: string;
  createdAtLabel: string;
};

export type DashboardSnapshot = {
  todayRevenuePaise: number;
  todayAppointments: number;
  customersInSalon: number;
  pendingPayments: number;
  staffWorking: number;
  lowStockProducts: number;
  totalCustomers: number;
  todaysSchedule: DashboardScheduleItem[];
  upcomingAppointments: DashboardAppointmentItem[];
  recentBills: DashboardBillItem[];
};

export async function getDashboardSnapshot(): Promise<DashboardSnapshot> {
  let totalCustomers = 0;
  try {
    totalCustomers = await countActiveCustomers();
  } catch {
    // Table may not exist yet on a fresh deploy before migrate — keep zeros.
    totalCustomers = 0;
  }

  return {
    todayRevenuePaise: 0,
    todayAppointments: 0,
    customersInSalon: 0,
    pendingPayments: 0,
    staffWorking: 0,
    lowStockProducts: 0,
    totalCustomers,
    todaysSchedule: [],
    upcomingAppointments: [],
    recentBills: [],
  };
}
