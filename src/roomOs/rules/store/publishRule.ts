/**
 * Publish a new rule version — Wave 5 rule store.
 */

import { desc, eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { roomOsPublishedRules } from '@/src/db/schema/roomOsPublishedRules';
import { computeRuleContentDigest } from '@/src/roomOs/rules/store/canonicalDigest';
import {
  mapPublishedRuleRow,
  type PublishRuleInput,
  type PublishedRuleRecord,
} from '@/src/roomOs/rules/store/types';

export async function publishRule(input: PublishRuleInput): Promise<PublishedRuleRecord> {
  const scopeRef = input.scopeRef ?? null;
  const contentDigest = computeRuleContentDigest({
    ruleId: input.ruleId,
    scope: input.scope,
    scopeRef,
    overrideMode: input.overrideMode,
    description: input.description,
    factKey: input.factKey,
    outcome: input.outcome,
  });

  const [latest] = await db
    .select()
    .from(roomOsPublishedRules)
    .where(eq(roomOsPublishedRules.ruleId, input.ruleId))
    .orderBy(desc(roomOsPublishedRules.version))
    .limit(1);

  const nextVersion = (latest?.version ?? 0) + 1;
  const activate = input.activate !== false;
  const effectiveFrom = input.effectiveFrom ? new Date(input.effectiveFrom) : new Date();

  if (activate && latest?.status === 'active') {
    await db
      .update(roomOsPublishedRules)
      .set({
        status: 'inactive',
        effectiveTo: effectiveFrom,
      })
      .where(eq(roomOsPublishedRules.id, latest.id));
  }

  const [inserted] = await db
    .insert(roomOsPublishedRules)
    .values({
      ruleId: input.ruleId,
      version: nextVersion,
      scope: input.scope,
      scopeRef,
      overrideMode: input.overrideMode,
      description: input.description,
      factKey: input.factKey,
      outcome: input.outcome,
      status: activate ? 'active' : 'inactive',
      effectiveFrom,
      contentDigest,
      publishedBy: input.publishedBy,
      sourceRef: input.sourceRef ?? 'rules/v1/publish',
      supersedesPublicationId: latest?.id ?? null,
    })
    .returning();

  if (!inserted) {
    throw new Error(`Failed to publish rule ${input.ruleId}`);
  }

  return mapPublishedRuleRow(inserted);
}
