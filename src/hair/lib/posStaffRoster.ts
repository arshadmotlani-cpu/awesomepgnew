import { SYSTEM_OWNER_DISPLAY_NAME, SYSTEM_OWNER_PROVIDER_ID } from '@/src/workforce/services/systemOwnerProvider';

/** Canonical Quick Sale / bookable display name for the FYHAIR owner-admin. */
export const ARSHAD_STAFF_DISPLAY_NAME = 'Arshad Motlani';

export const ARSHAD_ADMIN_EMAIL = 'arshad@foryour.co';
export const LEGACY_FYH_ADMIN_EMAIL = 'admin@foryour.co';

export type PosStaffCandidate = {
  id: string;
  fullName: string;
};

export function normalizeStaffName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** RC seed stylists and other integration/demo rows — not selectable on live POS. */
export function isPosExcludedStaff(staff: PosStaffCandidate): boolean {
  if (staff.id === SYSTEM_OWNER_PROVIDER_ID) return true;
  if (staff.fullName.trim() === SYSTEM_OWNER_DISPLAY_NAME) return true;
  if (/^RC Stylist /i.test(staff.fullName.trim())) return true;
  const n = normalizeStaffName(staff.fullName);
  if (/\b(uat|test|demo|placeholder|dummy)\b/i.test(n)) return true;
  return false;
}

export function isArshadNameCluster(name: string): boolean {
  const n = normalizeStaffName(name);
  return n === 'arshad' || n === 'arshad motlani';
}

export function staffNameMatchesPosQuery(fullName: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return fullName.toLowerCase().includes(q);
}

export function filterSelectablePosStaff<T extends PosStaffCandidate>(
  rows: T[],
  query = '',
): T[] {
  const bestByKey = new Map<string, T>();
  for (const row of rows) {
    if (!staffNameMatchesPosQuery(row.fullName, query)) continue;
    if (isPosExcludedStaff(row)) continue;
    const key = normalizeStaffName(row.fullName);
    const prev = bestByKey.get(key);
    if (!prev) {
      bestByKey.set(key, row);
      continue;
    }
    const prevAllLower = prev.fullName === prev.fullName.toLowerCase();
    const rowAllLower = row.fullName === row.fullName.toLowerCase();
    if (prevAllLower && !rowAllLower) bestByKey.set(key, row);
  }
  return [...bestByKey.values()].sort((a, b) =>
    a.fullName.localeCompare(b.fullName, undefined, { sensitivity: 'base' }),
  );
}
