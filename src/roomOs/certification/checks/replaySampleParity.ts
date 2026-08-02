/**
 * Wave 4 — replay sample parity certification check.
 */

import {
  failFinding,
  passFinding,
  warnFinding,
} from '@/src/roomOs/certification/buildReport';
import type { CertificationCheckContext, CertificationFinding } from '@/src/roomOs/certification/types';
import { runReplay } from '@/src/roomOs/replay/runReplay';

export async function runReplaySampleParityChecks(
  ctx: CertificationCheckContext,
): Promise<CertificationFinding[]> {
  const findings: CertificationFinding[] = [];
  const report = await runReplay({
    pgId: ctx.pgId,
    billingMonth: ctx.billingMonth,
    asOf: ctx.asOf,
    sampleSize: 5,
  });

  if (report.status === 'skipped') {
    findings.push(
      warnFinding(
        'REPLAY_SAMPLE_PARITY',
        'replay',
        report.skipReason ?? 'Replay skipped — coverage below 90% threshold.',
        undefined,
        undefined,
        { coverageRatio: report.coverage.ratio },
      ),
    );
    return findings;
  }

  if (report.status === 'not_found') {
    findings.push(
      warnFinding(
        'REPLAY_SAMPLE_PARITY',
        'replay',
        report.skipReason ?? 'No replay sample events found.',
      ),
    );
    return findings;
  }

  findings.push(
    passFinding(
      'REPLAY_SAMPLE_PARITY',
      'replay',
      `Event coverage ${(report.coverage.ratio * 100).toFixed(1)}% eligible; ${report.passCount}/${report.samples.length} samples matched materialized snapshots.`,
      {
        passCount: report.passCount,
        failCount: report.failCount,
        sampleSize: report.samples.length,
      },
    ),
  );

  for (const sample of report.samples) {
    if (sample.matches) continue;
    findings.push(
      failFinding(
        'REPLAY_SAMPLE_PARITY',
        'replay',
        `Replay mismatch for event ${sample.eventId} (${sample.sourceRef}).`,
        sample.materializedContentHash,
        sample.dryRunContentHash,
        { mismatches: sample.mismatches, eventId: sample.eventId },
      ),
    );
  }

  return findings;
}
