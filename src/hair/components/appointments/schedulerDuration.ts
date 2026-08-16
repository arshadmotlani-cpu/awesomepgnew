import { SLOT_MIN } from './schedulerConstants';

export function snapshotDurationMinutes(
  services: Array<{ durationMinutes: number }>,
): number {
  return services.reduce((sum, s) => sum + s.durationMinutes, 0);
}

export function slotDurationMinutes(startAt: string, endAt: string): number {
  const ms = new Date(endAt).getTime() - new Date(startAt).getTime();
  return Math.max(SLOT_MIN, Math.round(ms / 60_000));
}

export function hasCustomAppointmentDuration(
  startAt: string,
  endAt: string,
  services: Array<{ durationMinutes: number }>,
): boolean {
  const slot = slotDurationMinutes(startAt, endAt);
  const snapshot = snapshotDurationMinutes(services);
  return slot !== snapshot;
}
