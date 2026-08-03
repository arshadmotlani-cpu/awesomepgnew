/**
 * Deterministic rule body digest — ADR-OR-001 digest pinning.
 */

import { createHash } from 'node:crypto';

export type CanonicalRuleBody = {
  ruleId: string;
  scope: string;
  scopeRef: string | null;
  overrideMode: string;
  description: string;
  factKey: string;
  outcome: Record<string, unknown>;
};

function sortObjectKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortObjectKeys);
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return Object.keys(record)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortObjectKeys(record[key]);
        return acc;
      }, {});
  }
  return value;
}

export function buildCanonicalRuleBody(input: CanonicalRuleBody): string {
  return JSON.stringify({
    ruleId: input.ruleId,
    scope: input.scope,
    scopeRef: input.scopeRef,
    overrideMode: input.overrideMode,
    description: input.description,
    factKey: input.factKey,
    outcome: sortObjectKeys(input.outcome),
  });
}

export function computeRuleContentDigest(input: CanonicalRuleBody): string {
  return createHash('sha256').update(buildCanonicalRuleBody(input)).digest('hex');
}
