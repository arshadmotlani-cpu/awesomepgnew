/**
 * Express Booking POS — resident context from SSOT (active tenancy + deposit).
 */

import { eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { bookings, customers } from '@/src/db/schema';
import type { AdminSession } from '@/src/lib/auth/session';
import { getCustomerDepositCredit } from '@/src/services/depositCredit';
import { getDepositSummaryForBooking } from '@/src/services/deposits';
import { getResidentDetail } from '@/src/services/residentAdmin';
import {
  serializeExpressBookingContext,
  type ExpressBookingResidentContext,
} from '@/src/lib/admin/expressBookingTypes';

export type { ExpressBookingActiveTenancy, ExpressBookingResidentContext } from '@/src/lib/admin/expressBookingTypes';

function isPlaceholderWalkInEmail(email: string): boolean {
  return email.startsWith('walkin+') && email.endsWith('@residents.awesomepg.in');
}

export async function loadExpressBookingResidentContext(
  session: AdminSession,
  customerId: string,
): Promise<ExpressBookingResidentContext | null> {
  const [customer] = await db
    .select()
    .from(customers)
    .where(eq(customers.id, customerId))
    .limit(1);

  if (!customer || customer.archivedAt) {
    return null;
  }

  const detail = await getResidentDetail(session, customer.id);
  if (!detail) {
    return null;
  }

  const wallet = await getCustomerDepositCredit(customer.id);
  const tenancy = detail.activeTenancy;

  let bookingStatus = 'confirmed';
  if (tenancy?.bookingId) {
    const [bookingRow] = await db
      .select({ status: bookings.status })
      .from(bookings)
      .where(eq(bookings.id, tenancy.bookingId))
      .limit(1);
    bookingStatus = bookingRow?.status ?? 'confirmed';
  }

  let depositCollectedPaise = 0;
  let depositHeldPaise = 0;
  if (tenancy?.bookingId) {
    const summary = await getDepositSummaryForBooking(tenancy.bookingId);
    if (summary) {
      depositCollectedPaise = summary.collectedPaise;
      depositHeldPaise = summary.refundableBalancePaise;
    }
  }

  const activeTenancyRow = await import('@/src/lib/residentActiveTenancy').then((m) =>
    m.getActiveTenancyForCustomer(customer.id),
  );

  let resolvedStatus: ExpressBookingResidentContext['tenancyStatus'] = 'unassigned';
  if (activeTenancyRow) {
    resolvedStatus = activeTenancyRow.isVacating ? 'vacating' : 'active';
  } else if (customer.residencyStatus === 'vacated') {
    resolvedStatus = 'vacated';
  }

  return serializeExpressBookingContext({
    customerId: customer.id,
    fullName: customer.fullName,
    email: isPlaceholderWalkInEmail(customer.email) ? '' : customer.email,
    phone: customer.phone,
    gender: customer.gender,
    kycStatus: customer.kycStatus,
    tenancyStatus: resolvedStatus,
    walletCreditPaise: wallet.availableCreditPaise,
    activeTenancy: tenancy
      ? {
          bookingId: tenancy.bookingId,
          bookingCode: tenancy.bookingCode,
          bookingStatus,
          pgId: tenancy.pgId,
          pgName: tenancy.pgName,
          roomNumber: tenancy.roomNumber,
          bedId: tenancy.bedId,
          bedCode: tenancy.bedCode,
          moveInDate: tenancy.moveInDate,
          stayType: tenancy.stayType,
          durationMode: tenancy.durationMode,
          monthlyRentPaise: tenancy.monthlyRentPaise,
          depositPaise: tenancy.depositPaise,
          isVacating: activeTenancyRow?.isVacating ?? false,
          expectedCheckoutDate: tenancy.expectedCheckoutDate,
        }
      : null,
    depositCollectedPaise,
    depositHeldPaise,
  });
}
