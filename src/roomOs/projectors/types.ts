/**
 * Projector framework types — Wave 0 skeleton.
 */

import type { RoomOsEventEnvelope } from '@/src/roomOs/types';

export type RoomOsProjector = {
  id: string;
  /** Event types this projector handles; empty = no-op stub. */
  handles: readonly string[];
  project: (event: RoomOsEventEnvelope) => Promise<void> | void;
};

export type ProjectorRunResult = {
  projectorId: string;
  handled: boolean;
};
