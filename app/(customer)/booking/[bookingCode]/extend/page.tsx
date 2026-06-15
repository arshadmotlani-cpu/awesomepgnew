import { redirect } from 'next/navigation';
import { requireCustomerOwnsBookingCode, requireCustomerSession } from '@/src/lib/auth/guards';

export const dynamic = 'force-dynamic';

/** Extend stay is retired — redirect to booking detail. */
export default async function ExtendBookingPage(
  props: PageProps<'/booking/[bookingCode]/extend'>,
) {
  const { bookingCode } = await props.params;
  const session = await requireCustomerSession(`/booking/${bookingCode}/extend`);
  await requireCustomerOwnsBookingCode(session, bookingCode);
  redirect(`/booking/${bookingCode}?extend_removed=1`);
}
