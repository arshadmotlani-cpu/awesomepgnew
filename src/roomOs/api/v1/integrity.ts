/**
 * integrity/v1/runPreflight — read-only Integrity Engine API (ADR-OR-001).
 */

import { runPreflight } from '@/src/roomOs/integrity/runPreflight';
import type { PreflightScope, IntegrityPreflightReport, PreflightError } from '@/src/roomOs/integrity/types';

export type PreflightScopeInput = PreflightScope;

export type RunPreflightApiResult =
  | {
      apiVersion: 'integrity/v1';
      status: 'ready';
      report: IntegrityPreflightReport;
    }
  | {
      apiVersion: 'integrity/v1';
      status: 'error';
      error: PreflightError;
    };

export async function runPreflightApi(input: PreflightScopeInput): Promise<RunPreflightApiResult> {
  const result = await runPreflight(input);
  if (!result.ok) {
    return { apiVersion: 'integrity/v1', status: 'error', error: result.error };
  }
  return { apiVersion: 'integrity/v1', status: 'ready', report: result.report };
}

/** Alias matching ADR service method name. */
export const runPreflightV1 = runPreflightApi;
