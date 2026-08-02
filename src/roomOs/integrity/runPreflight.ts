/**
 * Integrity Engine — canonical preflight entry (ADR-OR-001).
 */

import { buildIntegrityPreflightReport } from '@/src/roomOs/integrity/buildReport';
import { runPreflightChecks } from '@/src/roomOs/integrity/runChecks';
import type { PreflightError, PreflightScope, IntegrityPreflightReport } from '@/src/roomOs/integrity/types';
import { validatePreflightScope } from '@/src/roomOs/integrity/validateScope';

export type RunPreflightResult =
  | { ok: true; report: IntegrityPreflightReport }
  | { ok: false; error: PreflightError };

/** Read-only duplicate and invariant preflight — no writes, no repair. */
export async function runPreflight(scope: PreflightScope): Promise<RunPreflightResult> {
  const validated = await validatePreflightScope(scope);
  if (!validated.ok) {
    return { ok: false, error: validated.error };
  }

  try {
    const results = await runPreflightChecks(validated.scope);
    const report = buildIntegrityPreflightReport({
      scope: validated.scope,
      results,
    });
    return { ok: true, report };
  } catch (err) {
    return {
      ok: false,
      error: {
        code: 'RULE_EVALUATION_FAILED',
        message: err instanceof Error ? err.message : 'Integrity preflight evaluation failed.',
      },
    };
  }
}
