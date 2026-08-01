/**
 * Room OS domain event type catalog — Layer A (append-only).
 * Distinct from billing_events (collections lifecycle).
 */

export const ROOM_OS_EVENT_TYPES = [
  'occupancy.bed_assigned',
  'occupancy.bed_vacated',
  'electricity.meter_reading_recorded',
  'electricity.bill_status_changed',
  'ledger.rent_projection_updated',
  'ledger.deposit_projection_updated',
  'work_queue.rebuilt',
  'property_index.materialized',
  'integrity.flag_raised',
] as const;

export type RoomOsEventType = (typeof ROOM_OS_EVENT_TYPES)[number];

export function isRoomOsEventType(value: string): value is RoomOsEventType {
  return (ROOM_OS_EVENT_TYPES as readonly string[]).includes(value);
}
