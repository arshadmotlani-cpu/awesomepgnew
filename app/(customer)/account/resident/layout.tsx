import { redirect } from 'next/navigation';
import { requireCustomerSession } from '@/src/lib/auth/guards';
import {
  customerHasResidentPortalAccess,
  getOpenReserveBookingCode,
} from '@/src/lib/residents/residentPortalAccess';

/**
 * Guards all `/account/resident/*` routes.
 * Active stay → modern portal. Open reserve only redirects when there is no tenancy.
 */
export default async function ResidentRoutesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireCustomerSession('/account/resident');
  const hasAccess = await customerHasResidentPortalAccess(session.customerId);
  if (hasAccess) {
    return children;
  }

  const openReserveCode = await getOpenReserveBookingCode(session.customerId);
  if (openReserveCode) {
    redirect(`/booking/${encodeURIComponent(openReserveCode)}`);
  }
  redirect('/account/bookings');
}
