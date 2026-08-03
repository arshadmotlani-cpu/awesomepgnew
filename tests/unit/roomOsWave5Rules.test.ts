/**
 * Room OS Wave 5 — DB-published rules unit tests.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  buildEffectiveRulePack,
  buildEffectiveRulePackFromMergedCatalog,
  resolveEffectiveRules,
  RULES_DB_V1_ID,
} from '@/src/roomOs/rules/effectivePack';
import { mergePublishedRulesWithCatalog } from '@/src/roomOs/rules/mergeCatalog';
import { computeRuleContentDigest } from '@/src/roomOs/rules/store/canonicalDigest';
import { RULES_CATALOG_V1 } from '@/src/roomOs/rules/catalog/v1';

describe('Room OS Wave 5 — Rules', () => {
  test('canonical digest is stable for catalog seed rules', () => {
    const rule = RULES_CATALOG_V1[0]!;
    const digestA = computeRuleContentDigest({
      ruleId: rule.id,
      scope: rule.scope,
      scopeRef: null,
      overrideMode: rule.overrideMode,
      description: rule.description,
      factKey: rule.factKey,
      outcome: rule.outcome,
    });
    const digestB = computeRuleContentDigest({
      ruleId: rule.id,
      scope: rule.scope,
      scopeRef: null,
      overrideMode: rule.overrideMode,
      description: rule.description,
      factKey: rule.factKey,
      outcome: rule.outcome,
    });
    assert.equal(digestA, digestB);
    assert.equal(digestA.length, 64);
  });

  test('mergePublishedRulesWithCatalog falls back to code catalog when empty', () => {
    const merged = mergePublishedRulesWithCatalog([]);
    assert.equal(merged.length, RULES_CATALOG_V1.length);
  });

  test('mergePublishedRulesWithCatalog overrides factKeys from DB rules', () => {
    const dbRule = {
      id: 'global.electricity.require_meter_before_bill',
      scope: 'global' as const,
      overrideMode: 'replace' as const,
      description: 'Override meter rule',
      factKey: 'electricity.meterReadingState',
      outcome: { required: 'current', blockReason: 'override' },
    };
    const merged = mergePublishedRulesWithCatalog([dbRule]);
    const meterRules = merged.filter((r) => r.factKey === 'electricity.meterReadingState');
    assert.equal(meterRules.length, 1);
    assert.equal(meterRules[0]?.outcome.blockReason, 'override');
  });

  test('DB merged pack uses rules-db-v1 catalog id', () => {
    const pgId = '00000000-0000-4000-8000-000000000010';
    const asOf = '2026-08-01T00:00:00.000Z';
    const merged = mergePublishedRulesWithCatalog([...RULES_CATALOG_V1]);
    const pack = buildEffectiveRulePackFromMergedCatalog(merged, pgId, asOf, {}, true);
    assert.equal(pack.catalogId, RULES_DB_V1_ID);
    assert.match(pack.id, new RegExp(`^${RULES_DB_V1_ID}:`));
  });

  test('code-only and merged seed packs resolve same rule ids', () => {
    const pgId = '00000000-0000-4000-8000-000000000011';
    const asOf = '2026-08-01T00:00:00.000Z';
    const ctx = { pgId, roomId: 'room-1', bedId: 'bed-1', bookingId: 'booking-1' };
    const codeRules = resolveEffectiveRules(RULES_CATALOG_V1, ctx);
    const mergedRules = resolveEffectiveRules(mergePublishedRulesWithCatalog([...RULES_CATALOG_V1]), ctx);
    assert.deepEqual(
      codeRules.map((r) => r.id).sort(),
      mergedRules.map((r) => r.id).sort(),
    );
  });

  test('buildEffectiveRulePack remains sync code-catalog path for Wave 0 compat', () => {
    const pgId = '00000000-0000-4000-8000-000000000012';
    const a = buildEffectiveRulePack(pgId, '2026-08-01T00:00:00.000Z');
    const b = buildEffectiveRulePack(pgId, '2026-08-01T00:00:00.000Z');
    assert.equal(a.id, b.id);
    assert.equal(a.catalogId, 'rules-catalog-v1');
  });
});
