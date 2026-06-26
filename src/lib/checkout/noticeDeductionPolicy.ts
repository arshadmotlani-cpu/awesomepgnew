import { isMonthlyStayType, stayTypeFromPricingMode } from '@/src/lib/stayType';

/** Notice-period rent penalties apply only to monthly / open-ended residents. */
export function noticeDeductionAppliesToBooking(booking: {
  stayType?: string | null;
  durationMode?: string | null;
}): boolean {
  if (booking.stayType) {
    return isMonthlyStayType(booking.stayType);
  }
  const mode = booking.durationMode ?? 'open_ended';
  if (mode === 'monthly' || mode === 'open_ended') return true;
  if (mode === 'monthly_stay') return true;
  if (mode === 'fixed_date_stay' || mode === 'fixed_stay' || mode === 'daily' || mode === 'weekly') {
    return false;
  }
  return stayTypeFromPricingMode(mode) === 'monthly_stay';
}
