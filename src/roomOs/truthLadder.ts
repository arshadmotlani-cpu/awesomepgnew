/**
 * Truth ladder constants and helpers — docs/ROOM_OS.md.
 */

import { TRUTH_LEVELS, type TruthLevel } from '@/src/roomOs/types';

export { TRUTH_LEVELS };

export type TruthLevelMeta = {
  level: TruthLevel;
  name: string;
  description: string;
};

export const TRUTH_LADDER: readonly TruthLevelMeta[] = [
  {
    level: TRUTH_LEVELS.LEDGER_WRITE,
    name: 'Ledger write truth',
    description: 'PostgreSQL ledger rows — authoritative for persisted money.',
  },
  {
    level: TRUTH_LEVELS.DOMAIN_EVENT,
    name: 'Domain event audit truth',
    description: 'Append-only room_os_outbox and lifecycle streams.',
  },
  {
    level: TRUTH_LEVELS.MATERIALIZED_PROJECTION,
    name: 'Materialized projection serve truth',
    description: 'Property index, work queue, room/bed snapshots.',
  },
  {
    level: TRUTH_LEVELS.TIMELINE_DISPLAY,
    name: 'Timeline display truth',
    description: 'Human-readable entries rebuilt from events.',
  },
] as const;

/** Replay gate — Wave 4 only when event coverage meets threshold. */
export const REPLAY_MIN_EVENT_COVERAGE = 0.9;

export function isReplayEligible(eventCoverageRatio: number): boolean {
  return eventCoverageRatio >= REPLAY_MIN_EVENT_COVERAGE;
}
