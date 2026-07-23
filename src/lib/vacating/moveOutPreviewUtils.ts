import { normalizeIsoDateOnly, tryDiffDays } from '@/src/lib/dates';
import type { AdminVacatingRow } from '@/src/db/queries/admin';

export type VacatingBedStatus = 'Occupied' | 'Scheduled for Release' | 'Available';

export type MoveOutUrgency = 'high' | 'medium' | 'normal';

export function vacatingBedStatus(status: AdminVacatingRow['status']): VacatingBedStatus {
  if (status === 'completed') return 'Available';
  if (status === 'approved') return 'Scheduled for Release';
  return 'Occupied';
}

/** 0–3 days → high, 4–7 → medium, 8+ → normal. Overdue counts as high. */
export function moveOutUrgency(daysRemaining: number): MoveOutUrgency {
  if (daysRemaining <= 3) return 'high';
  if (daysRemaining <= 7) return 'medium';
  return 'normal';
}

export function moveOutDaysRemaining(vacatingDate: string, today?: string): number {
  const ref = today ?? new Date().toISOString().slice(0, 10);
  return tryDiffDays(ref, normalizeIsoDateOnly(vacatingDate)) ?? 0;
}
