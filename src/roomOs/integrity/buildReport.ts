/**
 * Assembles IntegrityPreflightReport from check results.
 */

import { randomUUID } from 'node:crypto';
import {
  computeIntegrityRulePackDigest,
  INTEGRITY_PREFLIGHT_V1_ID,
} from '@/src/roomOs/integrity/catalog/v1';
import { computeScopeDigest } from '@/src/roomOs/integrity/scopeDigest';
import type { PreflightCheckResults } from '@/src/roomOs/integrity/runChecks';
import {
  INTEGRITY_CONTRACT_VERSION,
  type IntegrityFinding,
  type IntegrityPreflightReport,
  type PreflightScope,
} from '@/src/roomOs/integrity/types';

function collectWarnings(results: PreflightCheckResults): IntegrityFinding[] {
  const warnings: IntegrityFinding[] = [];
  for (const finding of results.duplicates) {
    if (finding.severity !== 'warn') continue;
    warnings.push({
      severity: finding.severity,
      reasonCode: finding.reasonCode,
      description: finding.description,
      context: { entityIds: finding.entityIds, naturalKey: finding.naturalKey },
    });
  }
  for (const finding of results.invariants) {
    if (finding.severity !== 'warn') continue;
    warnings.push({
      severity: finding.severity,
      reasonCode: finding.reasonCode,
      description: finding.description,
      context: finding.context,
    });
  }
  return warnings;
}

export function buildIntegrityPreflightReport(input: {
  scope: PreflightScope;
  results: PreflightCheckResults;
  computedAt?: string;
  reportId?: string;
}): IntegrityPreflightReport {
  const computedAt = input.computedAt ?? new Date().toISOString();
  const scopeDigest = computeScopeDigest(input.scope);
  const rulePackDigest = computeIntegrityRulePackDigest();

  const blockReasons: string[] = [];
  for (const dup of input.results.duplicates) {
    if (dup.severity === 'block') blockReasons.push(dup.description);
  }
  for (const inv of input.results.invariants) {
    if (inv.severity === 'block') blockReasons.push(inv.description);
  }

  const warnings = collectWarnings(input.results);
  const blockCount =
    input.results.duplicates.filter((d) => d.severity === 'block').length +
    input.results.invariants.filter((i) => i.severity === 'block').length;
  const warnCount = warnings.length;

  return {
    reportId: input.reportId ?? randomUUID(),
    contractVersion: INTEGRITY_CONTRACT_VERSION,
    rulePackId: INTEGRITY_PREFLIGHT_V1_ID,
    rulePackDigest,
    scopeDigest,
    computedAt,
    blocked: blockCount > 0,
    blockReasons,
    duplicates: input.results.duplicates,
    invariants: input.results.invariants,
    warnings,
    summary: {
      duplicateCount: input.results.duplicates.length,
      invariantCount: input.results.invariants.length,
      warningCount: warnCount,
      blockCount,
      warnCount,
    },
  };
}
