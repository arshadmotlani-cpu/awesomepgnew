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

/** Portal date fields may arrive as ISO datetimes — MoveOutDatePicker requires YYYY-MM-DD. */
export function normalizePortalDateOnly(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}
