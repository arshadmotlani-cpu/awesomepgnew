/**
 * WorkQueueProjector — materializes WorkQueueSnapshot from PropertyOsIndexSnapshot only.
 */

import { assembleWorkQueueSnapshot } from '@/src/roomOs/projectors/workQueue/aggregateWorkQueue';
import type { PropertyOsIndexSnapshot, WorkQueueSnapshot } from '@/src/roomOs/types';

export type WorkQueueProjectorInput = {
  propertyIndex: PropertyOsIndexSnapshot;
  computedAt?: string;
};

/** Project operational work queue — Property OS snapshot input only. */
export function projectWorkQueueSnapshot(input: WorkQueueProjectorInput): WorkQueueSnapshot {
  return assembleWorkQueueSnapshot({
    propertyIndex: input.propertyIndex,
    computedAt: input.computedAt,
  });
}
