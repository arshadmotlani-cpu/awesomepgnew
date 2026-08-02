/**
 * PropertyProjector outbox handler registration surface.
 */

import { materializePropertyIndexFromEvent } from '@/src/roomOs/projectors/property/rebuildPropertyIndex';
import type { RoomOsProjector } from '@/src/roomOs/projectors/types';

export const PROPERTY_PROJECTOR_EVENT_TYPES = [
  'property_index.rebuild_requested',
  'occupancy.bed_assigned',
  'occupancy.bed_vacated',
  'electricity.meter_reading_recorded',
  'electricity.bill_status_changed',
  'ledger.rent_projection_updated',
  'ledger.deposit_projection_updated',
] as const;

export const propertyProjector: RoomOsProjector = {
  id: 'PropertyProjector',
  handles: PROPERTY_PROJECTOR_EVENT_TYPES,
  project: materializePropertyIndexFromEvent,
};
