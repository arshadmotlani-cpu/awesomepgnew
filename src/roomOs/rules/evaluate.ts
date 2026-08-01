/**
 * Pure rule evaluation against a frozen effective pack — no I/O.
 */

import type { EffectiveRulePack } from '@/src/roomOs/rules/effectivePack';
import type { RuleDefinition } from '@/src/roomOs/rules/catalog/v1';

export type RuleEvaluationContext = {
  facts: Record<string, unknown>;
};

export type RuleOutcome = {
  ruleId: string;
  factKey: string;
  scope: RuleDefinition['scope'];
  matched: boolean;
  outcome: Record<string, unknown>;
};

function factMatches(factValue: unknown, rule: RuleDefinition): boolean {
  if (factValue === undefined) return false;
  const required = rule.outcome.required;
  if (required !== undefined) return factValue === required;
  return true;
}

export function evaluateRules(
  pack: EffectiveRulePack,
  ctx: RuleEvaluationContext,
): RuleOutcome[] {
  return pack.rules.map((rule) => {
    const factValue = ctx.facts[rule.factKey];
    const matched = factMatches(factValue, rule);
    return {
      ruleId: rule.id,
      factKey: rule.factKey,
      scope: rule.scope,
      matched,
      outcome: matched ? rule.outcome : {},
    };
  });
}

export function evaluateFact(
  pack: EffectiveRulePack,
  factKey: string,
  ctx: RuleEvaluationContext,
): RuleOutcome | null {
  return evaluateRules(pack, ctx).find((o) => o.factKey === factKey && o.matched) ?? null;
}
