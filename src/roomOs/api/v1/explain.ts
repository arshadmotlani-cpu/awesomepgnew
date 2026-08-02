/**
 * explain/v1/getExplanation — read-only Explain Engine API (Wave 4).
 */

import { runExplain } from '@/src/roomOs/explain/runExplain';
import type { ExplainScope, ExplanationReport } from '@/src/roomOs/explain/types';

export type GetExplanationInput = ExplainScope;

export type GetExplanationApiResult = {
  apiVersion: 'explain/v1';
  status: ExplanationReport['status'];
  report: ExplanationReport;
};

export async function getExplanation(input: GetExplanationInput): Promise<GetExplanationApiResult> {
  const report = await runExplain(input);
  return {
    apiVersion: 'explain/v1',
    status: report.status,
    report,
  };
}

/** Alias matching ROOM_OS.md service method name. */
export const getExplanationV1 = getExplanation;
