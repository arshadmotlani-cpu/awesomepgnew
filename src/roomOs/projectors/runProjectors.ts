/**
 * Run registered projectors for a single outbox event.
 */

import { getProjectorsForEventType } from '@/src/roomOs/projectors/registry';
import type { ProjectorRunResult } from '@/src/roomOs/projectors/types';
import type { RoomOsEventEnvelope } from '@/src/roomOs/types';

export async function runProjectorsForEvent(
  event: RoomOsEventEnvelope,
): Promise<ProjectorRunResult[]> {
  const projectors = getProjectorsForEventType(event.eventType);
  const results: ProjectorRunResult[] = [];

  for (const projector of projectors) {
    const handled = projector.handles.includes(event.eventType);
    if (handled) {
      await projector.project(event);
    }
    results.push({ projectorId: projector.id, handled });
  }

  return results;
}
