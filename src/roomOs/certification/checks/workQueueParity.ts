/**
 * Work queue materialized vs live parity checks.
 */

import {
  failFinding,
  passFinding,
  warnFinding,
} from '@/src/roomOs/certification/buildReport';
import type { CertificationCheckContext, CertificationFinding } from '@/src/roomOs/certification/types';
import { projectPropertyOsBundle } from '@/src/roomOs/projectors/property';
import { loadMaterializedWorkQueue } from '@/src/roomOs/projectors/workQueue/persistWorkQueueIndex';
import type { WorkQueueBucket, WorkQueueSnapshot } from '@/src/roomOs/types';

function bucketCounts(snapshot: WorkQueueSnapshot): Record<string, number> {
  const counts: Partial<Record<WorkQueueBucket, number>> = {};
  for (const item of snapshot.items) {
    counts[item.bucket] = (counts[item.bucket] ?? 0) + 1;
  }
  return counts;
}

function compareWorkQueueSnapshots(
  materialized: WorkQueueSnapshot,
  live: WorkQueueSnapshot,
): CertificationFinding[] {
  const findings: CertificationFinding[] = [];

  if (materialized.contentHash === live.contentHash) {
    findings.push(
      passFinding(
        'WORK_QUEUE_MATERIALIZED_PARITY',
        'work_queue',
        `Work queue contentHash matches (${live.contentHash.slice(0, 12)}…).`,
      ),
    );
  } else {
    findings.push(
      failFinding(
        'WORK_QUEUE_MATERIALIZED_PARITY',
        'work_queue',
        'Work queue contentHash mismatch between materialized and live projections.',
        materialized.contentHash,
        live.contentHash,
      ),
    );
  }

  const expectedCount = String(materialized.items.length);
  const actualCount = String(live.items.length);
  if (expectedCount === actualCount) {
    findings.push(
      passFinding(
        'WORK_QUEUE_MATERIALIZED_PARITY',
        'work_queue',
        `Work queue item count matches (${expectedCount}).`,
      ),
    );
  } else {
    findings.push(
      failFinding(
        'WORK_QUEUE_MATERIALIZED_PARITY',
        'work_queue',
        'Work queue item count mismatch.',
        expectedCount,
        actualCount,
      ),
    );
  }

  const materializedBuckets = bucketCounts(materialized);
  const liveBuckets = bucketCounts(live);
  const allBuckets = new Set([...Object.keys(materializedBuckets), ...Object.keys(liveBuckets)]);
  for (const bucket of allBuckets) {
    const expected = String(materializedBuckets[bucket] ?? 0);
    const actual = String(liveBuckets[bucket] ?? 0);
    if (expected === actual) {
      findings.push(
        passFinding(
          'WORK_QUEUE_MATERIALIZED_PARITY',
          'work_queue',
          `Bucket ${bucket} count matches (${expected}).`,
          { bucket },
        ),
      );
    } else {
      findings.push(
        failFinding(
          'WORK_QUEUE_MATERIALIZED_PARITY',
          'work_queue',
          `Bucket ${bucket} count mismatch.`,
          expected,
          actual,
          { bucket },
        ),
      );
    }
  }

  return findings;
}

export async function runWorkQueueParityChecks(
  ctx: CertificationCheckContext,
): Promise<CertificationFinding[]> {
  const materialized = await loadMaterializedWorkQueue({
    pgId: ctx.pgId,
    billingMonth: ctx.billingMonth,
  });
  const bundle = await projectPropertyOsBundle({
    pgId: ctx.pgId,
    billingMonth: ctx.billingMonth,
    asOf: ctx.asOf,
  });
  const live = bundle?.workQueue ?? null;

  if (!live) {
    return [
      failFinding(
        'WORK_QUEUE_MATERIALIZED_PARITY',
        'work_queue',
        'Live WorkQueueProjector returned no snapshot.',
      ),
    ];
  }

  if (!materialized) {
    return [
      warnFinding(
        'WORK_QUEUE_MATERIALIZED_PARITY',
        'work_queue',
        'No materialized work_queue_index row — live fallback only (pre-cutover).',
        'materialized',
        'live_only',
      ),
      passFinding(
        'WORK_QUEUE_MATERIALIZED_PARITY',
        'work_queue',
        `Live work queue has ${live.items.length} item(s); contentHash ${live.contentHash.slice(0, 12)}…`,
      ),
    ];
  }

  return compareWorkQueueSnapshots(materialized, live);
}
