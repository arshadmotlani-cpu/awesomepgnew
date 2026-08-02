/**
 * Replay Engine orchestrator — Wave 4 conditional read-only replay.
 */

import { compareReplayParity } from '@/src/roomOs/replay/compareReplayParity';
import { dryRunProjectionFromEvent } from '@/src/roomOs/replay/dryRunProjection';
import {
  formatCoverageSkipReason,
  measureEventCoverage,
} from '@/src/roomOs/replay/measureEventCoverage';
import { selectReplaySample } from '@/src/roomOs/replay/selectReplaySample';
import type { ReplayReport, ReplayScope } from '@/src/roomOs/replay/types';

export async function runReplay(scope: ReplayScope): Promise<ReplayReport> {
  const coverage = await measureEventCoverage({
    pgId: scope.pgId,
    billingMonth: scope.billingMonth,
  });

  if (!coverage.eligible) {
    return {
      contractVersion: 'replay/v1',
      scope,
      status: 'skipped',
      skipReason: formatCoverageSkipReason(coverage),
      coverage,
      samples: [],
      passCount: 0,
      failCount: 0,
      computedAt: new Date().toISOString(),
    };
  }

  const events = await selectReplaySample({
    pgId: scope.pgId,
    billingMonth: scope.billingMonth,
    sampleSize: scope.sampleSize,
  });

  if (events.length === 0) {
    return {
      contractVersion: 'replay/v1',
      scope,
      status: 'not_found',
      skipReason: 'No processed property_index.rebuild_requested events found for replay sample.',
      coverage,
      samples: [],
      passCount: 0,
      failCount: 0,
      computedAt: new Date().toISOString(),
    };
  }

  const samples = [];
  for (const event of events) {
    const dryRun = await dryRunProjectionFromEvent(event);
    if (!dryRun) {
      samples.push({
        eventId: event.eventId,
        eventType: event.eventType,
        sourceRef: event.sourceRef,
        matches: false,
        mismatches: ['dry-run projection returned null'],
        dryRunContentHash: 'null',
        materializedContentHash: 'unknown',
      });
      continue;
    }
    samples.push(await compareReplayParity({ event, dryRun }));
  }

  const passCount = samples.filter((s) => s.matches).length;
  const failCount = samples.length - passCount;

  return {
    contractVersion: 'replay/v1',
    scope,
    status: 'ready',
    coverage,
    samples,
    passCount,
    failCount,
    computedAt: new Date().toISOString(),
  };
}
