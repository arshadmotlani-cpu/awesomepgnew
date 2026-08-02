/**
 * WorkQueueProjector outbox handler registration surface.
 */

import { materializeWorkQueueFromEvent } from '@/src/roomOs/projectors/workQueue/rebuildWorkQueueIndex';
import type { RoomOsProjector } from '@/src/roomOs/projectors/types';

export const WORK_QUEUE_PROJECTOR_EVENT_TYPES = [
  'work_queue.rebuilt',
  'property_index.rebuild_requested',
  'occupancy.bed_assigned',
  'occupancy.bed_vacated',
  'electricity.meter_reading_recorded',
  'electricity.bill_status_changed',
  'ledger.rent_projection_updated',
  'ledger.deposit_projection_updated',
] as const;

export const workQueueProjector: RoomOsProjector = {
  id: 'WorkQueueProjector',
  handles: WORK_QUEUE_PROJECTOR_EVENT_TYPES,
  project: materializeWorkQueueFromEvent,
};
