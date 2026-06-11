/** Default UPI QR for rent, deposits, and new booking payments (all PGs). */
export const DEFAULT_RENT_DEPOSIT_UPI_ID = 'shiba.motlani@oksbi';

export const DEFAULT_RENT_DEPOSIT_QR_PATH = '/payments/upi-rent-deposit.png';

/** Payment category name shown to customers and admins. */
export const RENT_DEPOSIT_BOOKING_CATEGORY_NAME = 'Rent, Deposit & Booking';

/** Separate electricity QR — add via admin when ready. */
export const ELECTRICITY_CATEGORY_NAME = 'Electricity';

export function isRentDepositBookingCategory(name: string): boolean {
  const n = name.toLowerCase();
  return (
    n.includes('rent') &&
    (n.includes('deposit') || n.includes('booking')) &&
    !n.includes('electric')
  );
}
