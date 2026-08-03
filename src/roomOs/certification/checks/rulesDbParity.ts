/**
 * Wave 5 — DB-published rules parity certification check.
 */

import {
  buildEffectiveRulePack,
  buildEffectiveRulePackFromMergedCatalog,
  RULES_DB_V1_ID,
} from '@/src/roomOs/rules/effectivePack';
import { mergePublishedRulesWithCatalog } from '@/src/roomOs/rules/mergeCatalog';
import { loadActivePublishedRules } from '@/src/roomOs/rules/store/loadPublishedRules';
import {
  failFinding,
  passFinding,
  warnFinding,
} from '@/src/roomOs/certification/buildReport';
import type { CertificationCheckContext, CertificationFinding } from '@/src/roomOs/certification/types';

export async function runRulesDbParityChecks(
  ctx: CertificationCheckContext,
): Promise<CertificationFinding[]> {
  const findings: CertificationFinding[] = [];

  try {
    const publishedRules = await loadActivePublishedRules({
      pgId: ctx.pgId,
      asOf: ctx.asOf,
    });

    if (publishedRules.length === 0) {
      findings.push(
        warnFinding(
          'RULES_DB_PARITY',
          'rules',
          'No DB-published rules found — using code catalog fallback.',
        ),
      );
      return findings;
    }

    const mergedCatalog = mergePublishedRulesWithCatalog(publishedRules);
    const codePack = buildEffectiveRulePack(ctx.pgId, ctx.asOf);
    const dbPack = buildEffectiveRulePackFromMergedCatalog(
      mergedCatalog,
      ctx.pgId,
      ctx.asOf,
      {},
      true,
    );

    const codeRuleIds = codePack.rules.map((r) => r.id).sort();
    const dbRuleIds = dbPack.rules.map((r) => r.id).sort();

    if (JSON.stringify(codeRuleIds) !== JSON.stringify(dbRuleIds)) {
      findings.push(
        failFinding(
          'RULES_DB_PARITY',
          'rules',
          'DB-published effective rules differ from code catalog seed.',
          codeRuleIds.join(','),
          dbRuleIds.join(','),
          { codePackId: codePack.id, dbPackId: dbPack.id },
        ),
      );
      return findings;
    }

    findings.push(
      passFinding(
        'RULES_DB_PARITY',
        'rules',
        `DB-published rules match code catalog for ${ctx.pgId} (${RULES_DB_V1_ID}).`,
        { packId: dbPack.id, ruleCount: dbPack.rules.length },
      ),
    );
  } catch (err) {
    findings.push(
      warnFinding(
        'RULES_DB_PARITY',
        'rules',
        err instanceof Error ? err.message : 'Rules DB parity check unavailable.',
      ),
    );
  }

  return findings;
}
