/**
 * Projector registry — Wave 2 PropertyProjector wired to outbox.
 */

import { propertyProjector } from '@/src/roomOs/projectors/property/propertyProjectorHandler';
import { workQueueProjector } from '@/src/roomOs/projectors/workQueue/workQueueProjectorHandler';
import type { RoomOsProjector } from '@/src/roomOs/projectors/types';

const noopProjector = (id: string, handles: readonly string[]): RoomOsProjector => ({
  id,
  handles,
  project: async () => {
    /* Wave 2+: materialize snapshots */
  },
});

/** Registered projectors — PropertyProjector then WorkQueueProjector materialize indexes. */
export const ROOM_OS_PROJECTORS: readonly RoomOsProjector[] = [
  propertyProjector,
  workQueueProjector,
  noopProjector('RoomProjector', ['electricity.bill_status_changed', 'electricity.meter_reading_recorded']),
  noopProjector('BedProjector', ['occupancy.bed_assigned', 'occupancy.bed_vacated']),
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
