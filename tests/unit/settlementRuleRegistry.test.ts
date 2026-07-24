import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ALL_SETTLEMENT_BUSINESS_RULE_IDS,
  EXPLANATION_RULE_TO_BR,
  SETTLEMENT_RULE_REGISTRY,
} from '@/src/lib/billing/settlementRuleRegistry';
import {
  SETTLEMENT_BUSINESS_RULES,
  SETTLEMENT_EXPLANATION_LINE_IDS,
} from '@/src/lib/vacating/moveOutSettlementExplanation';

test('every BR-* has registry entry with ssotModule', () => {
  for (const id of ALL_SETTLEMENT_BUSINESS_RULE_IDS) {
    const entry = SETTLEMENT_RULE_REGISTRY[id];
    assert.ok(entry, id);
    assert.ok(entry.ssotModule.length > 0, id);
  }
});

test('every SETTLEMENT_BUSINESS_RULES id maps to a BR-*', () => {
  for (const rule of Object.values(SETTLEMENT_BUSINESS_RULES)) {
    assert.ok(
      EXPLANATION_RULE_TO_BR[rule.id as keyof typeof EXPLANATION_RULE_TO_BR],
      `missing BR mapping for ${rule.id}`,
    );
  }
});

test('every non-display-only BR has at least one invariant or explanation rule', () => {
  for (const entry of Object.values(SETTLEMENT_RULE_REGISTRY)) {
    if (entry.displayOnly) continue;
    const hasEnforcement =
      entry.invariantIds.length > 0 || entry.explanationRuleIds.length > 0;
    assert.ok(hasEnforcement, entry.id);
  }
});

test('explanation line ids are stable strings', () => {
  assert.ok(SETTLEMENT_EXPLANATION_LINE_IDS.length >= 9);
  for (const id of SETTLEMENT_EXPLANATION_LINE_IDS) {
    assert.match(id, /^[a-z0-9_]+$/);
  }
});
