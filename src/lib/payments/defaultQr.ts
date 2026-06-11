/** Default UPI QR for weekly/monthly rent, deposits, and booking checkout (all PGs). */
export const DEFAULT_RENT_DEPOSIT_UPI_ID = 'shiba.motlani@oksbi';

export const DEFAULT_RENT_DEPOSIT_QR_PATH = '/payments/upi-rent-deposit.png';

/** Payment category name shown to customers and admins. */
export const RENT_DEPOSIT_BOOKING_CATEGORY_NAME = 'Rent, Deposit & Booking';

/**
 * Second UPI QR — electricity bills, daily stays + deposit, and reservation fees.
 */
export const DEFAULT_ELECTRICITY_DAILY_UPI_ID = '9049163636@pthdfc';

export const DEFAULT_ELECTRICITY_DAILY_QR_PATH = '/payments/upi-electricity-daily.png';

export const ELECTRICITY_CATEGORY_NAME = 'Electricity, Daily & Reservation';

/** PS4 gaming maintenance add-on — uses the electricity / daily UPI QR. */
export const PS4_MAINTENANCE_CATEGORY_NAME = 'PS4 Gaming Maintenance';

/** Legacy name used before the second QR was added — still matched when seeding. */
export const LEGACY_ELECTRICITY_CATEGORY_NAME = 'Electricity';

export function isRentDepositBookingCategory(name: string): boolean {
  const n = name.toLowerCase();
  return (
    n.includes('rent') &&
    (n.includes('deposit') || n.includes('booking')) &&
    !n.includes('electric')
  );
}

export function isElectricityDailyCategory(name: string): boolean {
  const n = name.toLowerCase();
  return n.includes('electric') || (n.includes('daily') && n.includes('reservation'));
}
