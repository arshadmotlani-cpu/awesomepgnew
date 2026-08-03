/**
 * DB-published rules store types — Wave 5.
 */

import type { RuleDefinition, RuleOverrideMode, RuleScope } from '@/src/roomOs/rules/catalog/v1';
import type { RoomOsPublishedRuleRow } from '@/src/db/schema/roomOsPublishedRules';

export type RuleAuditMetadata = {
  publishedAt: string;
  publishedBy: string;
  sourceRef: string;
  contentDigest: string;
  version: number;
  supersedesPublicationId: string | null;
};

export type PublishedRuleRecord = RuleDefinition &
  RuleAuditMetadata & {
    publicationId: string;
    status: 'active' | 'inactive';
    scopeRef: string | null;
    effectiveFrom: string;
    effectiveTo: string | null;
  };

export type PublishRuleInput = {
  ruleId: string;
  scope: RuleScope;
  scopeRef?: string | null;
  overrideMode: RuleOverrideMode;
  description: string;
  factKey: string;
  outcome: Record<string, unknown>;
  publishedBy: string;
  sourceRef?: string;
  effectiveFrom?: string;
  activate?: boolean;
};

export type ActivateRuleInput = {
  publicationId: string;
  publishedBy: string;
  sourceRef?: string;
  effectiveFrom?: string;
};

export type DeactivateRuleInput = {
  publicationId: string;
  publishedBy: string;
  sourceRef?: string;
  effectiveTo?: string;
};

export type LoadPublishedRulesInput = {
  pgId: string;
  asOf: string;
  floorId?: string;
  roomId?: string;
  bedId?: string;
  bookingId?: string;
};

export function mapPublishedRuleRow(row: RoomOsPublishedRuleRow): PublishedRuleRecord {
  return {
    publicationId: row.id,
    id: row.ruleId,
    scope: row.scope as RuleScope,
    scopeRef: row.scopeRef,
    overrideMode: row.overrideMode as RuleOverrideMode,
    description: row.description,
    factKey: row.factKey,
    outcome: row.outcome,
    status: row.status as 'active' | 'inactive',
    effectiveFrom: row.effectiveFrom.toISOString(),
    effectiveTo: row.effectiveTo?.toISOString() ?? null,
    publishedAt: row.publishedAt.toISOString(),
    publishedBy: row.publishedBy,
    sourceRef: row.sourceRef,
    contentDigest: row.contentDigest,
    version: row.version,
    supersedesPublicationId: row.supersedesPublicationId,
  };
}

export function toRuleDefinition(record: PublishedRuleRecord): RuleDefinition {
  return {
    id: record.id,
    scope: record.scope,
    overrideMode: record.overrideMode,
    description: record.description,
    factKey: record.factKey,
    outcome: record.outcome,
  };
}
