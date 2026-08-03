/**
 * Deactivate a published rule row — Wave 5 rule store.
 */

import { eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { roomOsPublishedRules } from '@/src/db/schema/roomOsPublishedRules';
import { mapPublishedRuleRow, type DeactivateRuleInput, type PublishedRuleRecord } from '@/src/roomOs/rules/store/types';

export async function deactivateRule(input: DeactivateRuleInput): Promise<PublishedRuleRecord> {
  const effectiveTo = input.effectiveTo ? new Date(input.effectiveTo) : new Date();

  const [updated] = await db
    .update(roomOsPublishedRules)
    .set({
      status: 'inactive',
      effectiveTo,
      publishedBy: input.publishedBy,
      sourceRef: input.sourceRef ?? 'rules/v1/deactivate',
      publishedAt: new Date(),
    })
    .where(eq(roomOsPublishedRules.id, input.publicationId))
    .returning();

  if (!updated) {
    throw new Error(`Publication ${input.publicationId} not found`);
  }

  return mapPublishedRuleRow(updated);
}
