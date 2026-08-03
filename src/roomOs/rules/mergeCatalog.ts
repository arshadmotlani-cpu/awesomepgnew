/**
 * Merge code catalog with DB-published rules — deterministic, no duplicated business rules.
 */

import {
  RULES_CATALOG_V1,
  type RuleDefinition,
} from '@/src/roomOs/rules/catalog/v1';

export function mergePublishedRulesWithCatalog(
  publishedRules: readonly RuleDefinition[],
): readonly RuleDefinition[] {
  if (publishedRules.length === 0) {
    return RULES_CATALOG_V1;
  }

  const publishedFactKeys = new Set(publishedRules.map((rule) => rule.factKey));
  const catalogFallback = RULES_CATALOG_V1.filter(
    (rule) => !publishedFactKeys.has(rule.factKey),
  );

  return [...catalogFallback, ...publishedRules].sort((a, b) => a.id.localeCompare(b.id));
}

export function buildCodeOnlyCatalog(): readonly RuleDefinition[] {
  return RULES_CATALOG_V1;
}
