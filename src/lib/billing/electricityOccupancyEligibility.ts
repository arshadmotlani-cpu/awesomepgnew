/**
 * Monthly room electricity — who may enter allocation (aligned with occupancy SSOT).
 *
 * Live occupancy requires active primary reservations on confirmed bookings.
 * Historical room coverage also accepts completed/superseded stay facts: a
 * resident leaving later must not erase electricity liability for prior days.
 */
import { isPipelineTestResidentEmail } from '@/src/lib/billing/pipelineTestResident';

export type MonthlyElectricityOccupantCandidate = {
  reservationStatus: string;
  bookingStatus: string;
  residencyStatus: string;
  customerEmail: string | null;
  historicalCoverage?: boolean;
};

export function isMonthlyElectricityBillableOccupant(
  row: MonthlyElectricityOccupantCandidate,
): boolean {
  if (isPipelineTestResidentEmail(row.customerEmail)) return false;
  if (row.historicalCoverage) {
    if (!['active', 'completed'].includes(row.reservationStatus)) return false;
    if (!['confirmed', 'completed', 'superseded'].includes(row.bookingStatus)) return false;
    return true;
  }
  if (row.reservationStatus !== 'active') return false;
  if (row.bookingStatus !== 'confirmed') return false;
  if (row.residencyStatus === 'vacated' || row.residencyStatus === 'blocked') return false;
  return true;
}
