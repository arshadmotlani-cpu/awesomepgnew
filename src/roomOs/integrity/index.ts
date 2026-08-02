export type { PreflightScope, IntegrityPreflightReport, PreflightError } from '@/src/roomOs/integrity/types';
export { runPreflight } from '@/src/roomOs/integrity/runPreflight';
export type { RunPreflightResult } from '@/src/roomOs/integrity/runPreflight';
export {
  INTEGRITY_PREFLIGHT_V1_ID,
  INTEGRITY_PREFLIGHT_RULES_V1,
  computeIntegrityRulePackDigest,
  isPreflightScenario,
} from '@/src/roomOs/integrity/catalog/v1';
export { buildIntegrityPreflightReport } from '@/src/roomOs/integrity/buildReport';
export { computeScopeDigest, normalizePreflightScope } from '@/src/roomOs/integrity/scopeDigest';
export { validatePreflightScope } from '@/src/roomOs/integrity/validateScope';
