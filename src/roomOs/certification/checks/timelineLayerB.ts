/**
 * Wave 5 — Timeline Layer B certification check.
 */

import { createHash } from 'node:crypto';
import { desc, eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { roomOsOutbox } from '@/src/db/schema/roomOsOutbox';
import {
  failFinding,
  passFinding,
  warnFinding,
} from '@/src/roomOs/certification/buildReport';
import type { CertificationCheckContext, CertificationFinding } from '@/src/roomOs/certification/types';
import { aggregateTimeline } from '@/src/roomOs/timeline/aggregateTimeline';

export async function runTimelineLayerBChecks(
  ctx: CertificationCheckContext,
): Promise<CertificationFinding[]> {
  const findings: CertificationFinding[] = [];

  try {
    const [sample] = await db
      .select()
      .from(roomOsOutbox)
      .where(eq(roomOsOutbox.streamType, 'property'))
      .orderBy(desc(roomOsOutbox.occurredAt))
      .limit(1);

    if (!sample) {
      findings.push(
        warnFinding(
          'TIMELINE_LAYER_B',
          'timeline',
          'No outbox events found — timeline rebuild skipped.',
        ),
      );
      return findings;
    }

    const first = await aggregateTimeline({
      streamType: sample.streamType,
      streamId: sample.streamId,
      limit: 10,
    });
    const second = await aggregateTimeline({
      streamType: sample.streamType,
      streamId: sample.streamId,
      limit: 10,
    });

    const digest = (entries: typeof first.entries) => {
      const hash = createHash('sha256');
      hash.write(
        JSON.stringify(
          entries.map((e) => ({ eventId: e.eventId, title: e.title, summary: e.summary })),
        ),
      );
      return hash.digest('hex');
    };

    const firstDigest = digest(first.entries);
    const secondDigest = digest(second.entries);

    if (firstDigest !== secondDigest) {
      findings.push(
        failFinding(
          'TIMELINE_LAYER_B',
          'timeline',
          'Timeline rebuild is non-deterministic for sample stream.',
          firstDigest,
          secondDigest,
          { streamId: sample.streamId },
        ),
      );
      return findings;
    }

    findings.push(
      passFinding(
        'TIMELINE_LAYER_B',
        'timeline',
        `Timeline Layer B rebuilt ${first.entries.length} entries deterministically for stream ${sample.streamId}.`,
        { entryCount: first.entries.length, digest: firstDigest.slice(0, 16) },
      ),
    );
  } catch (err) {
    findings.push(
      warnFinding(
        'TIMELINE_LAYER_B',
        'timeline',
        err instanceof Error ? err.message : 'Timeline Layer B check unavailable.',
      ),
    );
  }

  return findings;
}
