/**
 * Whether a stylist counts toward "Staff on schedule" for the salon dashboard.
 */
export function shouldCountStaffForWorkingToday(input: {
  isActive: boolean;
  hasAppointmentToday: boolean;
  /** null = no schedule row for this weekday */
  scheduleIsOff: boolean | null;
}): boolean {
  if (!input.isActive) return false;
  if (input.scheduleIsOff === true) return false;
  return input.hasAppointmentToday;
}
