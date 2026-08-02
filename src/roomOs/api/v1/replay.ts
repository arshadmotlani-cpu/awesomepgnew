/**
 * replay/v1/runSample — read-only conditional Replay Engine API (Wave 4).
 */

import { runReplay } from '@/src/roomOs/replay/runReplay';
import type { ReplayReport, ReplayScope } from '@/src/roomOs/replay/types';

export type RunReplaySampleInput = ReplayScope;

export type RunReplaySampleApiResult = {
  apiVersion: 'replay/v1';
  status: ReplayReport['status'];
  report: ReplayReport;
};

export async function runReplaySample(input: RunReplaySampleInput): Promise<RunReplaySampleApiResult> {
  const report = await runReplay(input);
  return {
    apiVersion: 'replay/v1',
    status: report.status,
    report,
  };
}

/** Alias matching ROOM_OS.md service method name. */
export const runReplaySampleV1 = runReplaySample;
