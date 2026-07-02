import { ExpressBookingSheet } from '@/src/components/admin/expressBooking/ExpressBookingSheet';
import styles from './express-booking.module.css';

export const metadata = {
  title: 'Express Booking · Admin',
  description: 'Walk-in booking and invoice workspace.',
};

export default function ExpressBookingPage() {
  return (
    <div data-express-booking-workspace className={styles.workspace}>
      <ExpressBookingSheet />
    </div>
  );
}
