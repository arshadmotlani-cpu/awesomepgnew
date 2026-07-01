import { ExpressBookingSheet } from '@/src/components/admin/expressBooking/ExpressBookingSheet';

export const metadata = {
  title: 'Express Booking · Admin',
  description: 'Walk-in booking and invoice workspace.',
};

export default function ExpressBookingPage() {
  return <ExpressBookingSheet />;
}
