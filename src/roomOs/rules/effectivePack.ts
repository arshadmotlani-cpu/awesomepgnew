/**
 * Precompute effective rule pack per (pgId, asOf) — frozen at snapshot materialize time.
 */

import { createHash } from 'node:crypto';
import {
  RULES_CATALOG_V1,
  RULES_CATALOG_V1_ID,
  RULE_SCOPE_PRECEDENCE,
  type RuleDefinition,
  type RuleScope,
} from '@/src/roomOs/rules/catalog/v1';

export const RULES_DB_V1_ID = 'rules-db-v1';

export type EffectiveRulePack = {
  id: string;
  catalogId: string;
  pgId: string;
  asOf: string;
  rules: RuleDefinition[];
  computedAt: string;
};

export type ScopeContext = {
  pgId: string;
  floorId?: string;
  roomId?: string;
  bedId?: string;
  bookingId?: string;
};

function scopeMatches(rule: RuleDefinition, ctx: ScopeContext): boolean {
  switch (rule.scope) {
    case 'global':
      return true;
    case 'property':
      return Boolean(ctx.pgId);
    case 'floor':
      return Boolean(ctx.floorId);
    case 'room':
      return Boolean(ctx.roomId);
    case 'bed':
      return Boolean(ctx.bedId);
    case 'booking':
      return Boolean(ctx.bookingId);
    default:
      return false;
  }
}

/**
 * Resolve effective rules: most specific scope wins per factKey when overrideMode is replace.
 */
export function resolveEffectiveRules(
  catalog: readonly RuleDefinition[],
  ctx: ScopeContext,
): RuleDefinition[] {
  const applicable = catalog.filter((rule) => scopeMatches(rule, ctx));
  const byFact = new Map<string, RuleDefinition>();

  for (const rule of applicable) {
    const existing = byFact.get(rule.factKey);
    if (!existing) {
      byFact.set(rule.factKey, rule);
      continue;
    }
    const rulePrecedence = RULE_SCOPE_PRECEDENCE[rule.scope as RuleScope];
    const existingPrecedence = RULE_SCOPE_PRECEDENCE[existing.scope as RuleScope];
    if (rulePrecedence > existingPrecedence) {
      byFact.set(rule.factKey, rule);
    } else if (
      rulePrecedence === existingPrecedence &&
      rule.overrideMode === 'merge' &&
      existing.overrideMode === 'merge'
    ) {
      byFact.set(rule.factKey, {
        ...existing,
        outcome: { ...existing.outcome, ...rule.outcome },
      });
    }
  }

  return [...byFact.values()].sort((a, b) => a.id.localeCompare(b.id));
}

export function buildEffectiveRulePackFromRules(
  catalog: readonly RuleDefinition[],
  pgId: string,
  asOf: string,
  ctx: Omit<ScopeContext, 'pgId'> = {},
  catalogId: string = RULES_CATALOG_V1_ID,
): EffectiveRulePack {
  const rules = resolveEffectiveRules(catalog, { pgId, ...ctx });
  const digest = createHash('sha256')
    .update(JSON.stringify({ catalogId, pgId, asOf, rules }))
    .digest('hex')
    .slice(0, 16);

  return {
    id: `${catalogId}:${pgId}:${digest}`,
    catalogId,
    pgId,
    asOf,
    rules,
    computedAt: new Date().toISOString(),
  };
}

/** Sync code-catalog-only pack — preserves Wave 0 unit test behavior. */
export function buildEffectiveRulePack(
  pgId: string,
  asOf: string,
  ctx: Omit<ScopeContext, 'pgId'> = {},
): EffectiveRulePack {
  return buildEffectiveRulePackFromRules(RULES_CATALOG_V1, pgId, asOf, ctx, RULES_CATALOG_V1_ID);
}

export function buildEffectiveRulePackFromMergedCatalog(
  catalog: readonly RuleDefinition[],
  pgId: string,
  asOf: string,
  ctx: Omit<ScopeContext, 'pgId'> = {},
  usesDbRules: boolean,
): EffectiveRulePack {
  const catalogId = usesDbRules ? RULES_DB_V1_ID : RULES_CATALOG_V1_ID;
  return buildEffectiveRulePackFromRules(catalog, pgId, asOf, ctx, catalogId);
}
