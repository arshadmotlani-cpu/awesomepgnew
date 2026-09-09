import type { VacatingForBookingRow } from '@/src/db/queries/customer';

export type PortalVacatingQueryResult =
  | { ok: true; data: VacatingForBookingRow | null }
  | { ok: false; data?: VacatingForBookingRow | null };

/** Open move-out notices only — pending or approved. */
export function isActivePortalVacatingStatus(
  status: VacatingForBookingRow['status'] | string | null | undefined,
): status is 'pending' | 'approved' {
  return status === 'pending' || status === 'approved';
}

/** Requests tab SSOT — terminal/historical vacating rows must not surface as primary. */
export function resolveActivePortalVacating(
  vacating: PortalVacatingQueryResult | null | undefined,
): VacatingForBookingRow | null {
  if (!vacating?.ok || !vacating.data) return null;
  return isActivePortalVacatingStatus(vacating.data.status) ? vacating.data : null;
}
