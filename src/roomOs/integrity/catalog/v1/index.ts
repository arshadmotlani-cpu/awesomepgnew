/**
 * Integrity preflight catalog v1 exports.
 */

import { createHash } from 'node:crypto';
import { INTEGRITY_PREFLIGHT_RULES_V1 } from '@/src/roomOs/integrity/catalog/v1/rules';

export const INTEGRITY_PREFLIGHT_V1_ID = 'integrity-preflight-v1';

export { INTEGRITY_PREFLIGHT_RULES_V1, ruleAppliesToScenario } from '@/src/roomOs/integrity/catalog/v1/rules';
export type { IntegrityRuleDefinition } from '@/src/roomOs/integrity/catalog/v1/rules';
export {
  isPreflightScenario,
  SCENARIO_SCOPE_REQUIREMENTS,
} from '@/src/roomOs/integrity/catalog/v1/scenarios';
export type { ScenarioScopeRequirements } from '@/src/roomOs/integrity/catalog/v1/scenarios';

export function computeIntegrityRulePackDigest(): string {
  const canonical = INTEGRITY_PREFLIGHT_RULES_V1.map((rule) => ({
    reasonCode: rule.reasonCode,
    severity: rule.severity,
    duplicateKind: rule.duplicateKind ?? null,
    invariantKind: rule.invariantKind ?? null,
    scenarios: rule.scenarios === 'all' ? 'all' : [...rule.scenarios].sort(),
    description: rule.description,
  }));
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}
