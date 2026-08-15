import {
  isResidentActiveLiving,
  isResidentBedAssignable,
} from '@/src/lib/residentBedAssignment';
import type { ResidentListRow } from '@/src/services/residentAdmin';

export type ResidentListStatusFilter =
  | 'all'
  | 'active'
  | 'unassigned'
  | 'vacating'
  | 'kyc_pending';

export const RESIDENT_LIST_STATUS_FILTERS: { id: ResidentListStatusFilter; label: string }[] = [
  { id: 'active', label: 'Active' },
  { id: 'unassigned', label: 'Unassigned' },
  { id: 'vacating', label: 'Vacating' },
  { id: 'kyc_pending', label: 'KYC pending' },
  { id: 'all', label: 'All' },
];

export function parseResidentListStatusFilter(
  raw: string | undefined,
): ResidentListStatusFilter {
  const valid = new Set(RESIDENT_LIST_STATUS_FILTERS.map((f) => f.id));
  if (raw && valid.has(raw as ResidentListStatusFilter)) {
    return raw as ResidentListStatusFilter;
  }
  return 'active';
}

export function matchesResidentListStatusFilter(
  resident: ResidentListRow,
  filter: ResidentListStatusFilter,
): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'active':
      return isResidentActiveLiving(resident);
    case 'unassigned':
      return isResidentBedAssignable(resident);
    case 'vacating':
      return resident.tenancyStatus === 'vacating';
    case 'kyc_pending':
      return resident.hasPendingKycSubmission;
    default:
      return true;
  }
}

export function filterResidentsForAdminList(
  residents: ResidentListRow[],
  input: {
    statusFilter: ResidentListStatusFilter;
    query?: string;
    moveInDate?: string;
  },
): ResidentListRow[] {
  const q = (input.query ?? '').trim().toLowerCase();
  const digits = (input.query ?? '').replace(/\D/g, '');

  return residents.filter((r) => {
    if (!matchesResidentListStatusFilter(r, input.statusFilter)) return false;
    if (input.moveInDate && r.moveInDate !== input.moveInDate) return false;
    if (!q) return true;

    const nameMatch = r.fullName.toLowerCase().includes(q);
    const emailMatch = r.email.toLowerCase().includes(q);
    const phoneMatch = digits.length >= 2 && r.phone.replace(/\D/g, '').includes(digits);
    const bookingMatch = r.bookingCode?.toLowerCase().includes(q);
    const pgMatch = r.pgName?.toLowerCase().includes(q);
    const bedMatch =
      r.bedCode?.toLowerCase().includes(q) ||
      r.roomNumber?.toLowerCase().includes(q) ||
      `${r.roomNumber ?? ''} ${r.bedCode ?? ''}`.toLowerCase().includes(q);

    return nameMatch || emailMatch || phoneMatch || bookingMatch || pgMatch || bedMatch;
  });
}

export function compareResidentsAlphabetically(a: ResidentListRow, b: ResidentListRow): number {
  const pgCmp = (a.pgName ?? '').localeCompare(b.pgName ?? '', undefined, {
    sensitivity: 'base',
  });
  if (pgCmp !== 0) return pgCmp;
  return a.fullName.localeCompare(b.fullName, undefined, { sensitivity: 'base' });
}
