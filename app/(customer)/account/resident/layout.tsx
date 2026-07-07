import { redirect } from 'next/navigation';
import { requireCustomerSession } from '@/src/lib/auth/guards';
import {
  customerHasResidentPortalAccess,
  getOpenReserveBookingCode,
} from '@/src/lib/residents/residentPortalAccess';

/**
 * Guards all `/account/resident/*` routes — reserve lifecycle and non-residents
 * are redirected before any resident billing UI can render.
 */
export default async function ResidentRoutesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireCustomerSession('/account/resident');
  const openReserveCode = await getOpenReserveBookingCode(session.customerId);
  if (openReserveCode) {
    redirect(`/booking/${encodeURIComponent(openReserveCode)}`);
  }
  const hasAccess = await customerHasResidentPortalAccess(session.customerId);
  if (!hasAccess) {
    redirect('/account/bookings');
  }
  return children;
}
