/**
 * Monthly room electricity — who may enter allocation (aligned with occupancy SSOT).
 *
 * Live occupancy requires active primary reservations on confirmed bookings.
 * Completed/checked-out stays must not re-enter monthly billing.
 */
import { isPipelineTestResidentEmail } from '@/src/lib/billing/pipelineTestResident';

export type MonthlyElectricityOccupantCandidate = {
  reservationStatus: string;
  bookingStatus: string;
  residencyStatus: string;
  customerEmail: string | null;
};

export function isMonthlyElectricityBillableOccupant(
  row: MonthlyElectricityOccupantCandidate,
): boolean {
  if (isPipelineTestResidentEmail(row.customerEmail)) return false;
  if (row.reservationStatus !== 'active') return false;
  if (row.bookingStatus !== 'confirmed') return false;
  if (row.residencyStatus === 'vacated' || row.residencyStatus === 'blocked') return false;
  return true;
}
