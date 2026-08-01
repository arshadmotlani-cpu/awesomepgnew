/**
 * Projector registry — Wave 1 engines register here.
 */

import type { RoomOsProjector } from '@/src/roomOs/projectors/types';

const noopProjector = (id: string, handles: readonly string[]): RoomOsProjector => ({
  id,
  handles,
  project: async () => {
    /* Wave 1: materialize snapshots */
  },
});

/** Registered projectors — Wave 0 stubs only. */
export const ROOM_OS_PROJECTORS: readonly RoomOsProjector[] = [
  noopProjector('PropertyProjector', ['property_index.materialized']),
  noopProjector('RoomProjector', ['electricity.bill_status_changed', 'electricity.meter_reading_recorded']),
  noopProjector('BedProjector', ['occupancy.bed_assigned', 'occupancy.bed_vacated']),
  noopProjector('WorkQueueProjector', ['work_queue.rebuilt', 'ledger.rent_projection_updated']),
  noopProjector('LedgerProjectionProjector', [
    'ledger.rent_projection_updated',
    'ledger.deposit_projection_updated',
  ]),
];

export function getProjectorsForEventType(eventType: string): RoomOsProjector[] {
  return ROOM_OS_PROJECTORS.filter(
    (p) => p.handles.length === 0 || p.handles.includes(eventType),
  );
}
