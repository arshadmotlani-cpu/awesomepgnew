import type { ScheduledRoomConfigurationSummary } from '@/src/services/roomConfigurationSchedule';

/** Nearest future scheduled row to prefill Edit Rent / Change Type dialogs. */
export function pickPrimaryScheduledConfigurationForEditing(
  schedules: ScheduledRoomConfigurationSummary[],
): ScheduledRoomConfigurationSummary | null {
  if (schedules.length === 0) return null;
  const sorted = [...schedules].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  return sorted[0] ?? null;
}
