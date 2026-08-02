export { assemblePropertyOsIndex, aggregateKpiStrip, aggregateElectricityProgress, buildRoomIndexEntries, countOccupiedBeds, emptyWorkQueueSummary, formatRoomOccupancySummary, WORK_QUEUE_NOT_MATERIALIZED_HASH } from '@/src/roomOs/projectors/property/aggregatePropertyIndex';
export type { AssemblePropertyIndexInput } from '@/src/roomOs/projectors/property/aggregatePropertyIndex';
export { loadPropertyInventory, propertyExists } from '@/src/roomOs/projectors/property/loadPropertyInventory';
export type { PropertyInventory, PropertyInventoryRoom } from '@/src/roomOs/projectors/property/loadPropertyInventory';
export {
  projectPropertyOsBundle,
  projectPropertyOsIndex,
} from '@/src/roomOs/projectors/property/projectPropertyIndex';
export type { PropertyOsProjectionBundle } from '@/src/roomOs/projectors/property/projectPropertyIndex';
export { extractPropertyIndexRebuildInput } from '@/src/roomOs/projectors/property/extractPropertyIndexRebuildInput';
export type { PropertyIndexRebuildInput } from '@/src/roomOs/projectors/property/extractPropertyIndexRebuildInput';
export {
  loadMaterializedPropertyIndex,
  upsertMaterializedPropertyIndex,
} from '@/src/roomOs/projectors/property/persistPropertyIndex';
export {
  enqueuePropertyIndexRebuild,
  materializePropertyIndexFromEvent,
  rebuildPropertyOsIndex,
} from '@/src/roomOs/projectors/property/rebuildPropertyIndex';
export {
  PROPERTY_PROJECTOR_EVENT_TYPES,
  propertyProjector,
} from '@/src/roomOs/projectors/property/propertyProjectorHandler';
