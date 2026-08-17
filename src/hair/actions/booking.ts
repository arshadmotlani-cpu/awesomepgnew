'use server';

import { revalidatePath } from 'next/cache';
import { requirePermission } from '@/src/hair/lib/auth/permissions';
import type { AdvancePaymentMethod } from '@/src/hair/services/loyaltyOps';
import { recordAdvancePayment } from '@/src/hair/services/loyaltyOps';
import {
  getCustomerBookingContext,
  getCustomerVisitHistory,
  searchCustomersForPos,
  searchServicesForBooking,
} from '@/src/hair/services/bookingContext';

export async function searchCustomersForBookingAction(query: string) {
  await requirePermission('page:appointments');
  return searchCustomersForPos(query);
}

export async function searchServicesForBookingAction(query: string) {
  await requirePermission('page:appointments');
  return searchServicesForBooking(query);
}

export async function loadCustomerBookingContextAction(customerId: string) {
  await requirePermission('page:appointments');
  return getCustomerBookingContext(customerId);
}

export async function loadCustomerVisitHistoryAction(customerId: string) {
  await requirePermission('page:appointments');
  return getCustomerVisitHistory(customerId);
}

export async function addAdvanceFromBookingAction(input: {
  customerId: string;
  amountPaise: number;
  method: AdvancePaymentMethod;
  notes?: string | null;
}) {
  await requirePermission('action:billing.checkout');
  const result = await recordAdvancePayment({
    customerId: input.customerId,
    amountPaise: input.amountPaise,
    method: input.method,
    notes: input.notes ?? 'Added during appointment booking',
    reference: 'appointment_booking',
  });
  revalidatePath('/appointments');
  revalidatePath(`/customers/${input.customerId}`);
  return result;
}
